/**
 * src/lib/strivy/notifier.ts
 *
 * How STRIVY check-ins reach the existing Alerts page (public.notifications).
 *
 * The notifications table has no INSERT policy: every notification in
 * STRIVUP is written by a SECURITY DEFINER database function. STRIVY follows
 * the same rule. It never inserts rows itself and never uses a service-role
 * key; it calls strivy_emit_notifications() as the signed-in user, and that
 * function (supabase/migrations/20260929_strivy_notifications.sql) enforces:
 *
 *   - rows only for auth.uid(), never a client-supplied user id
 *   - only the four strivy_* types, with length caps
 *   - related challenge/quest must be one the user has joined
 *   - idempotency: unique (user_id, dedupe_key), ON CONFLICT DO NOTHING
 *   - a cap of MAX_PER_DAY STRIVY notifications per user per 24h
 *
 * That migration is NOT applied. Until it is, and until
 * STRIVY_NOTIFICATIONS_ENABLED=true is set, the disabled notifier is used and
 * check-ins appear only inside the Strivy panel.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationDraft } from "./accountability";

export type DeliveryStatus = "delivered" | "disabled" | "unavailable" | "error";

export interface DeliveryResult {
  status: DeliveryStatus;
  /** Rows actually created; duplicates and capped items don't count. */
  inserted: number;
}

export interface StrivyNotifier {
  readonly name: string;
  deliver(drafts: NotificationDraft[]): Promise<DeliveryResult>;
}

/** Same limits as the SQL function, so tests describe the real behaviour. */
export const MAX_PER_RUN = 2;
export const MAX_PER_DAY = 3;

export const disabledNotifier: StrivyNotifier = {
  name: "disabled",
  async deliver() {
    return { status: "disabled", inserted: 0 };
  },
};

/** Postgres/PostgREST codes for "function doesn't exist (yet)". */
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);

export function supabaseNotifier(supabase: SupabaseClient): StrivyNotifier {
  return {
    name: "supabase-rpc",
    async deliver(drafts) {
      const items = drafts.slice(0, MAX_PER_RUN).map((d) => ({
        type: d.type,
        dedupe_key: d.dedupeKey,
        title: d.title,
        message: d.message,
        related_challenge_id: d.relatedChallengeId,
        related_quest_id: d.relatedQuestId,
      }));
      if (items.length === 0) return { status: "delivered", inserted: 0 };

      const { data, error } = await supabase.rpc("strivy_emit_notifications", { p_items: items });
      if (error) {
        if (MISSING_FUNCTION.has(error.code ?? "")) return { status: "unavailable", inserted: 0 };
        console.error("[strivy] notify", error.code ?? "", error.message);
        return { status: "error", inserted: 0 };
      }
      return { status: "delivered", inserted: typeof data === "number" ? data : 0 };
    },
  };
}

/**
 * In-memory notifier with the same idempotency and caps as the SQL function.
 * Used by tests and handy for local experiments; never used in production.
 */
export function createMemoryNotifier(now: () => Date = () => new Date()) {
  const rows: (NotificationDraft & { createdAt: number; isRead: boolean })[] = [];
  const notifier: StrivyNotifier & { rows: typeof rows } = {
    name: "memory",
    rows,
    async deliver(drafts) {
      let inserted = 0;
      const t = now().getTime();
      for (const d of drafts.slice(0, MAX_PER_RUN)) {
        const today = rows.filter((r) => t - r.createdAt < 86_400_000).length;
        if (today >= MAX_PER_DAY) break;
        if (rows.some((r) => r.dedupeKey === d.dedupeKey)) continue;
        rows.push({ ...d, createdAt: t, isRead: false });
        inserted++;
      }
      return { status: "delivered", inserted };
    },
  };
  return notifier;
}

export function getStrivyNotifier(supabase: SupabaseClient): StrivyNotifier {
  return process.env.STRIVY_NOTIFICATIONS_ENABLED === "true"
    ? supabaseNotifier(supabase)
    : disabledNotifier;
}
