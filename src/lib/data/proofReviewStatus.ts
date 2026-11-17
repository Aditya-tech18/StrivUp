import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProofReviewResult {
  status: "approved" | "rejected" | "pending";
  rejectionReason: string | null;
  reviewState: "complete" | "queued" | "human_review";
}

/** Observe saved state; never re-run the paid model from a polling loop. */
export async function observeProofReview(
  supabase: SupabaseClient,
  submissionId: string,
  { waitMs = 12_000, pollMs = 2_500 }: { waitMs?: number; pollMs?: number } = {},
): Promise<ProofReviewResult> {
  const deadline = Date.now() + waitMs;
  do {
    const { data, error } = await supabase.from("proof_submissions")
      .select("verification_status,ai_reviewed,rejection_reason")
      .eq("id", submissionId).abortSignal(AbortSignal.timeout(8_000)).maybeSingle();
    if (error || !data) break;
    if (data.verification_status === "approved" || data.verification_status === "rejected") {
      return { status: data.verification_status, rejectionReason: data.rejection_reason ?? null, reviewState: "complete" };
    }
    if (data.ai_reviewed) return { status: "pending", rejectionReason: null, reviewState: "human_review" };
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
  } while (Date.now() < deadline);
  return { status: "pending", rejectionReason: null, reviewState: "queued" };
}
