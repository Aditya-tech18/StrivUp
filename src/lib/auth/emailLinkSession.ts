"use client";

/**
 * src/lib/auth/emailLinkSession.ts — turn whatever an email link hands us into
 * a usable session, on the client.
 *
 * WHY THIS EXISTS
 * A Supabase email link can arrive in one of four shapes, and which one you
 * get depends on the email template and the flow type, neither of which is
 * visible from the code:
 *
 *   1. #access_token=…&refresh_token=…   implicit flow. The default
 *      {{ .ConfirmationURL }} template produces this: Supabase verifies the
 *      token itself and hands the session back in the URL *fragment*.
 *   2. ?code=…                            PKCE flow.
 *   3. ?token_hash=…&type=…               the template points straight at us.
 *   4. nothing, but a session already exists, because supabase-js has
 *      detectSessionInUrl on by default and consumed the fragment before any
 *      of our code ran.
 *
 * The reset screen used to assume (4) only, and /auth/confirm used to assume
 * (3) only and redirect to /login?error=invalid_link otherwise. Between them
 * a perfectly valid recovery link from the default template fell down the
 * gap: the fragment never reaches the server, so the server saw no
 * token_hash, called the link invalid, and bounced the person to the login
 * page before the browser could use the session sitting in the fragment.
 * That is the "That link isn't valid" screen.
 *
 * Handling all four here means the flow no longer depends on which email
 * template a project happens to have.
 *
 * THE RACE, AND WHY readUrlCredentials IS SEPARATE
 * supabase-js has detectSessionInUrl on by default, so the moment a browser
 * client is constructed it starts consuming the fragment itself. Both it and
 * this module were reaching for the same single-use token, and whichever
 * arrived second found an empty hash: the screen showed "This link has
 * expired" perhaps half the time, on an entirely valid link. That is the kind
 * of bug that looks like a flaky email provider for weeks.
 *
 * So the credentials are read in one synchronous call BEFORE the client is
 * created, and kept. Then we give supabase-js a moment to finish its own
 * initialisation and use the session it produced, if it produced one, and
 * only fall back to the copy we held when it did not. Nobody loses a race
 * they are not in.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailOtpType } from "@supabase/supabase-js";

export type LinkSessionResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "missing" };

export interface UrlCredentials {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  tokenHash?: string;
  type?: string;
  failed?: boolean;
}

/**
 * Read whatever an email link put in the URL.
 *
 * Synchronous on purpose, and must be called BEFORE createClient() so
 * supabase-js cannot clear the fragment first. See THE RACE above.
 *
 * Cached per path, which is load-bearing rather than an optimisation. React
 * runs effects twice in development StrictMode: the first pass read the
 * fragment and created a client, that client cleared the fragment, and the
 * second pass then read an empty URL and concluded the link was expired. The
 * second pass is the one whose result survives, so a valid recovery link
 * showed "This link has expired" every single time in development, and
 * intermittently in production wherever anything else caused a remount.
 *
 * Capturing once per path means every later caller, however many times React
 * re-runs the effect, gets the values that were actually in the link.
 */
let cache: { path: string; creds: UrlCredentials } | null = null;

export function readUrlCredentials(): UrlCredentials {
  if (typeof window === "undefined") return {};

  const path = window.location.pathname;
  if (cache && cache.path === path) return cache.creds;

  const fragment = readFragment();
  const query = new URLSearchParams(window.location.search);

  const creds: UrlCredentials = {
    accessToken: fragment.access_token,
    refreshToken: fragment.refresh_token,
    code: query.get("code") ?? undefined,
    tokenHash: query.get("token_hash") ?? undefined,
    type: query.get("type") ?? fragment.type ?? undefined,
    failed: Boolean(fragment.error || fragment.error_code || fragment.error_description),
  };

  cache = { path, creds };
  return creds;
}

/** Poll for a session supabase-js may still be establishing from the URL. */
async function waitForOwnSession(
  supabase: SupabaseClient,
  ms = 2500
): Promise<boolean> {
  const deadline = Date.now() + ms;
  for (;;) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 120));
  }
}

/** Reads the fragment as a query string. Empty object when there is none. */
function readFragment(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return {};
  return Object.fromEntries(new URLSearchParams(raw));
}

/**
 * Strip the credentials out of the address bar once they are spent.
 *
 * They are single-use and already exchanged by this point, but leaving them
 * in the URL means they end up in history, in a screenshot, or in whatever
 * the person pastes when asking for help.
 */
function scrubUrl() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname);
}

export async function establishSessionFromEmailLink(
  supabase: SupabaseClient,
  creds: UrlCredentials
): Promise<LinkSessionResult> {
  // A link that already failed upstream carries the reason, not tokens.
  if (creds.failed) {
    scrubUrl();
    return { ok: false, reason: "expired" };
  }

  const hadCredentials = Boolean(
    creds.accessToken || creds.code || creds.tokenHash
  );

  /* (4) Let supabase-js finish with the URL first. When detectSessionInUrl
     wins the race this is the path every time, and spending our copy of the
     token afterwards would only fail, because it is single use. */
  if (await waitForOwnSession(supabase, hadCredentials ? 2500 : 0)) {
    scrubUrl();
    return { ok: true };
  }

  // (1) implicit flow, from the copy taken before the client existed.
  if (creds.accessToken && creds.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
    });
    scrubUrl();
    return error ? { ok: false, reason: "expired" } : { ok: true };
  }

  // (2) PKCE.
  if (creds.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(creds.code);
    scrubUrl();
    return error ? { ok: false, reason: "expired" } : { ok: true };
  }

  // (3) token hash straight from the template.
  if (creds.tokenHash && creds.type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: creds.tokenHash,
      type: creds.type as EmailOtpType,
    });
    scrubUrl();
    return error ? { ok: false, reason: "expired" } : { ok: true };
  }

  // Credentials were present but none of them worked; otherwise the page was
  // opened directly with no link at all.
  return { ok: false, reason: hadCredentials ? "expired" : "missing" };
}
