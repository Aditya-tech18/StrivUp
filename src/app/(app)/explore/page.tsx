/**
 * Explore — Discovery page for challenges AND business quests.
 */
import Link from "next/link";
import { Flame, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getFeaturedChallenges, getTrendingChallenges } from "@/lib/data/challenges";
import { ExploreClient } from "./ExploreClient";

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

export interface FeaturedQuest {
  id: string;
  title: string;
  business_name: string | null;
  cover_url: string | null;
  thumbnail_url: string | null;
  participant_count: number;
  category: string | null;
  end_date: string | null;
  rewards: boolean;
}

export default async function ExplorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [featured, trending, questsData] = await Promise.all([
    getFeaturedChallenges(supabase),
    getTrendingChallenges(supabase, user?.id ?? null),
    supabase
      .from("quests")
      .select("id,title,business_name,cover_url,thumbnail_url,participant_count,category,end_date")
      .in("quest_status", ["active","published"])
      .eq("visibility", "public")
      .order("participant_count", { ascending: false })
      .limit(10),
  ]);

  // Check which quests have rewards
  const quests: FeaturedQuest[] = await Promise.all(
    (questsData.data ?? []).map(async (q: {
      id: string;
      title: string;
      business_name: string | null;
      cover_url: string | null;
      thumbnail_url: string | null;
      participant_count: number;
      category: string | null;
      end_date: string | null;
    }) => {
      const { count } = await supabase
        .from("quest_rewards")
        .select("id", { count: "exact", head: true })
        .eq("quest_id", q.id);
      return { ...q, rewards: (count ?? 0) > 0 };
    })
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-outline-variant">
        <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-container flex items-center justify-center">
              <Flame size={16} className="text-on-primary" />
            </div>
            <span className="type-label-caps text-secondary tracking-widest font-semibold">STRIV</span>
          </div>
          <Link href="/search"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors">
            <Search size={20} strokeWidth={1.75} />
          </Link>
        </div>
      </header>

      <ExploreClient featured={featured} trending={trending} quests={quests} />
    </div>
  );
}
