/**
 * src/lib/data/questOrderVerification.ts
 *
 * Client helpers for the business-Quest order verification loop.
 *
 * The two codes never travel over an ordering-platform API — STRIVUP has no
 * Zomato or Swiggy integration. The ORDER code rides in the order description
 * the user types; the BILL code is written on the printed bill by hand. All
 * state transitions live in SECURITY DEFINER functions (see
 * supabase/migrations/20260928_quest_order_verification.sql) because the daily
 * limit and the bill-code comparison are only trustworthy server-side —
 * quest_order_verifications has no write policy, so direct writes are refused.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderVerificationStatus =
  | "code_issued"
  | "order_verified"
  | "completed"
  | "expired"
  | "cancelled";

export type OrderPlatform = "zomato" | "swiggy" | "other";

export interface OrderVerification {
  id: string;
  quest_id: string;
  task_id: string;
  user_id: string;
  business_id: string | null;
  order_code: string;
  bill_code: string | null;
  platform: OrderPlatform | null;
  status: OrderVerificationStatus;
  issued_on: string;
  expires_at: string;
  order_verified_at: string | null;
  bill_code_issued_at: string | null;
  completed_at: string | null;
  bill_code_attempts: number;
  created_at: string;
}

export interface OrderCodeLookup {
  id: string;
  quest_id: string;
  quest_title: string;
  task_id: string;
  task_title: string;
  user_id: string;
  participant_name: string | null;
  order_code: string;
  bill_code: string | null;
  platform: OrderPlatform | null;
  status: OrderVerificationStatus;
  issued_on: string;
  expires_at: string;
  created_at: string;
}

/**
 * What the verifying business sees when it searches a code.
 *
 * Public identity plus this participant's progress on this quest, and nothing
 * else. No email, no phone, no activity from any other quest: the business
 * needs enough to judge whether an order is genuine, not a profile dossier.
 */
export interface OrderCodeDetail extends OrderCodeLookup {
  participant_username: string | null;
  participant_avatar: string | null;
  participant_since: string | null;
  tasks_completed_here: number;
  tasks_total_here: number;
  verified_orders_here: number;
  joined_quest_at: string | null;
}

export interface LeaderboardRow {
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  tasks_completed: number;
  points: number;
  rank: number;
}

/** Result wrapper — every caller renders the message, so never swallow it. */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Postgres RAISE messages arrive as a readable sentence already (the functions
 * are written that way), so prefer them over a generic fallback.
 */
function toMessage(error: { message?: string } | null, fallback: string): string {
  const raw = error?.message?.trim();
  if (!raw) return fallback;
  // PostgREST prefixes some errors; strip the noise but keep the sentence.
  return raw.replace(/^(.*?:\s)?(?=[A-Z])/, "").trim() || fallback;
}

/* ── User side ─────────────────────────────────────────────────────────── */

/**
 * Issue (or re-read) today's order code for a task.
 *
 * Idempotent by design: one active code per user / task / IST day. Calling it
 * twice on the same day returns the same code rather than invalidating the one
 * the user may already have typed into an order.
 */
