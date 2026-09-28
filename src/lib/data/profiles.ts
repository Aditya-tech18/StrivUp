/**
 * src/lib/data/profiles.ts
 *
 * Server-safe profile reads. Follows the `src/lib/data/*` convention of
 * ACCEPTING a SupabaseClient, so these work from server components — unlike
 * `src/lib/supabase/profile.ts`, which creates a browser client internally and
 * is therefore client-only.
 *
 * The `Profile` type is imported type-only, so nothing from the browser module
 * reaches the server bundle at runtime.
 *
 * Used by the public profile route /u/[handle].
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/supabase/profile";

/** Columns that make up a public profile. Deliberately excludes anything in
 *  profile_private (email, phone, age, gender) — see PII isolation rule. */
const PROFILE_COLUMNS =
  "id,username,full_name,avatar_url,bio,account_type,verification_status," +
  "profile_completed,is_deactivated,is_private,pinned_challenge_ids," +
  "created_at,updated_at";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the handle is a UUID rather than a username. */
export function isUuidHandle(handle: string): boolean {
  return UUID_RE.test(handle);
}

/**
 * Normalises a raw row into `Profile`.
 *
 * Intentionally a separate implementation from `toProfile` in
 * src/lib/supabase/profile.ts: importing that would pull the browser Supabase
 * client into the server bundle. `gender` is always null here — it lives in
 * profile_private and must never surface on a public profile, even though a
 * duplicate column also exists on `profiles`.
 */
function toPublicProfile(raw: Record<string, unknown>): Profile {
  return {
    id: String(raw.id ?? ""),
    username: (raw.username as string) ?? null,
    full_name: (raw.full_name as string) ?? null,
    avatar_url: (raw.avatar_url as string) ?? null,
    bio: (raw.bio as string) ?? null,
    account_type: (raw.account_type as string) ?? "user",
    verification_status: (raw.verification_status as string) ?? "none",
    profile_completed: Boolean(raw.profile_completed ?? false),
    is_deactivated: Boolean(raw.is_deactivated ?? false),
    is_private: Boolean(raw.is_private ?? false),
    // Never exposed publicly — PII lives in profile_private.
    gender: null,
    pinned_challenge_ids: Array.isArray(raw.pinned_challenge_ids)
      ? (raw.pinned_challenge_ids as string[])
      : [],
    created_at: (raw.created_at as string) ?? new Date().toISOString(),
    updated_at: (raw.updated_at as string) ?? new Date().toISOString(),
  };
}

/**
 * Resolve a profile from a URL handle, which may be either a username or a
 * UUID.
 *
 * Both forms are supported because `profiles.username` is nullable and most
 * live accounts have no username yet, so a username-only route would be
 * unreachable for them. `/alerts` also links to users by UUID.
 *
 * Usernames are stored lowercase (the edit form lowercases on input), so an
 * equality match is correct and uses the unique index — `ilike` would not.
 */
export async function getProfileByHandle(
  supabase: SupabaseClient,
  handle: string
): Promise<Profile | null> {
  const query = supabase.from("profiles").select(PROFILE_COLUMNS);

  const { data, error } = isUuidHandle(handle)
    ? await query.eq("id", handle).maybeSingle()
    : await query.eq("username", handle.toLowerCase()).maybeSingle();

  if (error || !data) return null;
  // PROFILE_COLUMNS is a concatenated string, so supabase-js cannot infer the
  // row shape and widens `data` to include GenericStringError. Cast through
  // unknown, matching how src/lib/supabase/profile.ts handles the same pattern.
  return toPublicProfile(data as unknown as Record<string, unknown>);
}

/** Relationship between the viewer and the profile being viewed. */
export type FollowState = "self" | "following" | "requested" | "none";

/**
 * Resolve the viewer's relationship to a target user.
 *
 * `followers.request_status` is one of 'pending' | 'accepted' | 'rejected'.
 * A rejected row reads as "none" so the viewer can ask again rather than being
 * silently locked out — and without revealing that they were rejected.
 */
export async function getFollowState(
  supabase: SupabaseClient,
  viewerId: string | null,
  targetId: string
): Promise<FollowState> {
  if (!viewerId) return "none";
  if (viewerId === targetId) return "self";

  const { data, error } = await supabase
    .from("followers")
    .select("request_status")
    .eq("follower_id", viewerId)
    .eq("followed_id", targetId)
    .maybeSingle();

  if (error || !data) return "none";

  const status = (data as { request_status?: string }).request_status;
  if (status === "accepted") return "following";
  if (status === "pending") return "requested";
  return "none";
}

/**
 * Follower / following counts, counting ACCEPTED relationships only.
 * A pending or rejected request is not a follow and must not inflate the count.
 */
export async function getFollowCounts(
  supabase: SupabaseClient,
  userId: string
): Promise<{ followers: number; following: number }> {
  const [followersRes, followingRes] = await Promise.all([
    supabase
      .from("followers")
      .select("*", { count: "exact", head: true })
      .eq("followed_id", userId)
      .eq("request_status", "accepted"),
    supabase
      .from("followers")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId)
      .eq("request_status", "accepted"),
  ]);

  return {
    followers: followersRes.count ?? 0,
    following: followingRes.count ?? 0,
  };
}

/** One row of the profile_challenge_stats view. */
export interface ProfileChallengeStat {
  user_id: string;
  challenge_id: string;
  title: string | null;
  duration_days: number | null;
  thumbnail_url: string | null;
  joined_at: string;
  status: string;
  completed_at: string | null;
  current_streak: number;
  longest_streak: number;
  current_day: number;
  consistency_pct: number;
}

/**
 * Per-challenge stats for a user.
 *
 * Named `ProfileChallengeStat` to avoid colliding with the unrelated
 * `ChallengeStats` already exported by src/lib/data/challenges.ts.
 *
 * `profile_challenge_stats` now runs with security_invoker=on, so RLS filters
 * this to challenges the *caller* may see. A visitor therefore gets the
 * target's public-challenge rows and none of their private ones, with no
 * app-level filtering needed here.
 */
export async function getProfileChallengeStats(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileChallengeStat[]> {
  const { data, error } = await supabase
    .from("profile_challenge_stats")
    .select("*")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (error || !data) return [];
  return data as ProfileChallengeStat[];
}
