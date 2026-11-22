/**
 * src/lib/data/proofs.ts
 *
 * Uploading a proof and getting it reviewed.
 *
 * Lifted out of ChallengeDetailClient so the composer and the per-task tiles
 * run the same code. Two copies of "compress, upload, insert, review" would
 * drift, and the review half has already produced real bugs — a resubmit that
 * kept the previous verdict's fields and stranded itself in pending forever,
 * for one.
 */

import { createClient } from "@/lib/supabase/client";
import { compressImage, IMAGE_PRESETS } from "@/lib/image";
import { observeProofReview, type ProofReviewResult } from "./proofReviewStatus";

/** Day 1 is the day you joined, not the day after. */
export function calcDayNumber(joinedAt: string | null): number {
  if (!joinedAt) return 1;
  const ms = Date.now() - new Date(joinedAt).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

/* ── Upload logic (shared between legacy and per-task modes) ─────────────── */
export interface UploadOpts {
  challengeId: string;
  userId: string | null;
  joinedAt: string | null;
  taskId?: string | null;
  caption?: string;
  /** If set, PATCH this row instead of INSERT (for resubmits) */
  existingSubmissionId?: string | null;
}

export type SlotState = "idle" | "uploading" | "reviewing" | "pending" | "approved" | "rejected" | "error";
export interface SlotData {
  state: SlotState;
  preview: string | null;
  error: string | null;
  rejectionReason: string | null;
}

export type UploadResult =
  | { submissionId: string; preview: string; error: null }
  | { submissionId: null; preview: null; error: string };

export async function uploadProof(opts: UploadOpts, file: File): Promise<UploadResult> {
  const { challengeId, userId, joinedAt, taskId, existingSubmissionId, caption } = opts;

  if (!userId) return { submissionId: null, preview: null, error: "Sign in to upload proof." };

  const supabase = createClient();
  const dayNumber = calcDayNumber(joinedAt);

  // 1. Compress client-side. Videos and GIFs pass through untouched; EXIF
  //    rotation is baked in so portrait phone photos stop arriving sideways.
  //    Dimensions come back so the feed can lay the image out at its real
  //    aspect ratio instead of cropping it into a 16:9 box.
  const { file: resized, width, height } = await compressImage(file, IMAGE_PRESETS.proof);

  // 2. Upload to storage
  const ext = resized.name.split(".").pop() ?? "jpg";
  const path = `${userId}/proofs/${challengeId}/${taskId ?? "main"}/${dayNumber}-${Date.now()}.${ext}`;
  const { error: storageError } = await supabase.storage
    .from("proof-media")
    .upload(path, resized, { upsert: false });
  if (storageError) return { submissionId: null, preview: null, error: storageError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("proof-media").getPublicUrl(path);

  // 2. Upsert proof_submissions row — return the id for the review-proof call
  let submissionId: string;
  if (existingSubmissionId) {
    // Resubmit: PATCH the existing row
    const { error: updateError } = await supabase
      .from("proof_submissions")
      .update({
        media_url: publicUrl,
        ...(caption === undefined ? {} : { caption }),
        verification_status: "pending",
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        submitted_at: new Date().toISOString(),
        // Clear the previous verdict. Leaving ai_reviewed/file_hash set from the
        // last attempt is what used to strand resubmissions in pending forever
        // and leave a stale hash behind for the dedupe check.
        ai_reviewed: false,
        ai_classification: null,
        ai_confidence: null,
        ai_reasoning: null,
        file_hash: null,
        media_width: width || null,
        media_height: height || null,
      })
      .eq("id", existingSubmissionId)
      .abortSignal(AbortSignal.timeout(15_000))
      .select("id")
      .single();
    if (updateError) return { submissionId: null, preview: null, error: updateError.message };
    submissionId = existingSubmissionId;
  } else {
    const { data: insertedRow, error: insertError } = await supabase
      .from("proof_submissions")
      .insert({
        challenge_id: challengeId,
        user_id: userId,
        media_width: width || null,
        media_height: height || null,
        day_number: dayNumber,
        task_id: taskId ?? null,
        media_url: publicUrl,
        ...(caption === undefined ? {} : { caption }),
        verification_status: "pending",
      })
      .select("id")
      .abortSignal(AbortSignal.timeout(15_000))
      .single();
    if (insertError || !insertedRow)
      return { submissionId: null, preview: null, error: insertError?.message ?? "Insert failed" };
    submissionId = insertedRow.id as string;
  }

  return { submissionId, preview: publicUrl, error: null };
}

/** Call the review-proof edge function and return normalised verdict. */
export async function callReviewProof(
  submissionId: string
): Promise<ProofReviewResult> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("review-proof", {
      body: { submission_id: submissionId },
      signal: AbortSignal.timeout(10_000),
    });
    // Upload enqueue is transactional: even a lost browser request is retried
    // by cron. Observe the saved verdict, rather than invoking the model again.
    if (error) return await observeProofReview(supabase, submissionId, { waitMs: 0 });

    // The function returns `status` alongside `classification`. Read `status`;
    // fall back to deriving it from `classification` so an older deployed
    // version of the function still produces the right UI state instead of
    // silently showing "pending" on an already-decided submission.
    const payload = (data ?? {}) as {
      status?: string;
      rejection_reason?: string | null;
      classification?: string;
    };
    const status =
      payload.status ??
      (payload.classification === "match"
        ? "approved"
        : payload.classification === "mismatch" || payload.classification === "duplicate"
          ? "rejected"
          : "pending");

    if (status === "approved") return { status: "approved", rejectionReason: null, reviewState: "complete" };
    if (status === "rejected")
      return { status: "rejected", rejectionReason: payload.rejection_reason ?? null, reviewState: "complete" };
    return await observeProofReview(supabase, submissionId);
  } catch {
    // Edge function errors should not block the UI — fall back to pending
    return { status: "pending", rejectionReason: null, reviewState: "queued" };
  }
}
