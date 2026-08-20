/**
 * src/lib/data/challenges.ts — server-safe data helpers for challenges
 *
 * All functions accept a SupabaseClient so they work in both server
 * components (createClient from @/lib/supabase/server) and browser
 * client components (createClient from @/lib/supabase/client).
 *
 * Schema assumptions (as of 20260818_schema_extensions.sql):
 *   challenges:              id, creator_id, title, description, category,
 *                            duration_days (int|null), visibility, proof_methods (text[]),
 *                            thumbnail_url, created_at,
 *                            featured (bool), creator_type, campaign_objective,
 *                            reward_description, proof_type
 *   challenge_participants:  id, challenge_id, user_id, status, joined_at
 *   proof_submissions:       id, challenge_id, user_id, day_number,
 *                            media_url, caption, verification_status, submitted_at
 *   profiles:                id, full_name, avatar_url,
 *                            account_type, bio, verification_status, is_admin
 *   streaks (view):          challenge_id, user_id, current_streak, longest_streak
 *   followers:               follower_id, followed_id, created_at
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeaturedChallenge, TrendingChallenge } from "@/app/(app)/explore/page";
import type { ChallengeDetail, LeaderboardEntry } from "@/app/(app)/challenges/[id]/ChallengeDetailClient";

/* ── Shared helpers ──────────────────────────────────────────────────────── */

function durationLabel(days: number | null): string {
  if (!days) return "Indefinite";
  return `${days} Days`;
}

function fallbackThumbnail(seed: string): string {
  return `https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&q=80&seed=${seed}`;
}

/* ── Explore page ────────────────────────────────────────────────────────── */

/**
 * Public challenges explicitly marked featured = true, up to 6.
 * Ordered by creation date (newest featured first) so admins can promote
 * challenges simply by setting featured = true in the dashboard.
 */
export async function getFeaturedChallenges(
  supabase: SupabaseClient
): Promise<FeaturedChallenge[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select(
      `
      id, title, thumbnail_url, duration_days,
      profiles!creator_id ( full_name ),
      challenge_participants!challenge_id ( user_id )
      `
    )
    .eq("visibility", "public")
    .eq("featured", true)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error || !data) {
    if (error) console.error("[getFeaturedChallenges]", error.message);
    return [];
  }

  return data.map((row) => {
    const profile = row.profiles as unknown as { full_name: string | null } | null;
    const memberCount = Array.isArray(row.challenge_participants)
      ? row.challenge_participants.length
      : 0;
    return {
      id: row.id as string,
      title: row.title as string,
      creatorName: profile?.full_name ?? "Unknown",
      coverImageUrl:
        (row.thumbnail_url as string | null) ?? fallbackThumbnail(row.id as string),
      memberCount,
      durationLabel: durationLabel(row.duration_days as number | null),
      verified: false,
    };
  });
}

/**
 * Top 10 public challenges by recency.
 * Progress % = (days since creation / duration_days) × 100, capped at 100.
 */
export async function getTrendingChallenges(
  supabase: SupabaseClient
): Promise<TrendingChallenge[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select(
      `
      id, title, thumbnail_url, duration_days, created_at, creator_id,
      profiles!creator_id ( full_name ),
      challenge_participants!challenge_id ( user_id )
      `
    )
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data) {
    if (error) console.error("[getTrendingChallenges]", error.message);
    return [];
  }

  return data.map((row) => {
    const profile = row.profiles as unknown as { full_name: string | null } | null;
    const memberCount = Array.isArray(row.challenge_participants)
      ? row.challenge_participants.length
      : 0;
    const totalDays = (row.duration_days as number | null) ?? 90;
    const daysSinceCreation = Math.max(
      1,
      Math.floor(
        (Date.now() - new Date(row.created_at as string).getTime()) /
          86_400_000
      )
    );
    const currentDay = Math.min(daysSinceCreation, totalDays);
    const progressPercent = Math.round((currentDay / totalDays) * 100);

    return {
      id: row.id as string,
      title: row.title as string,
      creatorName: profile?.full_name ?? "Unknown",
      thumbnailUrl:
        (row.thumbnail_url as string | null) ?? fallbackThumbnail(row.id as string),
      currentDay,
      totalDays,
      memberCount,
      progressPercent,
      visibility: "public" as const,
    };
  });
}

/* ── Challenge detail page ────────────────────────────────────────────────── */

/**
 * Fetch a challenge row joined with its creator's profile.
 * Returns null if the challenge doesn't exist.
 */
export async function getChallengeDetail(
  supabase: SupabaseClient,
  id: string
): Promise<Omit<ChallengeDetail, "activeCount" | "successPercent" | "currentStreak"> | null> {
  const { data, error } = await supabase
    .from("challenges")
    .select(
      `
      id, title, duration_days, thumbnail_url, created_at, description, visibility,
      profiles!creator_id ( full_name )
      `
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    if (error) console.error("[getChallengeDetail]", error.message);
    return null;
  }

  const profile = data.profiles as unknown as { full_name: string | null } | null;
  const totalDays = (data.duration_days as number | null) ?? 90;
  const daysSince = Math.max(
    1,
    Math.floor(
      (Date.now() - new Date(data.created_at as string).getTime()) / 86_400_000
    )
  );
  const currentDay = Math.min(daysSince, totalDays);

  return {
    id: data.id as string,
    title: data.title as string,
    creatorName: profile?.full_name ?? "Unknown",
    bannerUrl:
      (data.thumbnail_url as string | null) ??
      fallbackThumbnail(data.id as string),
    memberCount: 0, // filled separately by getChallengeStats
    currentDay,
    totalDays,
    todayTask: (data.description as string | null) ?? "Complete today's challenge task",
    visibility: (data.visibility as "public" | "private") ?? "public",
  };
}

