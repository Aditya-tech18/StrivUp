/**
 * app/(app)/explore/page.tsx — Explore / Challenge Discovery
 *
 * Server component: fetches challenges and quests from Supabase and passes
 * them to ExploreClient, which owns the header, the Quests/Challenges toggle
 * and the search box. Both lists are fetched up front so switching tabs and
 * searching are instant and need no network.
 */

import { createClient } from "@/lib/supabase/server";
import { getFeaturedChallenges, getTrendingChallenges } from "@/lib/data/challenges";
import { ExploreClient } from "./ExploreClient";

/* ── Public types — re-exported so ExploreClient and challenges.ts can import */
export interface FeaturedChallenge {
  id: string;
  title: string;
  creatorName: string;
  coverImageUrl: string;
  memberCount: number;
  durationLabel: string;
  verified: boolean;
}

export interface TrendingChallenge {
  id: string;
  title: string;
  creatorName: string;
  thumbnailUrl: string;
  currentDay: number;
  totalDays: number;
  memberCount: number;
  progressPercent: number;
  visibility: "public" | "private";
  isParticipant: boolean;
}

/**
 * Business Quests shown in discovery. ExploreClient already renders this
 * section and imports this type; the fetch below is the half that was missing,
 * which is why the production build could not resolve it.
 */
export interface FeaturedQuest {
  id: string;
  title: string;
  cover_url: string | null;
  thumbnail_url: string | null;
  business_name: string | null;
  category: string | null;
  location_name: string | null;
  participant_count: number;
  rewards: { id: string }[] | null;
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default async function ExplorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [featured, trending, questRes] = await Promise.all([
    getFeaturedChallenges(supabase),
    getTrendingChallenges(supabase, user?.id ?? null),
    supabase
      .from("quests")
      .select(
        "id, title, cover_url, thumbnail_url, business_name, category, location_name, participant_count, quest_rewards!quest_id ( id )"
      )
      .in("quest_status", ["active", "published"])
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (questRes.error) {
    // Discovery still works without the Quest rail; don't fail the whole page.
    console.error("[ExplorePage] quests", questRes.error.message);
  }

  const quests: FeaturedQuest[] = (questRes.data ?? []).map((q) => ({
    id: q.id as string,
    title: q.title as string,
    cover_url: (q.cover_url as string | null) ?? null,
    thumbnail_url: (q.thumbnail_url as string | null) ?? null,
    business_name: (q.business_name as string | null) ?? null,
    category: (q.category as string | null) ?? null,
    location_name: (q.location_name as string | null) ?? null,
    participant_count: (q.participant_count as number | null) ?? 0,
    rewards: (q.quest_rewards as { id: string }[] | null) ?? null,
  }));

  return (
    <div className="min-h-screen bg-surface">
      {/* The header lives in ExploreClient because the Quests/Challenges
          toggle sits inside it and is client state. Keeping them in one
          element is what makes the whole bar stick as a single block under
          the notch, rather than two stacked sticky bars whose offsets have to
          be kept in sync by hand. */}
      <ExploreClient featured={featured} trending={trending} quests={quests} />
    </div>
  );
}
