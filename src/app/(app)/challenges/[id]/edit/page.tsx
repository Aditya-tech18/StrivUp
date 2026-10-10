/**
 * /challenges/[id]/edit — edit a challenge you created.
 *
 * Creator-only, enforced here and again by RLS: the challenges table carries
 * "Creators can update their own challenges" (USING auth.uid() = creator_id),
 * so a crafted request cannot write a row this page would have refused to
 * open. A visitor who is not the creator gets a 404 rather than a 403, which
 * is how the rest of the app treats rows you may not touch.
 *
 * Deliberately not the six-step create wizard. People have already joined
 * these challenges, and their progress is keyed to the schedule, so duration
 * and the daily proof are left alone; what can change is how the challenge
 * presents itself.
 */

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditChallengeClient } from "./EditChallengeClient";

export const dynamic = "force-dynamic";

export default async function EditChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/challenges/${id}/edit`);

  const { data: challenge } = await supabase
    .from("challenges")
    .select(
      "id, creator_id, title, description, category, visibility, thumbnail_url, reward_description, proof_instructions, duration_days"
    )
    .eq("id", id)
    .maybeSingle();

  if (!challenge || challenge.creator_id !== user.id) notFound();

  const { count } = await supabase
    .from("challenge_participants")
    .select("id", { count: "exact", head: true })
    .eq("challenge_id", id);

  return (
    <EditChallengeClient
      challenge={{
        id: challenge.id as string,
        title: (challenge.title as string) ?? "",
        description: (challenge.description as string | null) ?? "",
        category: (challenge.category as string | null) ?? "",
        visibility:
          (challenge.visibility as string) === "private" ? "private" : "public",
        thumbnailUrl: (challenge.thumbnail_url as string | null) ?? null,
        rewardDescription:
          (challenge.reward_description as string | null) ?? "",
        proofInstructions:
          (challenge.proof_instructions as string | null) ?? "",
        durationDays: (challenge.duration_days as number | null) ?? null,
      }}
      memberCount={count ?? 0}
    />
  );
}
