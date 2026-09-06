/**
 * src/app/(app)/creator/quests/[id]/participants/page.tsx — Quest participants review
 *
 * Creator-only page (404 for non-creators) listing all participants with their
 * proof media, verification status, and Approve/Reject actions.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getQuestDetail, getQuestParticipants } from "@/lib/data/quests";
import QuestParticipantsClient from "./QuestParticipantsClient";

export const dynamic = "force-dynamic";

interface QuestParticipantsPageProps {
  params: Promise<{ id: string }>;
}

export default async function QuestParticipantsPage({
  params,
}: QuestParticipantsPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  // Fetch quest
  const quest = await getQuestDetail(supabase, id);
  if (!quest) {
    notFound();
  }

  // Auth gate: only creator can review
  if (quest.creator_id !== user.id) {
    notFound();
  }

  // Fetch participants
  const participants = await getQuestParticipants(supabase, id);

  return (
    <QuestParticipantsClient questId={id} questTitle={quest.title} participants={participants} />
  );
}
