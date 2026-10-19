/**
 * src/lib/data/proofRequirements.ts — read/write the per-task proof spec.
 *
 * One row per task, in either domain (quest_task_id or challenge_task_id,
 * never both — proof_req_one_domain_check enforces it). The row is what the
 * participant is shown before uploading and what review-proof judges against,
 * so the two can never drift apart.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProofCategoryId } from "@/lib/proof/categories";

export interface ProofRequirement {
  id: string;
  quest_task_id: string | null;
  challenge_task_id: string | null;
  activity_category: ProofCategoryId;
  custom_activity: string | null;
  activity_label: string;
  required_elements: string[];
  optional_elements: string[];
  reject_if: string[];
  participant_hint: string | null;
  generated_by: "template" | "ai" | "creator";
}

export interface ProofRequirementInput {
  activity_category: ProofCategoryId;
  custom_activity: string | null;
  activity_label: string;
  required_elements: string[];
  optional_elements: string[];
  reject_if: string[];
  participant_hint: string;
  generated_by: "template" | "ai" | "creator";
}

/* ── Reads ───────────────────────────────────────────────────────────────── */

export async function getQuestProofRequirements(
  supabase: SupabaseClient,
  questId: string
): Promise<Map<string, ProofRequirement>> {
  const { data, error } = await supabase
    .from("proof_requirements")
    .select("*, quest_tasks!quest_task_id ( quest_id )")
    .not("quest_task_id", "is", null);

  if (error) {
    console.error("[getQuestProofRequirements]", error.message);
    return new Map();
  }

  const map = new Map<string, ProofRequirement>();
  for (const row of data ?? []) {
    const task = row.quest_tasks as unknown as { quest_id: string } | null;
    if (task?.quest_id !== questId) continue;
    map.set(row.quest_task_id as string, row as ProofRequirement);
  }
  return map;
}

export async function getChallengeProofRequirements(
  supabase: SupabaseClient,
  challengeId: string
): Promise<Map<string, ProofRequirement>> {
  const { data, error } = await supabase
    .from("proof_requirements")
    .select("*, challenge_tasks!challenge_task_id ( challenge_id )")
    .not("challenge_task_id", "is", null);

  if (error) {
    console.error("[getChallengeProofRequirements]", error.message);
    return new Map();
  }

  const map = new Map<string, ProofRequirement>();
  for (const row of data ?? []) {
    const task = row.challenge_tasks as unknown as { challenge_id: string } | null;
    if (task?.challenge_id !== challengeId) continue;
    map.set(row.challenge_task_id as string, row as ProofRequirement);
  }
  return map;
}

/* ── Writes ──────────────────────────────────────────────────────────────── */

async function upsertFor(
  supabase: SupabaseClient,
  key: "quest_task_id" | "challenge_task_id",
  taskId: string,
  input: ProofRequirementInput
): Promise<{ error: string | null }> {
  /* A spec with nothing required would accept any image at all, which is worse
     than having no spec — the UI would promise checks that never happen. */
  if (input.required_elements.length === 0) {
    return { error: "Add at least one thing the proof must show." };
  }

  const { error } = await supabase.from("proof_requirements").upsert(
    {
      [key]: taskId,
      /* Null the other domain explicitly — the one-domain CHECK rejects a row
         carrying both. */
      [key === "quest_task_id" ? "challenge_task_id" : "quest_task_id"]: null,
      activity_category: input.activity_category,
      custom_activity: input.custom_activity,
      activity_label: input.activity_label,
      required_elements: input.required_elements,
      optional_elements: input.optional_elements,
      reject_if: input.reject_if,
      participant_hint: input.participant_hint,
      generated_by: input.generated_by,
    },
    { onConflict: key }
  );

  return { error: error?.message ?? null };
}

export function upsertQuestTaskProofRequirement(
  supabase: SupabaseClient,
  questTaskId: string,
  input: ProofRequirementInput
) {
  return upsertFor(supabase, "quest_task_id", questTaskId, input);
}

export function upsertChallengeTaskProofRequirement(
  supabase: SupabaseClient,
  challengeTaskId: string,
  input: ProofRequirementInput
) {
  return upsertFor(supabase, "challenge_task_id", challengeTaskId, input);
}
