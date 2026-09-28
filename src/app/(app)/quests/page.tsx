/**
 * src/app/(app)/quests/page.tsx — Quests discovery (server component)
 * Surfaces both legacy quests (status='active') and business quests (quest_status='active')
 */

import { createClient } from "@/lib/supabase/server";
import { getHotQuests, getTrendingQuests, getQuestCategories } from "@/lib/data/quests";
import QuestsClient from "./QuestsClient";
import type { Quest } from "@/lib/data/quests";

export const dynamic = "force-dynamic";

export default async function QuestsPage() {
  const supabase = await createClient();

  const [hotQuests, trendingQuests, categories, businessQuestsRes] = await Promise.all([
    getHotQuests(supabase),
    getTrendingQuests(supabase),
    getQuestCategories(supabase),
    supabase
      .from("quests")
      .select("id,title,description,category,business_name,location_name,reward_description,is_hot,thumbnail_url,cover_url,participant_count,quest_status,visibility")
      .in("quest_status", ["active", "published"])
      .eq("visibility", "public")
      .order("participant_count", { ascending: false })
      .limit(30),
  ]);

  // Convert business quests to Quest shape (only fields in Quest interface)
  const bizQuests: Quest[] = (businessQuestsRes.data ?? []).map((q: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    business_name: string | null;
    location_name: string | null;
    reward_description: string | null;
    is_hot: boolean;
    thumbnail_url: string | null;
    cover_url: string | null;
    participant_count: number;
  }) => ({
    id: q.id,
    title: q.title,
    category: q.category ?? "",
    business_name: q.business_name ?? "",
    location_name: q.location_name ?? "",
    reward_description: q.reward_description ?? "",
    is_hot: q.is_hot ?? false,
    thumbnail_url: q.thumbnail_url ?? q.cover_url,
    participant_count: q.participant_count ?? 0,
    status: "active" as const,
  }));

  // Merge: deduplicate by id, business quests first if they have participants
  const allIds = new Set<string>();
  const mergedTrending: Quest[] = [];
  for (const q of [...bizQuests, ...trendingQuests]) {
    if (!allIds.has(q.id)) {
      allIds.add(q.id);
      mergedTrending.push(q);
    }
  }

  // Hot quests: include business quests with participant_count > 5
  const allHotIds = new Set<string>(hotQuests.map(q => q.id));
  const bizHot = bizQuests.filter(q => q.participant_count > 5 && !allHotIds.has(q.id));
  const mergedHot = [...hotQuests, ...bizHot];

  // Merge categories
  const bizCategories = [...new Set(bizQuests.map(q => q.category).filter(Boolean))] as string[];
  const allCategories = [...new Set([...categories, ...bizCategories])].sort();

  return (
    <QuestsClient
      initialHotQuests={mergedHot}
      initialTrendingQuests={mergedTrending}
      availableCategories={allCategories}
    />
  );
}
