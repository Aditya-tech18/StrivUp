import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * proxy.ts — the single routing / session-validation layer for StrivUp.
 *
 * Next.js 16 renamed the `middleware` convention to `proxy`. The file must sit
 * beside `app/`, which in this repo means `src/proxy.ts` — a `proxy.ts` at the
 * repo root is silently ignored, which is exactly how the old root copy ended
 * up dead while `src/middleware.ts` quietly served all traffic.
 *
 * Do not add a `middleware.ts` back. One routing layer, this file.
 *
 * Responsibilities (in order):
 *  1. Stray OAuth code interception: codes that land on `/?code=…` instead of
 *     the callback route are forwarded to /auth/callback with the right `next`.
 *  2. Session refresh: re-validates the Supabase auth token so server
 *     components can call getUser() and get a real user.
 *  3. Auth guard: unauthenticated visitors to app routes go to /login.
 *  4. Deactivation gate: deactivated accounts are held on /deactivated, and
 *     active accounts are bounced off /deactivated back to /feed.
 *
 * NOTE: this is a behaviour-preserving port of the previous src/middleware.ts.
 * The profile-completion gate that lived in the dead root proxy.ts is
 * deliberately NOT included — it has never run in production, and the live data
 * (user_interests is empty) means enabling it would lock out every existing
 * account. That gate is a separate, deliberate decision.
 */

/** App routes that require an authenticated, active account. */
const APP_ROUTE_PREFIXES = [
  "/feed",
  "/explore",
  "/challenges",
  "/quests",
  "/profile",
  // Public profiles. Listed here deliberately: `profiles` has a SELECT policy of
  // USING (true) for role `public`, so without an auth gate /u/<handle> would
  // render to anonymous visitors. The follow button needs a viewer anyway.
  "/u",
  // Invite links. Gated so a signed-out tap is sent to /login with
  // ?redirectTo=/join/<code> and lands back here afterwards, instead of the
  // page having to handle an anonymous visitor itself.
  "/join",
  "/settings",
  "/alerts",
  "/creator",
];

export async function proxy(request: NextRequest) {
  const { pathname, searchParams, search, origin } = request.nextUrl;

  // ── 1. Intercept stray OAuth codes landing at root /?code=… ───────────────
  const code = searchParams.get("code");
  if (code && pathname === "/") {
    const isBusinessFlow =
      request.cookies.get("strivup_business_intent")?.value === "1";
    const next = isBusinessFlow ? "/business" : "/feed";
    const callbackUrl = new URL(`${origin}/auth/callback`);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("next", next);
    return NextResponse.redirect(callbackUrl);
  }

  // ── 2. Refresh the Supabase session on every matched request ──────────────
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to both the request and the outgoing response so the
          // refreshed token is visible to the rest of the pipeline.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Always getUser(), never getSession(): getUser() validates the token
  // server-side, getSession() only reads the cookie and can be spoofed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAppRoute = APP_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));

  // ── 3. Auth guard ─────────────────────────────────────────────────────────
  // Carry the intended destination so an invite link survives the sign-in
  // detour. Without this a shared /join/<code> link silently becomes /feed and
  // the person never joins the challenge they were invited to.
  if (!user && isAppRoute) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("redirectTo", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // ── 4. Deactivation gate ──────────────────────────────────────────────────
  if (user && isAppRoute && pathname !== "/deactivated") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_deactivated")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_deactivated === true) {
      return NextResponse.redirect(new URL("/deactivated", origin));
    }
  }

  // An active account has no business sitting on /deactivated.
  if (user && pathname === "/deactivated") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_deactivated")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.is_deactivated !== true) {
      return NextResponse.redirect(new URL("/feed", origin));
    }
  }

  // ── 5. Pass through with refreshed session cookies ────────────────────────
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
