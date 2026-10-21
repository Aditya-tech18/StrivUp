/**
 * src/lib/strivy/push/http.ts
 *
 * The HTTP handlers for STRIVY push, with every dependency injected so tests
 * can run them without Supabase or a push service. The route files only wire
 * in the real ones.
 *
 *   POST/DELETE /api/strivy/push/subscribe   the signed-in user's own endpoint
 *   GET/PUT     /api/strivy/push/preferences daily nudges on/off and push language
 *   GET/POST    /api/strivy/push/cron        the scheduler (CRON_SECRET only)
 *   POST        /api/strivy/push/dev         development-only test tools
 *
 * The user is always the session's; no route takes a user id from the client.
 */
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFacts } from "../context";
import { authorizeStrivyRequest } from "../pipeline";
import { CHECKIN_NEEDS } from "../proactive";
import { PUSH_TITLE, PUSH_WINDOWS, istDay, type PushWindow } from "./config";
import {
  SEND_HINT,
  categorizeStoreError,
  checkPushServer,
  isNotSetUpCode,
  type PushCheck,
  type PushErrorCategory,
  type PushProblem,
} from "./diagnostics";
import { planForUser, runPushWindow, type UserRunResult } from "./scheduler";
import type { PushSender } from "./sender";
import { asPushLanguage, supabasePushStore, type PushStore } from "./store";

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

/**
 * Wraps a handler so an unexpected failure (Supabase or the push service
 * unreachable, a bug) returns a plain 500. Error details stay in the server
 * log; nothing internal reaches the browser.
 */
export async function withFallback(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    // The category is safe to log; the raw message only outside production.
    const problem = categorizeStoreError(err);
    console.error(
      `[strivy-push] handler failed (${problem.category})`,
      process.env.NODE_ENV === "production"
        ? err instanceof Error
          ? err.name
          : "error"
        : err instanceof Error
          ? err.message.slice(0, 200)
          : "error"
    );
    return json(500, { error: "Something went sideways. Try again in a moment." });
  }
}

/**
 * A configuration or database problem as a response: the category and a
 * plain explanation naming the variable or step (never a value), logged once
 * on the server too.
 */
function problemResponse(status: number, problem: PushProblem, scope: string): Response {
  console.error(`[strivy-push] ${scope}: ${problem.category}: ${problem.detail}`);
  return json(status, { error: problem.detail, category: problem.category });
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export function parseSubscription(
  body: unknown
): { endpoint: string; p256dh: string; auth: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { endpoint, keys } = body as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (typeof endpoint !== "string" || endpoint.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (typeof p256dh !== "string" || p256dh.length > 200 || !B64URL.test(p256dh)) return null;
  if (typeof auth !== "string" || auth.length > 100 || !B64URL.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

/** The migration isn't applied yet (missing function or table). */
function notSetUp(error: { code?: string; message?: string }): boolean {
  return isNotSetUpCode(error.code);
}

const NOT_SET_UP = {
  error: "Push notifications aren't set up on the server yet.",
  category: "database_not_set_up" as const,
};

export interface UserDeps {
  isEnabled: () => boolean;
  getSupabase: () => Promise<SupabaseClient>;
}

export async function handleSubscribe(request: Request, deps: UserDeps): Promise<Response> {
  const auth = await authorizeStrivyRequest(deps);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Send the subscription as JSON." });
  }

  if (request.method === "DELETE") {
    const endpoint = (body as { endpoint?: unknown })?.endpoint;
    if (typeof endpoint !== "string") return json(400, { error: "Missing endpoint." });
    const { error } = await auth.supabase
      .from("strivy_push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", auth.userId);
    if (error) {
      return notSetUp(error)
        ? json(503, NOT_SET_UP)
        : json(500, { error: "Couldn't remove the subscription.", category: "database_error" });
    }
    return json(200, { ok: true });
  }

  const sub = parseSubscription(body);
  if (!sub)
    return json(400, {
      error: "That isn't a valid push subscription.",
      category: "invalid_subscription",
    });
  const ua = request.headers.get("user-agent")?.slice(0, 300) ?? null;
  const { error } = await auth.supabase.rpc("strivy_save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: sub.p256dh,
    p_auth: sub.auth,
    p_user_agent: ua,
  });
  if (error) {
    console.error(
      `[strivy-push] subscribe: ${notSetUp(error) ? "database_not_set_up" : "database_error"}`,
      error.code ?? ""
    );
    return notSetUp(error)
      ? json(503, NOT_SET_UP)
      : json(500, { error: "Couldn't save the subscription.", category: "database_error" });
  }
  return json(200, { ok: true });
}

/**
 * GET returns the user's push settings; PUT changes any of:
 *   nudges        daily STRIVY nudges on/off ("enabled" is accepted too)
 *   language      push language: "en" | "hinglish" | "hi" | "bho", or "auto"
 *   chatLanguage  the language the user last chatted in (sent by the panel)
 * Turning push on or off for a device is the subscribe route, not this one.
 */
export async function handlePreferences(request: Request, deps: UserDeps): Promise<Response> {
  const auth = await authorizeStrivyRequest(deps);
  if (!auth.ok) return auth.response;
  const table = auth.supabase.from("strivy_notification_preferences");

  if (request.method === "PUT") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "Send preferences as JSON." });
    }
    const input = (typeof body === "object" && body !== null ? body : {}) as Record<
      string,
      unknown
    >;
    const row: Record<string, unknown> = {};
    const nudges = input.nudges ?? input.enabled;
    if (nudges !== undefined) {
      if (typeof nudges !== "boolean") return json(400, { error: "nudges must be true or false." });
      row.push_enabled = nudges;
    }
    if (input.language !== undefined) {
      const language = input.language === "auto" ? null : asPushLanguage(input.language);
      if (input.language !== "auto" && !language)
        return json(400, { error: "language must be en, hinglish, hi, bho or auto." });
      row.language = language;
    }
    if (input.chatLanguage !== undefined) {
      const chatLanguage = asPushLanguage(input.chatLanguage);
      if (!chatLanguage)
        return json(400, { error: "chatLanguage must be en, hinglish, hi or bho." });
      row.chat_language = chatLanguage;
    }
    if (Object.keys(row).length === 0) return json(400, { error: "Nothing to change." });

    const { error } = await table.upsert(
      { user_id: auth.userId, ...row, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (error)
      return json(notSetUp(error) ? 503 : 500, { error: "Couldn't save your preference." });
    return json(200, { ok: true });
  }

  const { data, error } = await table
    .select("push_enabled, max_per_day, language, chat_language")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) return json(notSetUp(error) ? 503 : 500, { error: "Couldn't load your preference." });
  return json(200, {
    nudges: data ? data.push_enabled === true : true,
    language: data ? asPushLanguage(data.language) : null,
    chatLanguage: data ? asPushLanguage(data.chat_language) : null,
    maxPerDay: data ? Number(data.max_per_day) : 3,
  });
}

