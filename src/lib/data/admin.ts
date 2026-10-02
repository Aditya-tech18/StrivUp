/**
 * src/lib/data/admin.ts — admin console data access.
 *
 * Every write goes through a SECURITY DEFINER function that re-checks the
 * caller is an admin (supabase/migrations/20260928120000_roles_verification_admin.sql).
 * Reads rely on admin-only RLS policies.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountStatus } from "@/lib/auth/roles";

export interface PlatformStats {
  total_users: number;
  new_users_30d: number;
  businesses: number;
  verified_businesses: number;
  pending_verifications: number;
  active_quests: number;
  challenges: number;
  pending_reports: number;
  suspended_accounts: number;
  banned_accounts: number;
  deactivated_accounts: number;
}

export interface AdminUserRow {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  avatar_url: string | null;
  account_type: string;
  account_status: AccountStatus;
  account_status_reason: string | null;
  is_deactivated: boolean;
  is_admin: boolean;
  created_at: string;
  report_count: number;
}

export type SubmissionStatus = "pending_review" | "approved" | "rejected" | "needs_more_info" | "withdrawn";

export interface VerificationSubmission {
  id: string;
  business_id: string;
  legal_name: string;
  business_type: string | null;
  representative_name: string;
  representative_role: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  registration_ids: Record<string, string>;
  documents: { path: string; label?: string; name?: string }[];
  notes: string | null;
  status: SubmissionStatus;
  review_note: string | null;
  reviewed_at: string | null;
  submitted_at: string;
  business?: { business_name: string | null; logo_url: string | null; category: string | null; city: string | null; verification_status: string } | null;
}

export interface AuditLogRow {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

type Result<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string; message: string };

const MESSAGES: Record<string, string> = {
  forbidden: "This account does not have permission to perform this action.",
  not_found: "That record no longer exists.",
  already_reviewed: "This request has already been reviewed.",
  note_required: "Add a note for the business explaining the decision.",
  reason_required: "Add a reason. It is shown to the person and kept in the audit log.",
  self: "You can't change your own account status.",
  target_admin: "Admin accounts can't be restricted from the console.",
  bad_status: "That status isn't allowed.",
  bad_decision: "That decision isn't allowed.",
  not_available: "This feature needs the latest database update. Apply the roles migration and try again.",
};

function fail(error: string): { ok: false; error: string; message: string } {
  return { ok: false, error, message: MESSAGES[error] ?? "Something went wrong. Nothing was changed — please try again." };
}

async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) return fail("not_available");
    console.error(`[${fn}]`, error.message);
    return fail("unknown");
  }
  const res = data as { ok: boolean; error?: string } & T;
  return res.ok ? (res as { ok: true } & T) : fail(res.error ?? "unknown");
}

export async function getPlatformStats(supabase: SupabaseClient): Promise<PlatformStats | null> {
  const res = await rpc<PlatformStats>(supabase, "admin_platform_stats");
  return res.ok ? res : null;
}

export async function searchUsers(supabase: SupabaseClient, query: string, status: AccountStatus | null): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc("admin_search_users", { p_query: query, p_status: status, p_limit: 100 });
  if (error) { console.error("[admin_search_users]", error.message); return []; }
  return (data ?? []) as AdminUserRow[];
}

export function setAccountStatus(supabase: SupabaseClient, userId: string, status: AccountStatus, reason: string) {
  return rpc(supabase, "admin_set_account_status", { p_user_id: userId, p_status: status, p_reason: reason });
}

export function reviewVerification(
  supabase: SupabaseClient, submissionId: string, decision: "approve" | "reject" | "needs_more_info",
  note: string, internalNote: string
) {
  return rpc<{ status: string }>(supabase, "admin_review_business_verification", {
    p_submission_id: submissionId, p_decision: decision, p_note: note || null, p_internal_note: internalNote || null,
  });
}

export function setBusinessVerification(supabase: SupabaseClient, businessId: string, status: "verified" | "suspended", reason: string) {
  return rpc(supabase, "admin_set_business_verification", { p_business_id: businessId, p_status: status, p_reason: reason });
}

export const SUBMISSION_SELECT =
  "*, business:business_profiles!business_id ( business_name, logo_url, category, city, verification_status )";

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: "Active", deactivated: "Deactivated", suspended: "Suspended", banned: "Banned",
};