export async function issueOrderCode(
  supabase: SupabaseClient,
  questId: string,
  taskId: string,
  platform?: OrderPlatform
): Promise<Result<OrderVerification>> {
  const { data, error } = await supabase.rpc("issue_quest_order_code", {
    p_quest_id: questId,
    p_task_id: taskId,
    p_platform: platform ?? null,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Could not start verification.") };
  }
  if (!data) {
    return { ok: false, error: "Could not start verification." };
  }
  return { ok: true, data: data as OrderVerification };
}

/** The user's current verification row for a task, if any. */
export async function getActiveVerification(
  supabase: SupabaseClient,
  questId: string,
  taskId: string,
  userId: string
): Promise<OrderVerification | null> {
  const { data, error } = await supabase
    .from("quest_order_verifications")
    .select("*")
    .eq("quest_id", questId)
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .in("status", ["code_issued", "order_verified", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[getActiveVerification]", error.message);
    return null;
  }
  return (data as OrderVerification | null) ?? null;
}

/** Every verification row this user holds on a quest, keyed by task. */
export async function getVerificationsByTask(
  supabase: SupabaseClient,
  questId: string,
  userId: string
): Promise<Map<string, OrderVerification>> {
  const map = new Map<string, OrderVerification>();

  const { data, error } = await supabase
    .from("quest_order_verifications")
    .select("*")
    .eq("quest_id", questId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getVerificationsByTask]", error.message);
    return map;
  }

  // Ordered newest-first, so the first row seen for a task is the current one.
  for (const row of (data ?? []) as OrderVerification[]) {
    if (!map.has(row.task_id)) map.set(row.task_id, row);
  }
  return map;
}

/** Redeem the bill code the business wrote on the bill and finish the task. */
export async function completeTaskWithBillCode(
  supabase: SupabaseClient,
  questId: string,
  taskId: string,
  billCode: string
): Promise<Result<OrderVerification>> {
  const { data, error } = await supabase.rpc("complete_task_with_bill_code", {
    p_quest_id: questId,
    p_task_id: taskId,
    p_bill_code: billCode,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Could not verify that code.") };
  }
  if (!data) {
    return { ok: false, error: "Could not verify that code." };
  }
  return { ok: true, data: data as OrderVerification };
}

/* ── Business side ─────────────────────────────────────────────────────── */

/**
 * Search an order code and return the participant profile with it.
 *
 * Read only. The function re-checks that the caller owns the quest, so a
 * business can only ever resolve codes issued against its own quests.
 */
export async function lookupOrderDetail(
  supabase: SupabaseClient,
  code: string
): Promise<Result<OrderCodeDetail[]>> {
  const { data, error } = await supabase.rpc("business_lookup_order_detail", {
    p_code: code,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Could not search that code.") };
  }
  return { ok: true, data: (data ?? []) as OrderCodeDetail[] };
}

/**
 * Reject a code the business does not recognise.
 *
 * Cancelling frees the participant's daily slot, so somebody rejected in error
 * can request a fresh code the same day instead of being locked out until
 * tomorrow. An order that was already verified cannot be rejected: the bill
 * code is out in the world by then.
 */
export async function rejectOrderCode(
  supabase: SupabaseClient,
  code: string,
  reason?: string
): Promise<Result<OrderVerification>> {
  const { data, error } = await supabase.rpc("business_reject_order_code", {
    p_code: code,
    p_reason: reason ?? null,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Could not reject that order.") };
  }
  return { ok: true, data: data as OrderVerification };
}

/** Search an order code without changing anything. */
export async function lookupOrderCode(
  supabase: SupabaseClient,
  code: string
): Promise<Result<OrderCodeLookup[]>> {
  const { data, error } = await supabase.rpc("business_lookup_order_code", {
    p_code: code,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Could not search that code.") };
  }
  return { ok: true, data: (data ?? []) as OrderCodeLookup[] };
}

/**
 * Confirm the order arrived and mint the bill code.
 * Calling it again on an already-verified row returns the same bill code, so a
 * second lookup mid-shift never invalidates a code already written on a bill.
 */
export async function verifyOrderCode(
  supabase: SupabaseClient,
  code: string,
  platform?: OrderPlatform
): Promise<Result<OrderVerification>> {
  const { data, error } = await supabase.rpc("business_verify_order_code", {
    p_code: code,
    p_platform: platform ?? null,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Could not verify that order.") };
  }
  if (!data) {
    return { ok: false, error: "Could not verify that order." };
  }
  return { ok: true, data: data as OrderVerification };
}

/** Open verifications waiting on this business, newest first. */
export async function getPendingVerifications(
  supabase: SupabaseClient,
  questIds: string[]
): Promise<OrderCodeLookup[]> {
  if (questIds.length === 0) return [];

  const { data, error } = await supabase
    .from("quest_order_verifications")
    .select(
      `id, quest_id, task_id, user_id, order_code, bill_code, platform, status,
       issued_on, expires_at, created_at,
       quest:quests!quest_id ( title ),
       task:quest_tasks!task_id ( title ),
       participant:profiles!user_id ( full_name )`
    )
    .in("quest_id", questIds)
    .in("status", ["code_issued", "order_verified"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[getPendingVerifications]", error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    quest_id: row.quest_id as string,
    quest_title: (row.quest as { title?: string } | null)?.title ?? "Quest",
    task_id: row.task_id as string,
    task_title: (row.task as { title?: string } | null)?.title ?? "Task",
    user_id: row.user_id as string,
    participant_name:
      (row.participant as { full_name?: string | null } | null)?.full_name ?? null,
    order_code: row.order_code as string,
    bill_code: (row.bill_code as string | null) ?? null,
    platform: (row.platform as OrderPlatform | null) ?? null,
    status: row.status as OrderVerificationStatus,
    issued_on: row.issued_on as string,
    expires_at: row.expires_at as string,
    created_at: row.created_at as string,
  }));
}

/* ── Leaderboard ───────────────────────────────────────────────────────── */

/**
 * Leaderboard built only from verified (approved) task submissions.
 * Returns an empty array when nobody has verified activity yet — the UI shows
 * placeholder rows in that case and labels them as such.
 */
export async function getQuestLeaderboard(
  supabase: SupabaseClient,
  questId: string,
  limit = 10
): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc("quest_leaderboard", {
    p_quest_id: questId,
    p_limit: limit,
  });

  if (error) {
    console.error("[getQuestLeaderboard]", error.message);
    return [];
  }
  return (data ?? []) as LeaderboardRow[];
}