/* ── Scheduler (server to server) ────────────────────────────────────────── */

export interface SchedulerDeps {
  isEnabled: () => boolean;
  cronSecret: () => string | undefined;
  /** Service-role client. Server only; never reaches a browser. */
  getAdmin: () => SupabaseClient | null;
  getSender: () => PushSender | null;
  now?: () => Date;
  /** Tests inject a store; production uses the Supabase tables. */
  getStore?: (admin: SupabaseClient) => PushStore;
  /**
   * The first VAPID/service-role problem, if any (diagnostics.ts). The route
   * wires in the real check; without it only "missing" is detected.
   */
  configProblem?: () => PushProblem | null;
}

function bearerMatches(request: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function summarize(results: UserRunResult[]) {
  const reasons: Record<string, number> = {};
  const errors: Partial<Record<PushErrorCategory, number>> = {};
  for (const r of results) {
    // Skip reasons ("daily limit", "outside the push windows") are counted as
    // is; failure messages are counted by category so nothing internal leaks.
    if (r.outcome === "failed") {
      const c = r.category ?? "send_failed";
      errors[c] = (errors[c] ?? 0) + 1;
    } else if (r.reason) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  }
  const failed = results.filter((r) => r.outcome === "failed").length;
  const sent = results.filter((r) => r.outcome === "sent").length;
  return {
    ok: failed === 0,
    users: results.length,
    sent,
    failed,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    reasons,
    errors,
  };
}

/** Missing (not invalid) admin client or sender, when no config check is wired in. */
function missingProblem(admin: unknown, sender: unknown): PushProblem | null {
  if (!sender)
    return {
      category: "missing_vapid",
      detail:
        "VAPID keys are not configured: set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.",
    };
  if (!admin)
    return {
      category: "missing_service_role",
      detail:
        "SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is not set; the push scheduler needs it.",
    };
  return null;
}

function readOnlyFacts(admin: SupabaseClient) {
  return (userId: string) => loadFacts(admin, userId, CHECKIN_NEEDS, { readOnly: true });
}

/**
 * One scheduler pass. Status codes say what happened:
 *   200 ran, nothing failed · 207 some deliveries failed · 502 every
 *   attempted delivery failed · 401 wrong/missing bearer · 404 push off ·
 *   503 server not configured (missing CRON_SECRET, VAPID, service role, or
 *   the push tables aren't in the database).
 * Configuration problems are never reported as success, and the response
 * carries a category, never a secret or a user id.
 */
export async function handleCron(request: Request, deps: SchedulerDeps): Promise<Response> {
  if (!deps.isEnabled()) return json(404, { error: "Not found" });
  const secret = deps.cronSecret();
  // Without a usable secret nothing can authenticate: say so plainly.
  if (!secret || secret.length < 16) {
    return problemResponse(
      503,
      {
        category: "missing_cron_secret",
        detail: secret
          ? "CRON_SECRET is too short (16+ characters) on this server."
          : "CRON_SECRET is not set on this server.",
      },
      "cron"
    );
  }
  if (!bearerMatches(request, secret)) {
    console.warn("[strivy-push] cron: unauthorized (bearer missing or wrong)");
    return json(401, { error: "Unauthorized", category: "unauthorized" });
  }
  const admin = deps.getAdmin();
  const sender = deps.getSender();
  const config = deps.configProblem?.() ?? missingProblem(admin, sender);
  if (config || !admin || !sender) {
    return problemResponse(503, config ?? missingProblem(admin, sender)!, "cron");
  }

  const store = (deps.getStore ?? supabasePushStore)(admin);
  // Read the population first: a missing table is a setup problem, not a bug.
  let userIds: string[];
  try {
    userIds = await store.listSubscribedUsers();
  } catch (err) {
    const problem = categorizeStoreError(err);
    return problemResponse(problem.category === "database_error" ? 502 : 503, problem, "cron");
  }

  const results = await runPushWindow({
    now: deps.now?.() ?? new Date(),
    store,
    sender,
    loadFacts: readOnlyFacts(admin),
    userIds,
  });
  // Counts and categories only: no user ids or message text in the response or logs.
  const summary = summarize(results);
  if (summary.failed > 0)
    console.error("[strivy-push] cron: deliveries failed", JSON.stringify(summary.errors));
  const status = summary.failed === 0 ? 200 : summary.sent > 0 ? 207 : 502;
  return json(status, summary);
}

/* ── Development-only tools ─────────────────────────────────────────────── */

export interface DevDeps extends UserDeps {
  devToolsEnabled: () => boolean;
  getAdmin: () => SupabaseClient | null;
  getSender: () => PushSender | null;
  now?: () => Date;
  getStore?: (admin: SupabaseClient) => PushStore;
  configProblem?: () => PushProblem | null;
  /** Server-side checklist for { action: "diagnose" } (diagnostics.ts). */
  serverChecks?: () => PushCheck[];
}

export const TEST_PUSH_BODY = "This is a test STRIVY notification (development only).";

/**
 * { action: "test" } sends one test push to the caller's own devices; it is
 * not logged and doesn't count toward the daily limit.
 * { action: "run", window? } runs the real scheduler for the caller only.
 * { action: "preview", window? } shows what it would send, and why or why not,
 * without sending (event, candidates, chosen message, skip reason).
 * { action: "history" } lists the caller's own pushes from the last 7 days.
 * Every action touches the signed-in caller only.
 */
export async function handleDev(request: Request, deps: DevDeps): Promise<Response> {
  if (!deps.devToolsEnabled()) return json(404, { error: "Not found" });
  const auth = await authorizeStrivyRequest(deps);
  if (!auth.ok) return auth.response;

  let body: { action?: unknown; window?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Default action below.
  }

  const admin = deps.getAdmin();
  const sender = deps.getSender();

  // Every server-side requirement, pass/fail with a plain fix. Values never.
  if (body.action === "diagnose") {
    const checks = (deps.serverChecks ?? checkPushServer)().map((c) => ({
      id: c.id,
      label: c.label,
      ok: c.ok,
      ...(c.problem ? { category: c.problem.category, fix: c.problem.detail } : {}),
    }));
    let devices: number | null = null;
    let database: { ok: boolean; category?: PushErrorCategory; fix?: string } = { ok: false };
    if (admin) {
      try {
        devices = (await (deps.getStore ?? supabasePushStore)(admin).listSubscriptions(auth.userId))
          .length;
        database = { ok: true };
      } catch (err) {
        const p = categorizeStoreError(err);
        database = { ok: false, category: p.category, fix: p.detail };
      }
    } else {
      database = {
        ok: false,
        category: "missing_service_role",
        fix: "Needs the service-role key.",
      };
    }
    return json(200, { checks, database, devices });
  }

  const config = deps.configProblem?.() ?? missingProblem(admin, sender);
  if (config || !admin || !sender) return problemResponse(503, config!, "dev");
  const store = (deps.getStore ?? supabasePushStore)(admin);

  const forced =
    typeof body.window === "string" && Object.hasOwn(PUSH_WINDOWS, body.window)
      ? (body.window as PushWindow)
      : undefined;

  // What the scheduler would send the caller now, without claiming or sending.
  if (body.action === "preview") {
    const plan = await planForUser(auth.userId, {
      now: deps.now?.() ?? new Date(),
      store,
      sender,
      loadFacts: readOnlyFacts(admin),
      forceWindow: forced,
    });
    return json(200, {
      outcome: plan.outcome,
      skipReason: plan.reason,
      window: plan.window,
      localDate: plan.localDate,
      devices: plan.subscriptions,
      candidates: plan.candidates,
      selected: plan.selected
        ? { type: plan.selected.type, dedupeKey: plan.selected.dedupeKey, url: plan.selected.url }
        : null,
      message: plan.message,
      sentToday: plan.today.length,
    });
  }

  // The caller's own push history for the last 7 days.
  if (body.action === "history") {
    const now = deps.now?.() ?? new Date();
    const since = istDay(new Date(now.getTime() - 6 * 86_400_000));
    return json(200, { history: await store.recentLog(auth.userId, since) });
  }

  if (body.action === "run") {
    const window = forced;
    const [result] = await runPushWindow({
      now: deps.now?.() ?? new Date(),
      store,
      sender,
      loadFacts: readOnlyFacts(admin),
      userIds: [auth.userId],
      forceWindow: window,
    });
    return json(200, { result });
  }

  let subs: Awaited<ReturnType<PushStore["listSubscriptions"]>>;
  try {
    subs = await store.listSubscriptions(auth.userId);
  } catch (err) {
    const problem = categorizeStoreError(err);
    return problemResponse(problem.category === "database_error" ? 502 : 503, problem, "dev test");
  }
  if (subs.length === 0)
    return json(409, {
      error: "Turn on notifications in this browser first.",
      category: "no_subscription",
    });
  let delivered = 0;
  const failures: Partial<Record<PushErrorCategory, number>> = {};
  for (const sub of subs) {
    const r = await sender.send(sub, {
      title: PUSH_TITLE,
      body: TEST_PUSH_BODY,
      url: "/feed",
      tag: "strivy-test",
    });
    if (r.ok) delivered++;
    else {
      const c = r.category ?? "send_failed";
      failures[c] = (failures[c] ?? 0) + 1;
      if (r.gone) await store.deleteSubscription(auth.userId, sub.id);
    }
  }
  // No fake success: if nothing was delivered, the test failed.
  if (delivered === 0) {
    const category = (Object.keys(failures)[0] as keyof typeof SEND_HINT) ?? "send_failed";
    console.error(`[strivy-push] dev test: ${category}`, JSON.stringify(failures));
    return json(502, {
      error: SEND_HINT[category] ?? SEND_HINT.send_failed,
      category,
      delivered,
      devices: subs.length,
      failures,
    });
  }
  return json(200, { delivered, devices: subs.length, failures });
}

/* ── The signed-in user's own recent STRIVY notifications (the bell list) ─ */

export interface HistoryItem {
  id: string;
  body: string;
  type: string;
  url: string;
  sentAt: string;
}

/**
 * GET /api/strivy/push/history: the caller's own delivered STRIVY pushes
 * from the last 7 days, newest first. Uses the caller's session (RLS:
 * strivy_push_log_select_own), never the service role.
 */
export async function handleHistory(_request: Request, deps: UserDeps): Promise<Response> {
  const auth = await authorizeStrivyRequest(deps);
  if (!auth.ok) return auth.response;
  const since = istDay(new Date(Date.now() - 6 * 86_400_000));
  const { data, error } = await auth.supabase
    .from("strivy_push_log")
    .select("id, body, push_type, url, status, sent_at, created_at")
    .eq("user_id", auth.userId)
    .eq("status", "sent")
    .gte("local_date", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    return notSetUp(error)
      ? json(503, NOT_SET_UP)
      : json(500, { error: "Couldn't load your notifications.", category: "database_error" });
  }
  const items: HistoryItem[] = (data ?? []).map((r) => ({
    id: String(r.id),
    body: String(r.body ?? ""),
    type: String(r.push_type ?? ""),
    url: typeof r.url === "string" ? r.url : "/feed",
    sentAt: String(r.sent_at ?? r.created_at ?? ""),
  }));
  return json(200, { items });
}
