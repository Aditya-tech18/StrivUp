/**
 * src/app/(app)/quests/page.tsx — Quests discovery (server component)
 *
 * Fetches hot quests and trending quests, passes to QuestsClient for
 * filtering, geolocation, and interactive state management.
 */

import { createClient } from "@/lib/supabase/server";
import { getHotQuests, getTrendingQuests, getQuestCategories } from "@/lib/data/quests";
import QuestsClient from "./QuestsClient";

export const dynamic = "force-dynamic";

export default async function QuestsPage() {
  const supabase = await createClient();

  const [hotQuests, trendingQuests, categories] = await Promise.all([
    getHotQuests(supabase),
    getTrendingQuests(supabase),
    getQuestCategories(supabase),
  ]);

  return (
    <QuestsClient
      initialHotQuests={hotQuests}
      initialTrendingQuests={trendingQuests}
      availableCategories={categories}
    />
  );
}
