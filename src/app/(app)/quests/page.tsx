/**
 * src/app/(app)/quests/page.tsx — Quests discovery (server component)
 * Surfaces both legacy quests (status='active') and business quests (quest_status='active')
 */

import { createClient } from "@/lib/supabase/server";
import { getHotQuests, getTrendingQuests, getQuestCategories, QUEST_SCHEDULE_FIELDS } from "@/lib/data/quests";
import { questPhase, type QuestSchedule } from "@/lib/participation";
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
      .select(`id,title,description,category,business_name,location_name,reward_description,is_hot,thumbnail_url,cover_url,participant_count,${QUEST_SCHEDULE_FIELDS}`)
      .in("quest_status", ["active", "published", "completed", "expired"])
      .eq("visibility", "public")
      .order("participant_count", { ascending: false })
      .limit(30),
  ]);

  // Convert business quests to Quest shape (only fields in Quest interface)
  const bizQuests: Quest[] = (businessQuestsRes.data ?? []).map((q: QuestSchedule & {
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
    quest_status: q.quest_status,
    business_id: q.business_id,
    start_date: q.start_date,
    end_date: q.end_date,
    starts_at: q.starts_at,
    ends_at: q.ends_at,
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
  mergedTrending.sort((a, b) => Number(questPhase(a) === "closed") - Number(questPhase(b) === "closed"));

  // Hot quests: include business quests with participant_count > 5
  const allHotIds = new Set<string>(hotQuests.map(q => q.id));
  const bizHot = bizQuests.filter(q => q.participant_count > 5 && !allHotIds.has(q.id));
  const mergedHot = [...hotQuests, ...bizHot];

  // Merge categories
  const bizCategories = [...new Set(bizQuests.map(q => q.category).filter(Boolean))] as string[];
  const allCategories = [...new Set([...categories, ...bizCategories])].sort();

  /* The viewer's own quests, for the My Quest tab. Resolved from the merged
     list rather than with a second quest query: the ids come from
     quest_participants, and every quest a participant can see is already in
     mergedTrending. */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let myQuests: Quest[] = [];
  if (user) {
    const { data: joined, error: joinedError } = await supabase
      .from("quest_participants")
      .select("quest_id")
      .eq("user_id", user.id);

    if (joinedError) {
      console.error("[QuestsPage] my quests", joinedError.message);
    } else {
      const mineIds = new Set((joined ?? []).map((r) => r.quest_id as string));
      myQuests = mergedTrending.filter((q) => mineIds.has(q.id));
    }
  }

  return (
    <QuestsClient
      initialHotQuests={mergedHot}
      initialTrendingQuests={mergedTrending}
      availableCategories={allCategories}
      myQuests={myQuests}
    />
  );
}
