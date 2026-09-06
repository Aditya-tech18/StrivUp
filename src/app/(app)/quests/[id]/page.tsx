/**
 * src/app/(app)/quests/[id]/page.tsx — Quest detail (server component)
 *
 * Shows quest details with conditional UI based on:
 *  - Not joined: "Join Quest" CTA
 *  - Joined + proof_type='photo': upload area with state machine
 *  - Joined + proof_type='checkin': "Mark as Visited" button
 *  - Joined + proof_type='none': auto-approved on join
 *
 * Handles rejection reason + resubmit flow, and verification states.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getQuestDetail } from "@/lib/data/quests";
import QuestDetailClient from "./QuestDetailClient";

export const dynamic = "force-dynamic";

interface QuestDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function QuestDetailPage({ params }: QuestDetailPageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const quest = await getQuestDetail(supabase, id);

  if (!quest) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <QuestDetailClient quest={quest} currentUserId={user?.id ?? null} />
  );
}
