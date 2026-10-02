/**
 * src/lib/activity/service.ts — activity sync orchestration (SERVER ONLY).
 *
 * Implements the synchronisation pipeline from spec §27:
 *
 *   1. identify the connected provider          -> getConnection
 *   2. retrieve eligible activity               -> provider.fetchActivity
 *   3. normalise                                -> provider returns NormalizedActivity[]
 *   4. store                                    -> ingest_activity_records (RPC)
 *   5. deduplicate                              -> unique (user, provider, dedupe_key)
 *   6. recalculate quest progress               -> inside the RPC
 *   7. mark eligible tasks complete             -> inside the RPC
 *   8. trigger reward eligibility               -> evaluate_quest_completion
 *   9. write an audit record                    -> activity_verification_events
 *
 * Steps 4-9 all happen inside one Postgres function so they share a
 * transaction: a sync either lands completely or not at all.
 *
 * Token refresh is handled here because it is the one thing the database
 * cannot do — Postgres cannot make an OAuth call.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, type ActivityProvider, type TokenSet } from "./providers";
import type { ActivityProviderId } from "./types";

/** Refresh a token this many ms before it actually expires. */
const REFRESH_SKEW_MS = 60_000;

export interface SyncResult {
  provider: string;
  inserted: number;
  updated: number;
  flagged: number;
  progressRows: number;
  fetched: number;
}

interface ConnectionRow {
  id: string;
  user_id: string;
  provider: ActivityProviderId;
  status: string;
  timezone: string;
  last_synced_at: string | null;
}

/* ── Connection lifecycle ────────────────────────────────────────────────── */

export async function saveConnection(
  userId: string,
  provider: ActivityProviderId,
  tokens: TokenSet,
  timezone = "Asia/Kolkata"
): Promise<string> {
  const admin = createAdminClient();

  const { data: conn, error } = await admin
    .from("activity_connections")
    .upsert(
      {
        user_id: userId,
        provider,
        external_user_id: tokens.externalUserId,
        status: "connected",
        scopes: tokens.scopes,
        timezone,
        disconnected_at: null,
        last_sync_error: null,
      },
      { onConflict: "user_id,provider" }
    )
    .select("id")
    .single();

  if (error || !conn) {
    throw new Error(`could not save activity connection: ${error?.message ?? "no row"}`);
  }

  const { error: secretError } = await admin.from("activity_connection_secrets").upsert({
    connection_id: conn.id,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_expires_at: tokens.expiresAt,
    updated_at: new Date().toISOString(),
  });

  /* AGENTS.md: check the error on every write whose result you report back. */
  if (secretError) {
    throw new Error(`could not store provider tokens: ${secretError.message}`);
  }

  const { error: eventError } = await admin.from("activity_verification_events").insert({
    user_id: userId,
    event_type: "PROVIDER_CONNECTED",
    metadata: { provider },
  });
  if (eventError) console.error("[saveConnection] audit write failed:", eventError.message);

  return conn.id;
}

