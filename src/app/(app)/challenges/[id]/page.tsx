/**
 * app/(app)/challenges/[id]/page.tsx — Challenge Detail server page
 *
 * Fetches all data server-side and passes typed props to ChallengeDetailClient.
 * In Next.js 16, `params` is a Promise and must be awaited.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getChallengeDetail,
  getChallengeStats,
  getChallengeLeaderboard,
  getParticipantJoinedAt,
} from "@/lib/data/challenges";
import { getFeedPosts } from "@/lib/data/feed";
import { ChallengeDetailClient } from "./ChallengeDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ChallengeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Get current user (nullable — works for unauthenticated visits too)
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch everything in parallel for speed
  const [baseDetail, stats, leaderboard, feed, joinedAt] = await Promise.all([
    getChallengeDetail(supabase, id),
    getChallengeStats(supabase, id, user?.id),
    getChallengeLeaderboard(supabase, id, 3),
    getFeedPosts(supabase, { challengeId: id, limit: 10 }),
    user ? getParticipantJoinedAt(supabase, id, user.id) : Promise.resolve(null),
  ]);

  if (!baseDetail) notFound();

  // Merge stats into the full ChallengeDetail shape
  const challenge = {
    ...baseDetail,
    activeCount: stats.activeCount,
    memberCount: stats.memberCount,
    successPercent: stats.successPercent,
    currentStreak: stats.currentStreak,
  };

  return (
    <ChallengeDetailClient
      challenge={challenge}
      leaderboard={leaderboard}
      feed={feed}
      userId={user?.id ?? null}
      joinedAt={joinedAt}
    />
  );
}
