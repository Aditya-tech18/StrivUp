/**
 * src/lib/data/discovery.ts — the one fetch behind both discovery routes.
 *
 * /explore and /challenges show the same two datasets; they differ only in
 * which tab opens first. Extracted here so the two pages cannot drift into
 * disagreeing about what "all current challenges" means, and so a change to
 * the query is made once.
 *
 * Lifted verbatim out of app/(app)/explore/page.tsx. The query, the limits
 * and the error handling are unchanged.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getFeaturedChallenges,
  getMyChallenges,
  getTrendingChallenges,
} from "@/lib/data/challenges";
import type {
  FeaturedChallenge,
  TrendingChallenge,
  FeaturedQuest,
} from "@/app/(app)/explore/page";

export interface DiscoveryData {
  featured: FeaturedChallenge[];
  trending: TrendingChallenge[];
  quests: FeaturedQuest[];
  /** Everything the viewer joined or created, for the My Challenges tab. */
  mine: TrendingChallenge[];
}

export async function getDiscoveryData(
  supabase: SupabaseClient,
  viewerId: string | null
): Promise<DiscoveryData> {
  const [featured, trending, mine, questRes] = await Promise.all([
    getFeaturedChallenges(supabase),
    getTrendingChallenges(supabase, viewerId),
    getMyChallenges(supabase, viewerId),
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
    console.error("[getDiscoveryData] quests", questRes.error.message);
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

  return { featured, trending, quests, mine };
}