export async function disconnectProvider(
  userId: string,
  provider: ActivityProviderId
): Promise<void> {
  const admin = createAdminClient();

  const { data: conn } = await admin
    .from("activity_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (!conn) return;

  /* Delete the tokens outright — "disconnect" must actually revoke our ability
     to read, not merely hide the row (spec §22). Historical activity_records
     are kept so completed quests stay auditable. */
  const { error: secretError } = await admin
    .from("activity_connection_secrets")
    .delete()
    .eq("connection_id", conn.id);
  if (secretError) throw new Error(`could not clear provider tokens: ${secretError.message}`);

  const { error } = await admin
    .from("activity_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString() })
    .eq("id", conn.id);
  if (error) throw new Error(`could not disconnect provider: ${error.message}`);

  await admin.from("activity_verification_events").insert({
    user_id: userId,
    event_type: "PROVIDER_DISCONNECTED",
    metadata: { provider },
  });
}

/* ── Token handling ──────────────────────────────────────────────────────── */

/**
 * Returns a usable access token, refreshing it first if it is at or near
 * expiry. Persists the refreshed token so the next call is cheap.
 */
async function getFreshAccessToken(
  connectionId: string,
  provider: ActivityProvider
): Promise<string> {
  const admin = createAdminClient();

  const { data: secret, error } = await admin
    .from("activity_connection_secrets")
    .select("access_token, refresh_token, token_expires_at")
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (error) throw new Error(`could not read provider tokens: ${error.message}`);
  if (!secret?.access_token) throw new Error("provider is not connected");

  const expiresAt = secret.token_expires_at ? Date.parse(secret.token_expires_at) : null;
  const stillValid = expiresAt === null || expiresAt - REFRESH_SKEW_MS > Date.now();

  if (stillValid) return secret.access_token;

  if (!secret.refresh_token) {
    await admin
      .from("activity_connections")
      .update({ status: "expired", last_sync_error: "token expired, no refresh token" })
      .eq("id", connectionId);
    throw new Error("provider token expired and cannot be refreshed — reconnect required");
  }

  const refreshed = await provider.refresh(secret.refresh_token);

  const { error: writeError } = await admin
    .from("activity_connection_secrets")
    .update({
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken,
      token_expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("connection_id", connectionId);

  if (writeError) throw new Error(`could not persist refreshed token: ${writeError.message}`);

  return refreshed.accessToken;
}

/* ── Sync ────────────────────────────────────────────────────────────────── */

function localDateString(timezone: string, offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  /* en-CA gives YYYY-MM-DD, which is what the provider APIs and our date
     columns both want. */
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Pull activity for one user+provider and fold it into quest progress.
 *
 * `days` is how far back to re-read. A small overlap is deliberate: providers
 * revise a day's total after the fact (a watch syncs late in the evening), and
 * because ingestion is idempotent, re-reading is free and strictly safer than
 * trusting the first number we saw.
 */
export async function syncUserActivity(
  userId: string,
  providerId: ActivityProviderId,
  days = 7
): Promise<SyncResult> {
  const admin = createAdminClient();
  const provider = getProvider(providerId);

  if (!provider) throw new Error(`unknown provider: ${providerId}`);
  if (!provider.isConfigured()) throw new Error(`${provider.label} is not configured on this deployment`);

  const { data: conn, error: connError } = await admin
    .from("activity_connections")
    .select("id, user_id, provider, status, timezone, last_synced_at")
    .eq("user_id", userId)
    .eq("provider", providerId)
    .maybeSingle<ConnectionRow>();

  if (connError) throw new Error(`could not load connection: ${connError.message}`);
  if (!conn) throw new Error(`${provider.label} is not connected`);
  if (conn.status !== "connected") throw new Error(`${provider.label} connection is ${conn.status}`);

  const timezone = conn.timezone || "Asia/Kolkata";

  try {
    const accessToken = await getFreshAccessToken(conn.id, provider);

    const records = await provider.fetchActivity(accessToken, {
      from: localDateString(timezone, -Math.abs(days)),
      to: localDateString(timezone, 0),
      timezone,
    });

    const { data, error } = await admin.rpc("ingest_activity_records", {
      p_user_id: userId,
      p_provider: providerId,
      p_source: provider.source,
      p_records: records,
    });

    /* AGENTS.md is explicit: check the error on every write whose result you
       report to the caller. Reporting "synced" off an unchecked write is the
       exact bug that bit review-proof. */
    if (error) throw new Error(`ingest failed: ${error.message}`);

    const result = (data ?? {}) as Record<string, number>;

    return {
      provider: providerId,
      fetched: records.length,
      inserted: result.inserted ?? 0,
      updated: result.updated ?? 0,
      flagged: result.flagged ?? 0,
      progressRows: result.progress_rows ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await admin
      .from("activity_connections")
      .update({ last_sync_status: "failed", last_sync_error: message })
      .eq("id", conn.id);

    await admin.from("activity_sync_logs").insert({
      user_id: userId,
      connection_id: conn.id,
      provider: providerId,
      status: "failed",
      error_message: message,
      finished_at: new Date().toISOString(),
    });

    await admin.from("activity_verification_events").insert({
      user_id: userId,
      event_type: "SYNC_FAILED",
      metadata: { provider: providerId, error: message },
    });

    throw err;
  }
}

/* ── Device push (in-app pedometer) ─────────────────────────────────────────
 *
 * The in-app step counter is push, not pull: the phone's accelerometer counts
 * while StrivUp is open and the browser sends the running total up. There are
 * no OAuth tokens, so there is no activity_connection_secrets row — the
 * connection exists purely to record the source and the user's timezone.
 */

/** Providers whose data is pushed by the device rather than fetched. */
export type PushProvider = Extract<
  ActivityProviderId,
  "device_sensor" | "health_connect" | "healthkit"
>;

/** Records that a device is reporting activity for this user. Idempotent. */
export async function registerNativeConnection(
  userId: string,
  provider: PushProvider,
  timezone = "Asia/Kolkata"
): Promise<string> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("activity_connections")
    .upsert(
      {
        user_id: userId,
        provider,
        status: "connected",
        scopes: ["steps"],
        timezone,
        disconnected_at: null,
        last_sync_error: null,
      },
      { onConflict: "user_id,provider" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`could not register health connection: ${error?.message ?? "no row"}`);
  }

  const { error: eventError } = await admin.from("activity_verification_events").insert({
    user_id: userId,
    event_type: "PROVIDER_CONNECTED",
    metadata: { provider, native: true },
  });
  if (eventError) console.error("[registerNativeConnection] audit write failed:", eventError.message);

  return data.id;
}

/** Upper bound on a day's step count before we refuse the row outright. */
const MAX_DAILY_STEPS = 200_000;
/** Most day-buckets accepted in one push. */
const MAX_NATIVE_RECORDS = 90;

export interface NativeStepRecord {
  local_date: string;
  steps: number;
}

/**
 * Ingests step totals pushed from the device.
 *
 * SECURITY POSTURE — read this before changing anything here.
 *
 * For an OAuth provider the server fetches the numbers itself, so the client
 * never touches them. A phone cannot work that way: it has to send what the OS
 * gave it. That makes this the one path where client-supplied values enter the
 * system, so the payload is treated as untrusted:
 *
 *   - only `local_date` and `steps` are read; every other field the client may
 *     have sent is ignored
 *   - `dedupe_key`, `started_at`, `ended_at`, `source` and
 *     `verification_status` are all derived server-side
 *   - dates must be real, and may not be in the future or absurdly old
 *   - step counts must be finite, non-negative integers under a hard ceiling
 *   - the existing fraud heuristics still run inside ingest_activity_records
 *
 * This is meaningfully stronger than trusting the client, and still weaker
 * than a server-to-server pull. A rooted device running a modified build could
 * submit plausible-looking numbers; that is inherent to reading from a device
 * and is why suspicious values are flagged for review rather than trusted.
 */
export async function ingestNativeActivity(
  userId: string,
  provider: PushProvider,
  records: unknown,
  timezone = "Asia/Kolkata"
): Promise<{
  inserted: number;
  updated: number;
  flagged: number;
  accepted: number;
  storedToday: number;
}> {
  const admin = createAdminClient();

  if (!Array.isArray(records)) throw new Error("records must be an array");
  if (records.length > MAX_NATIVE_RECORDS) {
    throw new Error(`too many records — send at most ${MAX_NATIVE_RECORDS} days per sync`);
  }

  const today = localDateString(timezone, 0);
  const oldest = localDateString(timezone, -400);
  const seen = new Set<string>();
  const clean: Record<string, unknown>[] = [];

  for (const raw of records as Record<string, unknown>[]) {
    const date = String(raw?.local_date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) continue;
    /* A phone with a wrong clock must not be able to bank days ahead, and
       nothing older than the retention window is useful. */
    if (date > today || date < oldest) continue;
    if (seen.has(date)) continue;

    const steps = Number(raw?.steps);
    if (!Number.isFinite(steps) || steps < 0) continue;
    if (steps > MAX_DAILY_STEPS) continue;

    seen.add(date);
    clean.push({
      dedupe_key: `steps:${date}`,
      external_id: null,
      activity_type: "steps",
      granularity: "daily",
      local_date: date,
      started_at: `${date}T00:00:00.000Z`,
      ended_at: `${date}T23:59:59.999Z`,
      steps: Math.round(steps),
      distance_m: 0,
      duration_s: 0,
      calories: 0,
      raw: { pushed_by: provider },
    });
  }

  const source =
    provider === "healthkit"
      ? "HEALTHKIT"
      : provider === "health_connect"
        ? "HEALTH_CONNECT"
        : "DEVICE_SENSOR";

  /* MONOTONIC GUARD.
   *
   * ingest_activity_records replaces a day's value rather than adding to it,
   * which is right for a provider that reports an authoritative daily total.
   * The in-app counter is different: it restarts at zero on every page load,
   * so a naive push would overwrite 4,000 steps with 0 the moment the user
   * refreshed. Taking the higher of stored and incoming makes a day's count
   * only ever go up, which also makes a second open tab harmless. */
  if (clean.length > 0) {
    const dates = clean.map((r) => r.local_date as string);
    const { data: existing, error: readError } = await admin
      .from("activity_records")
      .select("local_date, steps")
      .eq("user_id", userId)
      .eq("provider", provider)
      .eq("activity_type", "steps")
      .in("local_date", dates);

    if (readError) throw new Error(`could not read existing steps: ${readError.message}`);

    const stored = new Map((existing ?? []).map((r) => [r.local_date as string, r.steps as number]));
    for (const rec of clean) {
      const prior = stored.get(rec.local_date as string) ?? 0;
      rec.steps = Math.max(prior, rec.steps as number);
    }
  }

  const { data, error } = await admin.rpc("ingest_activity_records", {
    p_user_id: userId,
    p_provider: provider,
    p_source: source,
    p_records: clean,
  });

  /* AGENTS.md: check the error on every write whose result you report back. */
  if (error) throw new Error(`ingest failed: ${error.message}`);

  const result = (data ?? {}) as Record<string, number>;
  const todayRecord = clean.find((r) => r.local_date === today);

  return {
    accepted: clean.length,
    inserted: result.inserted ?? 0,
    updated: result.updated ?? 0,
    flagged: result.flagged ?? 0,
    storedToday: (todayRecord?.steps as number) ?? 0,
  };
}

/**
 * Providers the server cannot pull from. The device pushes these, so a
 * server-side sync loop must skip them — otherwise the cron would try to
 * "fetch" from a phone's sensor and log a failure every couple of hours.
 */
const PUSH_ONLY_PROVIDERS: ReadonlySet<string> = new Set([
  "device_sensor",
  "health_connect",
  "healthkit",
  "manual",
]);

export function isPushOnlyProvider(provider: string): boolean {
  return PUSH_ONLY_PROVIDERS.has(provider);
}

/** Sync every pullable provider for one user. Used by the manual refresh. */
export async function syncAllForUser(userId: string, days = 7): Promise<SyncResult[]> {
  const admin = createAdminClient();

  const { data: conns } = await admin
    .from("activity_connections")
    .select("provider")
    .eq("user_id", userId)
    .eq("status", "connected");

  const results: SyncResult[] = [];
  for (const c of conns ?? []) {
    if (isPushOnlyProvider(c.provider as string)) continue;
    try {
      results.push(await syncUserActivity(userId, c.provider as ActivityProviderId, days));
    } catch (err) {
      console.error(`[syncAllForUser] ${c.provider}:`, err);
    }
  }
  return results;
}

/**
 * Sync every connected user. Called by the cron route — this is what makes
 * progress advance while nobody has the app open, which is the closest a web
 * deployment gets to "background tracking".
 */
export async function syncAllConnectedUsers(days = 2): Promise<{ users: number; synced: number }> {
  const admin = createAdminClient();

  const { data: conns } = await admin
    .from("activity_connections")
    .select("user_id, provider")
    .eq("status", "connected");

  let synced = 0;
  const users = new Set<string>();

  for (const c of conns ?? []) {
    /* Health Connect pushes from the phone — there is nothing to pull here. */
    if (isPushOnlyProvider(c.provider as string)) continue;
    users.add(c.user_id);
    try {
      await syncUserActivity(c.user_id, c.provider as ActivityProviderId, days);
      synced += 1;
    } catch (err) {
      console.error(`[cron] sync failed for ${c.user_id}/${c.provider}:`, err);
    }
  }

  return { users: users.size, synced };
}
