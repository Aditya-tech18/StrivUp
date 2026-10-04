/**
 * /quests/[id] — Quest detail (server component)
 *
 * Supports both:
 * - Legacy quests (status = 'active', proof_type simple)
 * - Business quests (quest_status = 'active'|'published', with tasks/rewards)
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getQuestDetail, getBusinessQuestDetail } from "@/lib/data/quests";
import QuestDetailClient from "./QuestDetailClient";
import BusinessQuestDetailClient from "./BusinessQuestDetailClient";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ id: string }> }

export default async function QuestDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Try business quest first (has tasks/rewards)
  const bizQuest = await getBusinessQuestDetail(supabase, id);
  if (bizQuest && bizQuest.tasks.length > 0) {
    // The verification prompt greets the user by name, so read it here rather
    // than round-tripping to the browser for it.
    let userName: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .maybeSingle();
      userName = profile?.full_name ?? profile?.username ?? null;
    }

    return (
      <BusinessQuestDetailClient
        quest={bizQuest}
        currentUserId={user?.id ?? null}
        currentUserName={userName}
      />
    );
  }

  // Fallback to legacy quest
  const quest = await getQuestDetail(supabase, id);
  if (!quest) notFound();

  return <QuestDetailClient quest={quest} currentUserId={user?.id ?? null} />;
}
