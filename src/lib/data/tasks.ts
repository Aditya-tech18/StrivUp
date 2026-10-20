/**
 * src/lib/data/tasks.ts — data helpers for challenge_tasks and proof review
 *
 * Used by:
 *   - challenges/[id]/page.tsx                       (load tasks + user submissions)
 *   - creator/challenges/[id]/submissions/page.tsx   (load review queue)
 *   - creator/challenges/[id]/manage-tasks/page.tsx  (add/remove tasks to existing challenge)
 *   - ChallengeDetailClient.tsx                      (client-side upload / resubmit)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/* ── Public types ────────────────────────────────────────────────────────── */

export type ProofType = "photo" | "video" | "text" | "link" | "none";
export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface ChallengeTask {
  id: string;
  title: string;
  description: string | null;
  proofType: ProofType | null;
  isRequired: boolean;
  sortOrder: number;
}

/** The current user's submission state for one task */
export interface TaskSubmission {
  submissionId: string;
  taskId: string | null;
  status: SubmissionStatus;
  rejectionReason: string | null;
  mediaUrl: string | null;
  dayNumber: number;
}

/** One row in the creator review queue */
export interface ReviewSubmission {
  submissionId: string;
  challengeId: string;
  taskId: string | null;
  taskTitle: string | null;
  userId: string;
  userName: string;
  userAvatarUrl: string;
  status: SubmissionStatus;
  mediaUrl: string | null;
  caption: string | null;
  submittedAt: string;
  dayNumber: number;
  rejectionReason: string | null;
}

/* ── Read helpers ────────────────────────────────────────────────────────── */

/** Fetch tasks for a challenge, ordered by sort_order asc */
export async function getChallengeTasks(
  supabase: SupabaseClient,
  challengeId: string
): Promise<ChallengeTask[]> {
  const { data, error } = await supabase
    .from("challenge_tasks")
    .select("id, title, description, proof_type, is_required, sort_order")
    .eq("challenge_id", challengeId)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    if (error) console.error("[getChallengeTasks]", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    proofType: (row.proof_type as ProofType | null) ?? null,
    isRequired: (row.is_required as boolean) ?? true,
    sortOrder: (row.sort_order as number) ?? 0,
  }));
}

/**
 * Fetch the current user's submissions for a challenge — keyed by task_id
 * (or "no-task" for the legacy single-proof-per-day flow).
 */
export async function getUserTaskSubmissions(
  supabase: SupabaseClient,
  challengeId: string,
  userId: string
): Promise<TaskSubmission[]> {
  const { data, error } = await supabase
    .from("proof_submissions")
    .select("id, task_id, verification_status, rejection_reason, media_url, day_number")
    .eq("challenge_id", challengeId)
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false });

  if (error || !data) {
    if (error) console.error("[getUserTaskSubmissions]", error.message);
    return [];
  }

  return data.map((row) => ({
    submissionId: row.id as string,
    taskId: (row.task_id as string | null) ?? null,
    status: (row.verification_status as SubmissionStatus) ?? "pending",
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    mediaUrl: (row.media_url as string | null) ?? null,
    dayNumber: (row.day_number as number) ?? 1,
  }));
}

/**
 * Fetch all submissions for a challenge for the creator review queue.
 * filter: 'all' | 'pending' | 'approved' | 'rejected'
 */
export async function getSubmissionsForReview(
  supabase: SupabaseClient,
  challengeId: string,
  filter: "all" | SubmissionStatus = "all"
): Promise<ReviewSubmission[]> {
  let q = supabase
    .from("proof_submissions")
    .select(
      `
      id, challenge_id, task_id, user_id,
      verification_status, media_url, caption,
      submitted_at, day_number, rejection_reason,
      profiles!user_id ( full_name, avatar_url ),
      challenge_tasks!task_id ( title )
      `
    )
    .eq("challenge_id", challengeId)
    .order("submitted_at", { ascending: false });

  if (filter !== "all") {
    q = q.eq("verification_status", filter);
  }

  const { data, error } = await q;

  if (error || !data) {
    if (error) console.error("[getSubmissionsForReview]", error.message);
    return [];
  }

  return data.map((row) => {
    const profile = row.profiles as unknown as {
      full_name: string | null;
      avatar_url: string | null;
    } | null;
    const task = row.challenge_tasks as unknown as { title: string | null } | null;
    const userId = row.user_id as string;

    return {
      submissionId: row.id as string,
      challengeId: row.challenge_id as string,
      taskId: (row.task_id as string | null) ?? null,
      taskTitle: task?.title ?? null,
      userId,
      userName: profile?.full_name ?? "Anonymous",
      userAvatarUrl:
        profile?.avatar_url ??
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`,
      status: (row.verification_status as SubmissionStatus) ?? "pending",
      mediaUrl: (row.media_url as string | null) ?? null,
      caption: (row.caption as string | null) ?? null,
      submittedAt: row.submitted_at as string,
      dayNumber: (row.day_number as number) ?? 1,
      rejectionReason: (row.rejection_reason as string | null) ?? null,
    };
  });
}

/* ── Write helpers (called from client components) ───────────────────────── */

/**
 * Approve a proof submission.
 * Sets verification_status = 'approved', records reviewer + timestamp.
 */
export async function approveSubmission(
  supabase: SupabaseClient,
  submissionId: string,
  reviewerId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("proof_submissions")
    .update({
      verification_status: "approved",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", submissionId);

  return { error: error?.message ?? null };
}

/**
 * Reject a proof submission with a required reason.
 * Sets verification_status = 'rejected'.
 */
export async function rejectSubmission(
  supabase: SupabaseClient,
  submissionId: string,
  reviewerId: string,
  rejectionReason: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("proof_submissions")
    .update({
      verification_status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejectionReason,
    })
    .eq("id", submissionId);

  return { error: error?.message ?? null };
}

/**
 * Replace all tasks for a challenge.
 * Deletes existing tasks, then inserts the new list in sort_order.
 * Used by the Manage Tasks page for both new and existing challenges.
 *
 * Returns { error } — null on success, string on failure.
 */
export interface TaskInput {
  title: string;
  description?: string | null;
  proofType?: string | null;
  isRequired?: boolean;
}

export async function replaceChallengeTasks(
  supabase: SupabaseClient,
  challengeId: string,
  tasks: TaskInput[]
): Promise<{ error: string | null }> {
  // 1. Delete all existing tasks for this challenge
  const { error: deleteError } = await supabase
    .from("challenge_tasks")
    .delete()
    .eq("challenge_id", challengeId);

  if (deleteError) return { error: deleteError.message };

  // 2. Insert new tasks (skip if list is empty)
  if (tasks.length === 0) return { error: null };

  const rows = tasks.map((t, idx) => ({
    challenge_id: challengeId,
    title: t.title.trim(),
    description: t.description?.trim() || null,
    proof_type: t.proofType ?? "none",
    is_required: t.isRequired ?? true,
    sort_order: idx,
  }));

  const { error: insertError } = await supabase
    .from("challenge_tasks")
    .insert(rows);

  return { error: insertError?.message ?? null };
}
