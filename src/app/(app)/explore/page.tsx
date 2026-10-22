/**
 * app/(app)/explore/page.tsx — Explore / Challenge Discovery
 *
 * Server component: fetches challenges and quests from Supabase and passes
 * them to ExploreClient, which owns the header, the Quests/Challenges toggle
 * and the search box. Both lists are fetched up front so switching tabs and
 * searching are instant and need no network.
 */

import { createClient } from "@/lib/supabase/server";
import { getDiscoveryData } from "@/lib/data/discovery";
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

  // CHANGED: the fetch moved to lib/data/discovery.ts so /challenges can run
  // the same one. Behaviour here is identical.
  const { featured, trending, quests, mine } = await getDiscoveryData(
    supabase,
    user?.id ?? null
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* The header lives in ExploreClient because the Quests/Challenges
          toggle sits inside it and is client state. Keeping them in one
          element is what makes the whole bar stick as a single block under
          the notch, rather than two stacked sticky bars whose offsets have to
          be kept in sync by hand. */}
      <ExploreClient featured={featured} trending={trending} quests={quests} mine={mine} />
    </div>
  );
}
