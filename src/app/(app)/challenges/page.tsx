/**
 * app/(app)/challenges/page.tsx — every current challenge, with Join.
 *
 * NEW: the Challenges tab in the bottom bar needed somewhere to land. Until
 * now /challenges had no index at all, only /challenges/[id] and
 * /challenges/new, so the route 404'd.
 *
 * It is the discovery screen opened on the Challenges tab rather than a
 * second implementation: same fetch, same cards, same Join buttons, same
 * search box. Two lists of challenges maintained separately would eventually
 * disagree about which ones are current, and the Join flow is the part least
 * worth duplicating.
 *
 * Quests stay reachable from the toggle, so nothing is lost by landing here.
 */

import { createClient } from "@/lib/supabase/server";
import { getDiscoveryData } from "@/lib/data/discovery";
import { ExploreClient } from "../explore/ExploreClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Challenges",
  description: "Every challenge running on StrivUp right now. Join one.",
};

export default async function ChallengesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { featured, trending, quests, mine } = await getDiscoveryData(
    supabase,
    user?.id ?? null
  );

  return (
    <div className="min-h-screen bg-surface">
      <ExploreClient
        featured={featured}
        trending={trending}
        quests={quests}
        mine={mine}
        initialView="challenges"
      />
    </div>
  );
}
