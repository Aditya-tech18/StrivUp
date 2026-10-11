/**
 * src/lib/data/feed.ts — server-safe helper for proof-of-work feed posts
 *
 * Used by:
 *  - app/(app)/feed/page.tsx  (global feed, no challengeId filter)
 *  - app/(app)/challenges/[id]/page.tsx  (scoped to one challenge)
 *
 * Like and comment counts come from proof_interaction_counts(), a single
 * aggregate call for the whole page. The obvious alternatives are both wrong:
 * counting per card is N+1, and fetching every comment row to call .length on
 * it makes the payload grow with engagement rather than with page size.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getFacepiles } from "@/lib/data/social";
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
 * @param opts.viewerId     Whose like state to resolve. Omit on surfaces with
 *                          no signed-in viewer; every card then reads unliked.
 */
export async function getFeedPosts(
  supabase: SupabaseClient,
  opts: { challengeId?: string; limit?: number; viewerId?: string } = {}
): Promise<FeedPost[]> {
  const { challengeId, limit = 20, viewerId } = opts;

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
      admin_removed,
      media_width,
      media_height,
      profiles!user_id ( full_name, avatar_url, verification_status ),
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

  // One aggregate call for the whole page, rather than two per card.
  const ids = data.map((row) => row.id as string);
  const counts = new Map<
    string,
    { like_count: number; comment_count: number; viewer_liked: boolean }
  >();

  if (ids.length > 0) {
    const { data: countRows, error: countError } = await supabase.rpc(
      "proof_interaction_counts",
      { p_proof_ids: ids, p_viewer: viewerId ?? null }
    );
    if (countError) {
      // Counts are decoration; a failure here must not empty the feed.
      console.error("[getFeedPosts] counts", countError.message);
    } else {
      for (const r of (countRows ?? []) as Array<{
        proof_id: string;
        like_count: number;
        comment_count: number;
        viewer_liked: boolean;
      }>) {
        counts.set(r.proof_id, r);
      }
    }
  }

  // Faces for the "Liked by X and N others" line. One query for the page,
  // batched the same way the counts above are.
  const likePreviews = await getFacepiles(supabase, "proof_likes", ids, 3);

  return data.map((row) => {
    // PostgREST types single-FK joins as arrays; cast via unknown
    const profile = row.profiles as unknown as {
      full_name: string | null;
      avatar_url: string | null;
      verification_status: string | null;
    } | null;
    const challenge = row.challenges as unknown as { title: string | null } | null;

    return {
      id: row.id as string,
      // Carried so the card knows whether the viewer owns this proof, which
      // decides who may moderate its comments.
      authorId: row.user_id as string,
      authorName: profile?.full_name ?? "Anonymous",
      authorAvatarUrl:
        profile?.avatar_url ??
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.user_id}`,
      verified: profile?.verification_status === "approved",
      category: (challenge?.title ?? "CHALLENGE").toUpperCase(),
      dayLabel: relativeLabel(row.submitted_at as string),
      streakDay: (row.day_number as number) ?? 1,
      proofImageUrl: row.media_url as string,
      mediaWidth: (row.media_width as number | null) ?? null,
      mediaHeight: (row.media_height as number | null) ?? null,
      caption: (row.caption as string) ?? "",
      likeCount: counts.get(row.id as string)?.like_count ?? 0,
      likePreview: likePreviews.get(row.id as string)?.people ?? [],
      commentCount: counts.get(row.id as string)?.comment_count ?? 0,
      viewerHasLiked: counts.get(row.id as string)?.viewer_liked ?? false,
      adminRemoved: Boolean(row.admin_removed),
    };
  });
}
