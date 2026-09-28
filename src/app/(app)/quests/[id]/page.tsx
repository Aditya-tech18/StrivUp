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
    return <BusinessQuestDetailClient quest={bizQuest} currentUserId={user?.id ?? null} />;
  }

  // Fallback to legacy quest
  const quest = await getQuestDetail(supabase, id);
  if (!quest) notFound();

  return <QuestDetailClient quest={quest} currentUserId={user?.id ?? null} />;
}
