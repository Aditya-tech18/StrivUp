import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { observeProofReview } from "@/lib/data/proofReviewStatus";

function fixture(rows: Record<string, unknown>[]) {
  let calls = 0;
  const query = { select: () => query, eq: () => query, abortSignal: () => query, maybeSingle: async () => ({ data: rows[Math.min(calls++, rows.length - 1)], error: null }) };
  return { from: () => query } as unknown as SupabaseClient;
}
test("a queued proof can finish without invoking the paid reviewer again", async () => {
  const result = await observeProofReview(fixture([
    { verification_status: "pending", ai_reviewed: false },
    { verification_status: "approved", ai_reviewed: true },
  ]), "proof", { pollMs: 0, waitMs: 100 });
  assert.equal(result.status, "approved");
});
test("the observer distinguishes human review from outage recovery", async () => {
  const human = await observeProofReview(fixture([{ verification_status: "pending", ai_reviewed: true }]), "proof", { waitMs: 0 });
  const queued = await observeProofReview(fixture([{ verification_status: "pending", ai_reviewed: false }]), "proof", { waitMs: 0 });
  assert.equal(human.reviewState, "human_review");
  assert.equal(queued.reviewState, "queued");
});
test("a background rejection retains the participant-facing reason", async () => {
  const result = await observeProofReview(fixture([{ verification_status: "rejected", ai_reviewed: true, rejection_reason: "Missing task" }]), "proof", { waitMs: 0 });
  assert.equal(result.status, "rejected");
  assert.equal(result.rejectionReason, "Missing task");
});
