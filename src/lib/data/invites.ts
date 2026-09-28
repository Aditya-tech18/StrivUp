/**
 * src/lib/data/invites.ts
 *
 * Challenge invite links — the cold-start mechanism.
 *
 * A challenge app is worth nothing to its first user sitting alone. The unit
 * that works at n=5 is a creator plus a handful of friends who can't hide from
 * each other, and forming that group requires a link you can paste into a
 * WhatsApp group. This module is that link.
 *
 * Both operations go through SECURITY DEFINER Postgres functions rather than
 * direct table access:
 *   - issuing a code must be creator-only, which RLS alone cannot express here
 *   - joining must work for someone who cannot yet SELECT the private challenge
 *
 * See supabase/migrations/20260928_challenge_invites.sql.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Where an invite link points. Kept in one place so the route and the share
 *  sheet can never drift apart. */
export function inviteUrl(code: string, origin?: string): string {
  const base =
    origin ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/join/${code}`;
}

/**
 * Issue (or rotate) the invite code for a challenge. Creator-only — the
 * database enforces that, not the caller.
 *
 * Rotating invalidates every link already shared, which is the only way to
 * revoke access from someone who was forwarded one.
 */
export async function ensureInviteCode(
  supabase: SupabaseClient,
  challengeId: string,
  rotate = false
): Promise<{ code: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("ensure_challenge_invite_code", {
    p_challenge_id: challengeId,
    p_rotate: rotate,
  });

  if (error) return { code: null, error: error.message };
  return { code: (data as string | null) ?? null, error: null };
}

/**
 * Join a challenge using an invite code.
 *
 * Idempotent — a re-tapped link returns the same challenge rather than
 * erroring, so someone who opens the link twice is not shown a failure.
 */
export async function joinByInviteCode(
  supabase: SupabaseClient,
  code: string
): Promise<{ challengeId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("join_challenge_by_invite", {
    p_code: code,
  });

  if (error) {
    // The function raises a readable message for a bad code; surface it as-is
    // rather than a Postgres error string.
    return { challengeId: null, error: error.message };
  }
  return { challengeId: (data as string | null) ?? null, error: null };
}

/** Read a challenge's current invite code, if one has been issued. */
export async function getInviteCode(
  supabase: SupabaseClient,
  challengeId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("challenges")
    .select("invite_code")
    .eq("id", challengeId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { invite_code: string | null }).invite_code;
}