export interface ChallengeStats {
  activeCount: number;
  successPercent: number;
  currentStreak: number;
  memberCount: number;
}

/**
 * Compute the three stat-row numbers for a challenge.
 *
 * ACTIVE:    COUNT of challenge_participants where status = 'active'
 * SUCCESS %: % of ACTIVE participants who have an approved submission
 *            for the highest day_number found in this challenge
 *            (denominator = active count, consistent with ACTIVE stat above)
 * STREAK:    current_streak for the logged-in user in this challenge
 *            (0 if not logged in or not a participant)
 */
export async function getChallengeStats(
  supabase: SupabaseClient,
  challengeId: string,
  userId?: string
): Promise<ChallengeStats> {
  // 1. ACTIVE participant count
  const { count: activeCount } = await supabase
    .from("challenge_participants")
    .select("*", { count: "exact", head: true })
    .eq("challenge_id", challengeId)
    .eq("status", "active");

  const active = activeCount ?? 0;

  // 2. SUCCESS % — approved proofs for the latest day_number among ACTIVE participants
  let successPercent = 0;
  if (active > 0) {
    // Get the highest day_number with an approved submission in this challenge
    const { data: latestDayData } = await supabase
      .from("proof_submissions")
      .select("day_number")
      .eq("challenge_id", challengeId)
      .eq("verification_status", "approved")
      .order("day_number", { ascending: false })
      .limit(1);

    const latestDay = latestDayData?.[0]?.day_number as number | undefined;

    if (latestDay !== undefined) {
      const { count: approvedCount } = await supabase
        .from("proof_submissions")
        .select("*", { count: "exact", head: true })
        .eq("challenge_id", challengeId)
        .eq("day_number", latestDay)
        .eq("verification_status", "approved");

      successPercent = Math.min(
        100,
        Math.round(((approvedCount ?? 0) / active) * 100)
      );
    }
  }

  // 3. STREAK — for the current user only (graceful 0 if no row)
  let currentStreak = 0;
  if (userId) {
    const { data: streakRow } = await supabase
      .from("streaks")
      .select("current_streak")
      .eq("challenge_id", challengeId)
      .eq("user_id", userId)
      .maybeSingle();

    currentStreak = (streakRow?.current_streak as number | null) ?? 0;
  }

  return { activeCount: active, successPercent, currentStreak, memberCount: active };
}

/**
 * Top N participants ranked by current_streak, with longest_streak as tie-break.
 * Fetches from the streaks view then resolves profiles in a second query.
 */
export async function getChallengeLeaderboard(
  supabase: SupabaseClient,
  challengeId: string,
  limit = 3
): Promise<LeaderboardEntry[]> {
  // Fetch streaks and the challenge's duration_days in parallel
  const [{ data: streakRows, error }, { data: challengeRow }] = await Promise.all([
    supabase
      .from("streaks")
      .select("user_id, current_streak, longest_streak")
      .eq("challenge_id", challengeId)
      .order("current_streak", { ascending: false })
      .order("longest_streak", { ascending: false })
      .limit(limit),
    supabase
      .from("challenges")
      .select("duration_days")
      .eq("id", challengeId)
      .maybeSingle(),
  ]);

  if (error || !streakRows || streakRows.length === 0) {
    if (error) console.error("[getChallengeLeaderboard]", error.message);
    return [];
  }

  // null = Indefinite challenge (no fixed end date)
  const durationDays = (challengeRow?.duration_days as number | null) ?? null;

  const userIds = streakRows.map((r) => r.user_id as string);

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", userIds);

  const profileMap = Object.fromEntries(
    (profileRows ?? []).map((p) => [
      p.id as string,
      { full_name: p.full_name as string | null, avatar_url: p.avatar_url as string | null },
    ])
  );

  return streakRows.map((row, idx) => {
    const userId = row.user_id as string;
    const profile = profileMap[userId];
    return {
      rank: idx + 1,
      name: profile?.full_name ?? "Unknown",
      avatarUrl:
        profile?.avatar_url ??
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`,
      daysCompleted: (row.current_streak as number) ?? 0,
      totalDays: durationDays,   // null → Indefinite; number → fixed challenge length
      badge:
        idx === 0 ? ("champion" as const)
        : idx === 1 ? ("leader" as const)
        : undefined,
    };
  });
}


/**
 * Get the joined_at timestamp for a user in a challenge.
 * Returns null if the user is not a participant.
 */
export async function getParticipantJoinedAt(
  supabase: SupabaseClient,
  challengeId: string,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("challenge_participants")
    .select("joined_at")
    .eq("challenge_id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data?.joined_at as string | null) ?? null;
}
