/**
 * src/lib/data/orderVerification.ts
 *
 * Two-stage Quest Order Verification (see /how-quests-work):
 *   1. startOrderVerification  — participant taps "Post Proof" → Order code SV-######
 *   2. verifyOrder / rejectOrder — business searches the code and verifies → Bill code BV-######
 *   3. redeemBillCode          — participant enters the bill code → task completed
 *
 * All writes go through SECURITY DEFINER database functions
 * (supabase/migrations/20260928090000_quest_order_verification.sql);
 * the tables themselves are read-only to clients.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderRequestStatus = "pending" | "approved" | "rejected" | "expired" | "completed";

export interface OrderRequest {
  id: string;
  sv_code: string;
  task_id: string | null;
  quest_id: string | null;
  status: OrderRequestStatus;
  rejection_reason: string | null;
  expires_at: string;
  bill_code_expires_at: string | null;
  business_verified_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  completed_tasks: number;
  last_verified_at: string;
  is_me: boolean;
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; message: string };

/** User-facing copy for every error code the database functions return. */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Please sign in again to continue.",
  not_joined: "Join this Quest before starting its tasks.",
  not_order_task: "This task doesn't use order verification.",
  no_business: "This Quest isn't linked to a business yet.",
  own_quest: "You can't complete your own Quest.",
  quest_not_active: "This Quest isn't active right now.",
  already_completed: "You've already completed this task.",
  too_many_codes: "You've generated a lot of codes today. Try again tomorrow.",
  not_found: "No Quest order found with this code. Check the code on the order and try again.",
  expired: "This code has expired. Ask the customer to generate a new one with Post Proof.",
  status_rejected: "This order was already rejected.",
  status_completed: "This order is already complete.",
  status_expired: "This code has expired.",
  invalid_code: "Invalid verification code. Check the code written on your bill.",
  not_your_code: "This verification code does not belong to this task.",
  already_used: "This code has already been used.",
  not_verified: "The business hasn't verified this order yet.",
  too_many_attempts: "Too many incorrect codes. Please wait an hour and try again.",
  not_available: "Order verification isn't switched on yet. Please try again later.",
};

function fail(error: string): { ok: false; error: string; message: string } {
  return { ok: false, error, message: MESSAGES[error] ?? "Something went wrong. Your progress hasn't changed — please try again." };
}

async function call<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    // PGRST202: function not found — the migration hasn't been applied yet.
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) return fail("not_available");
    console.error(`[${fn}]`, error.message);
    return fail("unknown");
  }
  const res = data as { ok: boolean; error?: string } & T;
  return res.ok ? (res as { ok: true } & T) : fail(res.error ?? "unknown");
}

/** Stage 1 (participant): Post Proof → Order Verification code. Idempotent per task. */
export function startOrderVerification(supabase: SupabaseClient, taskId: string) {
  return call<{ request_id: string; code: string; status: OrderRequestStatus; expires_at: string }>(
    supabase, "start_order_verification", { p_task_id: taskId });
}

/** Stage 2 (business): verify the order → Bill Verification code to write on the bill. */
export function verifyOrder(supabase: SupabaseClient, svCode: string) {
  return call<{ bill_code: string; expires_at: string; already?: boolean }>(
    supabase, "business_verify_order", { p_code: svCode });
}

/** Stage 2 (business): reject the order, optionally with a reason shown to the participant. */
export function rejectOrder(supabase: SupabaseClient, requestId: string, reason?: string) {
  return call<Record<string, never>>(supabase, "business_reject_order", { p_request_id: requestId, p_reason: reason ?? null });
}

/** Stage 3 (participant): enter the bill code → task completed. */
export function redeemBillCode(supabase: SupabaseClient, taskId: string, billCode: string) {
  return call<{ completed_tasks: number; total_tasks: number; quest_completed: boolean }>(
    supabase, "redeem_bill_code", { p_task_id: taskId, p_code: billCode });
}

/** Latest order-verification attempt per task for the current participant. */
export async function getMyOrderRequests(
  supabase: SupabaseClient, questId: string, userId: string
): Promise<Map<string, OrderRequest>> {
  const { data, error } = await supabase
    .from("business_verification_requests")
    .select("id,sv_code,task_id,quest_id,status,rejection_reason,expires_at,bill_code_expires_at,business_verified_at,completed_at,created_at")
    .eq("quest_id", questId)
    .eq("participant_id", userId)
    .order("created_at", { ascending: false });
  const map = new Map<string, OrderRequest>();
  if (error) return map; // columns missing before the migration → behave as "no attempts"
  for (const row of (data ?? []) as OrderRequest[]) {
    if (row.task_id && !map.has(row.task_id)) map.set(row.task_id, row);
  }
  return map;
}

/** Verified-progress leaderboard. Includes the caller's own row even outside the top N. */
export async function getQuestLeaderboard(
  supabase: SupabaseClient, questId: string, limit = 20
): Promise<LeaderboardRow[]> {
  // NOTE: the live function is quest_leaderboard. The canonical wrapper is
  // getQuestLeaderboard in questOrderVerification.ts; this one is kept only so
  // this module stays self contained after the branch merge.
  const { data, error } = await supabase.rpc("quest_leaderboard", { p_quest_id: questId, p_limit: limit });
  if (error) return [];
  return (data ?? []) as LeaderboardRow[];
}

/** Normalises what someone types ("sv 123456", "sv123456") for display in inputs. */
export function formatCodeInput(raw: string, prefix: "SV" | "BV"): string {
  const v = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const digits = v.startsWith(prefix) ? v.slice(2) : v.replace(/^[A-Z]+/, "");
  return digits ? `${prefix}-${digits.slice(0, 6)}` : v.slice(0, 2);
}
