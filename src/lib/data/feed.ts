/**
 * src/lib/data/feed.ts — server-safe helper for proof-of-work feed posts
 *
 * Used by:
 *  - app/(app)/feed/page.tsx  (global feed, no challengeId filter)
 *  - app/(app)/challenges/[id]/page.tsx  (scoped to one challenge)
 *
 * To swap from mock to real data, this file is the ONLY change needed.
 * FeedCard and FeedPost type remain untouched.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedPost } from "@/components/features/FeedCard";

/** Format a UTC timestamp as a human-readable relative label */
function relativeLabel(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diffMs / 3_600_000);
  const d = Math.floor(diffMs / 86_400_000);
  if (h < 1) return "JUST NOW";
  if (h < 24) return `${h}H AGO`;
  return `${d}D AGO`;
}

/**
 * Fetch approved proof submissions mapped to FeedPost shape.
 *
 * @param supabase  Supabase client (server or browser)
 * @param opts.challengeId  If set, scope results to one challenge
 * @param opts.limit        Max rows (default 20)
 */
export async function getFeedPosts(
  supabase: SupabaseClient,
  opts: { challengeId?: string; limit?: number } = {}
): Promise<FeedPost[]> {
  const { challengeId, limit = 20 } = opts;

  let q = supabase
    .from("proof_submissions")
    .select(
      `
      id,
      caption,
      media_url,
      submitted_at,
      day_number,
      user_id,
      challenge_id,
      profiles!user_id ( full_name, avatar_url, is_verified ),
      challenges!challenge_id ( title )
      `
    )
    .eq("verification_status", "approved")
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (challengeId) {
    q = q.eq("challenge_id", challengeId);
  }

  const { data, error } = await q;
  if (error || !data) {
    if (error) console.error("[getFeedPosts]", error.message);
    return [];
  }

  return data.map((row) => {
    // PostgREST types single-FK joins as arrays; cast via unknown
    const profile = row.profiles as unknown as {
      full_name: string | null;
      avatar_url: string | null;
      is_verified: boolean | null;
    } | null;
    const challenge = row.challenges as unknown as { title: string | null } | null;

    return {
      id: row.id as string,
      authorName: profile?.full_name ?? "Anonymous",
      authorAvatarUrl:
        profile?.avatar_url ??
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.user_id}`,
      verified: profile?.is_verified ?? false,
      category: (challenge?.title ?? "CHALLENGE").toUpperCase(),
      dayLabel: relativeLabel(row.submitted_at as string),
      streakDay: (row.day_number as number) ?? 1,
      proofImageUrl: row.media_url as string,
      caption: (row.caption as string) ?? "",
      // Likes/comments not in schema yet — placeholder zeros
      likeCount: 0,
      commentCount: 0,
    };
  });
}
