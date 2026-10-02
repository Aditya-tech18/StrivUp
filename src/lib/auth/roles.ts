/**
 * src/lib/auth/roles.ts
 *
 * Role + account-status lookups. Roles live in the database
 * (profiles.is_admin / moderator_role / account_type) and can only be changed
 * by SECURITY DEFINER functions — see
 * supabase/migrations/20260928120000_roles_verification_admin.sql.
 *
 * These helpers only decide where to send someone. Every admin page and
 * action is still authorised server-side (layout check + RLS + RPC checks).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountStatus = "active" | "deactivated" | "suspended" | "banned";

export interface ViewerRole {
  isAdmin: boolean;        // full admin (business verification, account enforcement)
  isModerator: boolean;    // admin or any moderator (content moderation)
  accountType: "user" | "creator" | "business";
  accountStatus: AccountStatus;
}

export async function getViewerRole(supabase: SupabaseClient, userId: string): Promise<ViewerRole> {
  // account_status arrives with the roles migration; fall back if it isn't applied yet.
  const first = await supabase
    .from("profiles").select("is_admin, moderator_role, account_type, account_status").eq("id", userId).maybeSingle();
  const data = first.error
    ? (await supabase.from("profiles").select("is_admin, moderator_role, account_type").eq("id", userId).maybeSingle()).data
    : first.data;

  const row = (data ?? {}) as { is_admin?: boolean; moderator_role?: string; account_type?: string; account_status?: string };
  const role = row.moderator_role ?? "none";
  return {
    isAdmin: row.is_admin === true || role === "super_admin",
    isModerator: row.is_admin === true || role !== "none",
    accountType: (row.account_type as ViewerRole["accountType"]) ?? "user",
    accountStatus: (row.account_status as AccountStatus) ?? "active",
  };
}

/** Where a signed-in person lands after login. */
export async function homeFor(supabase: SupabaseClient, userId: string): Promise<string> {
  const r = await getViewerRole(supabase, userId);
  if (r.accountStatus !== "active") return "/deactivated";
  if (r.isModerator) return "/admin";
  if (r.accountType === "business") return "/business";
  return "/feed";
}
