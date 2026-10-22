/**
 * src/lib/strivy/push/store.ts
 *
 * Where push state lives: subscriptions, preferences and the send log.
 *
 *  - supabasePushStore: the tables and functions in
 *    supabase/migrations/20261001_strivy_push.sql (not applied yet). Uses a
 *    service-role client, on the server only, because the scheduler works
 *    across users. Every query is filtered by the user it is working on.
 *  - createMemoryPushStore: the same rules in memory, for tests and local
 *    runs without the migration.
 *
 * claim() is the one gate every push passes: it re-checks dedupe, same-body,
 * daily cap, one-per-window and spacing atomically and records the push
 * before anything is sent, so two scheduler runs can't double-send.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StrivyLang } from "../language";
import { PushStoreError } from "./diagnostics";
import { MAX_PUSHES_PER_DAY, MIN_SPACING_FLOOR_MINUTES, type PushWindow } from "./config";
import { DEFAULT_PREFERENCES, type PushPreferences, type SentRecord } from "./planner";

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface ClaimInput {
  userId: string;
  dedupeKey: string;
  pushType: string;
  entityId: string | null;
  localDate: string;
  window: PushWindow;
  tone: string;
  title: string;
  body: string;
  url: string;
  maxPerDay: number;
  minSpacingMinutes: number;
}

export type ClaimResult = { ok: true; id: string } | { ok: false; reason: string };

/** One row of a user's own push history (dev view, message rotation). */
export interface LogEntry {
  localDate: string;
  pushType: string;
  dedupeKey: string;
  window: PushWindow;
  tone: string;
  body: string;
  url: string;
  status: SentRecord["status"];
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface PushStore {
  /** Users with at least one subscription (the scheduler's population). */
  listSubscribedUsers(): Promise<string[]>;
  getPreferences(userId: string): Promise<PushPreferences>;
  listSubscriptions(userId: string): Promise<PushSubscriptionRecord[]>;
  deleteSubscription(userId: string, id: string): Promise<void>;
  historyForDay(userId: string, localDate: string): Promise<SentRecord[]>;
  /** Which of these keys this user has ever been sent. */
  sentKeys(userId: string, keys: string[]): Promise<Set<string>>;
  /** This user's own pushes since a date (newest first, at most 50). */
  recentLog(userId: string, sinceDate: string): Promise<LogEntry[]>;
  claim(input: ClaimInput): Promise<ClaimResult>;
  markResult(userId: string, id: string, status: "sent" | "failed", error?: string): Promise<void>;
}

/* ── In memory (tests, local runs) ───────────────────────────────────────── */

interface LogRow extends SentRecord {
  id: string;
  userId: string;
  localDate: string;
  pushType: string;
  url: string;
  error: string | null;
  sentAt: string | null;
}

export function createMemoryPushStore(
  init: {
    subscriptions?: PushSubscriptionRecord[];
    preferences?: Record<string, Partial<PushPreferences>>;
    now?: () => Date;
  } = {}
) {
  const subs = [...(init.subscriptions ?? [])];
  const prefs = { ...(init.preferences ?? {}) };
  const log: LogRow[] = [];
  const now = init.now ?? (() => new Date());
  let n = 0;
  // Serialise claims like the SQL advisory lock does.
  let chain: Promise<unknown> = Promise.resolve();

  const store: PushStore = {
    async listSubscribedUsers() {
      return [...new Set(subs.map((s) => s.userId))];
    },
    async getPreferences(userId) {
      return { ...DEFAULT_PREFERENCES, ...(prefs[userId] ?? {}) };
    },
    async listSubscriptions(userId) {
      return subs.filter((s) => s.userId === userId);
    },
    async deleteSubscription(userId, id) {
      const i = subs.findIndex((s) => s.id === id && s.userId === userId);
      if (i >= 0) subs.splice(i, 1);
    },
    async historyForDay(userId, localDate) {
      return log
        .filter((r) => r.userId === userId && r.localDate === localDate)
        .map((r) => ({ ...r }));
    },
    async recentLog(userId, sinceDate) {
      return log
        .filter((r) => r.userId === userId && r.localDate >= sinceDate)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50)
        .map((r) => ({
          localDate: r.localDate,
          pushType: r.pushType,
          dedupeKey: r.dedupeKey,
          window: r.window,
          tone: r.tone,
          body: r.body,
          url: r.url,
          status: r.status,
          error: r.error,
          createdAt: r.createdAt,
          sentAt: r.sentAt,
        }));
    },
    async sentKeys(userId, keys) {
      const wanted = new Set(keys);
      return new Set(
        log.filter((r) => r.userId === userId && wanted.has(r.dedupeKey)).map((r) => r.dedupeKey)
      );
    },
    claim(input) {
      const run = async (): Promise<ClaimResult> => {
        const mine = log.filter((r) => r.userId === input.userId);
        if (mine.some((r) => r.dedupeKey === input.dedupeKey))
          return { ok: false, reason: "duplicate event" };
        const day = mine.filter((r) => r.localDate === input.localDate);
        if (day.some((r) => r.body === input.body))
          return { ok: false, reason: "same message today" };
        const counted = day.filter((r) => r.status !== "failed");
        if (counted.length >= Math.min(input.maxPerDay, MAX_PUSHES_PER_DAY))
          return { ok: false, reason: "daily limit" };
        if (counted.some((r) => r.window === input.window))
          return { ok: false, reason: "window already used" };
        const last = Math.max(0, ...counted.map((r) => Date.parse(r.createdAt)));
        const spacing = Math.max(input.minSpacingMinutes, MIN_SPACING_FLOOR_MINUTES) * 60_000;
        if (last && now().getTime() - last < spacing) return { ok: false, reason: "too soon" };
        const id = `log-${++n}`;
        log.push({
          id,
          userId: input.userId,
          localDate: input.localDate,
          dedupeKey: input.dedupeKey,
          window: input.window,
          tone: input.tone,
          body: input.body,
          pushType: input.pushType,
          url: input.url,
          status: "claimed",
          error: null,
          sentAt: null,
          createdAt: now().toISOString(),
        });
        return { ok: true, id };
      };
      const result = chain.then(run);
      chain = result.catch(() => undefined);
      return result;
    },
    async markResult(userId, id, status, error) {
      const row = log.find((r) => r.id === id && r.userId === userId);
      if (!row) return;
      row.status = status;
      row.error = error?.slice(0, 300) ?? null;
      row.sentAt = status === "sent" ? now().toISOString() : null;
    },
  };

