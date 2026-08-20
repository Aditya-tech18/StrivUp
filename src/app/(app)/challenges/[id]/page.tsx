/**
 * app/(app)/challenges/[id]/page.tsx — Challenge Detail server page
 *
 * Fetches all data server-side and passes typed props to ChallengeDetailClient.
 * In Next.js 16, `params` is a Promise and must be awaited.
 *
 * isParticipant = true when the user has a challenge_participants row
 * (joinedAt !== null). This gates the task-list / upload section in the client.
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
import { getChallengeTasks, getUserTaskSubmissions } from "@/lib/data/tasks";
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
  const [baseDetail, stats, leaderboard, feed, joinedAt, tasks] = await Promise.all([
    getChallengeDetail(supabase, id),
    getChallengeStats(supabase, id, user?.id),
    getChallengeLeaderboard(supabase, id, 3),
    getFeedPosts(supabase, { challengeId: id, limit: 10 }),
    user ? getParticipantJoinedAt(supabase, id, user.id) : Promise.resolve(null),
    getChallengeTasks(supabase, id),
  ]);

  if (!baseDetail) notFound();

  // isParticipant: user has a challenge_participants row for this challenge
  const isParticipant = joinedAt !== null;

  // Fetch this user's submissions only if they are a participant
  const userSubmissions =
    user && isParticipant
      ? await getUserTaskSubmissions(supabase, id, user.id)
      : [];

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
      isParticipant={isParticipant}
      tasks={tasks}
      userSubmissions={userSubmissions}
    />
  );
}