  return { store, subs, log, prefs };
}

/** A stored language code, or null for anything else. */
export function asPushLanguage(value: unknown): StrivyLang | null {
  return value === "en" || value === "hinglish" || value === "hi" || value === "bho" ? value : null;
}

/* ── Supabase (service role, server only) ────────────────────────────────── */

export function supabasePushStore(admin: SupabaseClient): PushStore {
  return {
    async listSubscribedUsers() {
      const { data, error } = await admin
        .from("strivy_push_subscriptions")
        .select("user_id")
        .limit(5000);
      if (error) throw new PushStoreError("subscriptions", error);
      return [...new Set((data ?? []).map((r) => r.user_id as string))];
    },
    async getPreferences(userId) {
      const { data, error } = await admin
        .from("strivy_notification_preferences")
        .select("push_enabled, max_per_day, min_spacing_minutes, language, chat_language")
        .eq("user_id", userId)
        .maybeSingle();
      // If preferences can't be read, don't guess "enabled": send nothing.
      if (error) return { ...DEFAULT_PREFERENCES, enabled: false };
      if (!data) return DEFAULT_PREFERENCES;
      return {
        enabled: data.push_enabled === true,
        maxPerDay: Number(data.max_per_day),
        minSpacingMinutes: Number(data.min_spacing_minutes),
        language: asPushLanguage(data.language) ?? asPushLanguage(data.chat_language),
      };
    },
    async listSubscriptions(userId) {
      const { data, error } = await admin
        .from("strivy_push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth")
        .eq("user_id", userId);
      if (error) throw new PushStoreError("subscriptions", error);
      return (data ?? []).map((r) => ({
        id: r.id as string,
        userId: r.user_id as string,
        endpoint: r.endpoint as string,
        p256dh: r.p256dh as string,
        auth: r.auth as string,
      }));
    },
    async deleteSubscription(userId, id) {
      const { error } = await admin
        .from("strivy_push_subscriptions")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) console.warn("[strivy-push] couldn't remove a dead subscription", error.code);
    },
    async historyForDay(userId, localDate) {
      const { data, error } = await admin
        .from("strivy_push_log")
        .select("dedupe_key, time_window, tone, body, status, created_at")
        .eq("user_id", userId)
        .eq("local_date", localDate);
      if (error) throw new PushStoreError("log", error);
      return (data ?? []).map((r) => ({
        dedupeKey: r.dedupe_key as string,
        window: r.time_window as PushWindow,
        tone: r.tone as string,
        body: r.body as string,
        status: r.status as SentRecord["status"],
        createdAt: r.created_at as string,
      }));
    },
    async recentLog(userId, sinceDate) {
      const { data, error } = await admin
        .from("strivy_push_log")
        .select(
          "local_date, push_type, dedupe_key, time_window, tone, body, url, status, error, created_at, sent_at"
        )
        .eq("user_id", userId)
        .gte("local_date", sinceDate)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new PushStoreError("log", error);
      return (data ?? []).map((r) => ({
        localDate: String(r.local_date),
        pushType: r.push_type as string,
        dedupeKey: r.dedupe_key as string,
        window: r.time_window as PushWindow,
        tone: r.tone as string,
        body: r.body as string,
        url: r.url as string,
        status: r.status as SentRecord["status"],
        error: (r.error as string | null) ?? null,
        createdAt: r.created_at as string,
        sentAt: (r.sent_at as string | null) ?? null,
      }));
    },
    async sentKeys(userId, keys) {
      if (keys.length === 0) return new Set();
      const { data, error } = await admin
        .from("strivy_push_log")
        .select("dedupe_key")
        .eq("user_id", userId)
        .in("dedupe_key", keys);
      if (error) throw new PushStoreError("log", error);
      return new Set((data ?? []).map((r) => r.dedupe_key as string));
    },
    async claim(input) {
      const { data, error } = await admin.rpc("strivy_claim_push", {
        p_user: input.userId,
        p_dedupe_key: input.dedupeKey,
        p_push_type: input.pushType,
        p_entity_id: input.entityId,
        p_local_date: input.localDate,
        p_window: input.window,
        p_tone: input.tone,
        p_title: input.title,
        p_body: input.body,
        p_url: input.url,
        p_max_per_day: input.maxPerDay,
        p_min_spacing_minutes: input.minSpacingMinutes,
      });
      if (error) return { ok: false, reason: `claim failed: ${error.message}` };
      const row = (Array.isArray(data) ? data[0] : data) as {
        id: string | null;
        reason: string | null;
      } | null;
      return row?.id
        ? { ok: true, id: row.id }
        : { ok: false, reason: row?.reason ?? "not claimed" };
    },
    async markResult(userId, id, status, error) {
      const { error: failed } = await admin
        .from("strivy_push_log")
        .update({
          status,
          error: error?.slice(0, 300) ?? null,
          sent_at: status === "sent" ? new Date().toISOString() : null,
        })
        .eq("id", id)
        .eq("user_id", userId);
      // The push already went out (or failed); the log row just keeps "claimed".
      if (failed) console.warn("[strivy-push] couldn't update the push log", failed.code);
    },
  };
}
