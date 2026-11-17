import { createClient } from "jsr:@supabase/supabase-js@2";
import { reviewImage } from "./review.ts";
import { isRetryableStatus } from "./policy.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type" };
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: cors }); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(projectUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }) },
  });
  let submissionId: string | undefined, token: string | undefined;
  let authenticatedWorker = false;
  async function finish(patch: Record<string, unknown>, event: Record<string, unknown>, error: string | null = null, retryable = false) {
    const result = await admin.rpc("finish_proof_review", {
      p_submission_id: submissionId, p_token: token, p_patch: patch,
      p_event: event, p_error: error, p_retryable: retryable,
    });
    if (result.error) throw new Error("Could not persist review: " + result.error.message);
    return result.data === true;
  }
  async function failed(reason: string, retryable: boolean) {
    await finish(
      { ai_classification: "uncertain", ai_reasoning: "Automated review unavailable; queued for human review." },
      { event_type: retryable ? "ai_failed" : "ai_flagged", source: "system", decision: retryable ? null : "uncertain", reason },
      reason, retryable,
    );
    return json({ status: "pending", review_state: retryable ? "queued" : "human_review" }, 202);
  }
  try {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    submissionId = body?.submission_id;
    token = body?.review_token;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof submissionId !== "string" || !uuid.test(submissionId)) return json({ error: "Valid submission_id required" }, 400);
    if (!token) {
      // Preserve the gateway JWT check and independently verify user identity.
      const header = req.headers.get("Authorization") ?? "";
      const jwt = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!jwt) return json({ error: "Sign in required" }, 401);
      const { data: auth, error: authError } = await admin.auth.getUser(jwt);
      if (authError || !auth.user) return json({ error: "Sign in required" }, 401);
      const { data: proof, error } = await admin.from("proof_submissions")
        .select("id,user_id,verification_status,ai_reviewed,admin_removed,media_url,submitted_at")
        .eq("id", submissionId).eq("user_id", auth.user.id).maybeSingle();
      if (error) throw error;
      if (!proof) return json({ error: "Proof not found" }, 404);
      if (proof.verification_status !== "pending" || proof.ai_reviewed || proof.admin_removed) {
        return json({ status: proof.verification_status, review_state: proof.ai_reviewed && proof.verification_status === "pending" ? "human_review" : "complete" });
      }
      // Trigger enqueue is transactional with upload. This also recovers legacy uploads.
      const { error: queueError } = await admin.from("proof_review_jobs").upsert({
        submission_id: proof.id, submission_version: proof.submitted_at, media_url: proof.media_url,
      }, { onConflict: "submission_id", ignoreDuplicates: true });
      if (queueError) throw queueError;
      const { error: dispatchError } = await admin.rpc("dispatch_proof_reviews", { p_url: projectUrl + "/functions/v1/review-proof" });
      if (dispatchError) console.error("Immediate dispatch deferred to cron:", dispatchError.message);
      return json({ status: "pending", review_state: "queued" }, 202);
    }
    if (typeof token !== "string" || !uuid.test(token)) return json({ error: "Invalid review lease" }, 403);
    const { data: job, error: jobError } = await admin.rpc("start_proof_review", {
      p_submission_id: submissionId, p_token: token,
    });
    if (jobError) throw jobError;
    if (!job) return json({ error: "Expired, used or invalid review lease" }, 403);
    authenticatedWorker = true;
    const { data: submission, error: subError } = await admin.from("proof_submissions").select(
      "id,media_url,submitted_at,verification_status,ai_reviewed,admin_removed,user_id,task_id,challenges(title,description,category,proof_methods),challenge_tasks(title,description,proof_type)"
    ).eq("id", submissionId).single();
    if (subError) throw subError;
    if (submission.verification_status !== "pending" || submission.ai_reviewed || submission.admin_removed ||
        submission.media_url !== job.media_url || Date.parse(submission.submitted_at) !== Date.parse(job.submission_version)) {
      return json({ skipped: true, reason: "Proof version no longer eligible" });
    }
    const mediaUrl = new URL(submission.media_url);
    if (mediaUrl.origin !== new URL(projectUrl).origin || !mediaUrl.pathname.startsWith("/storage/v1/object/public/proof-media/")) return await failed("Unsupported proof storage URL", false);
    const media = await fetch(mediaUrl, { signal: AbortSignal.timeout(10_000) });
    if (!media.ok) return await failed("Proof media HTTP " + media.status, isRetryableStatus(media.status));
    const mime = (media.headers.get("content-type") ?? "").split(";")[0].trim();
    if (Number(media.headers.get("content-length") ?? 0) > 15 * 1024 * 1024) return await failed("Proof too large for automated review", false);
    const bytes = await media.arrayBuffer();
    if (bytes.byteLength > 15 * 1024 * 1024) return await failed("Proof too large for automated review", false);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join("");
    const { data: duplicates, error: duplicateError } = await admin.from("proof_submissions")
      .select("id,user_id").eq("file_hash", hash).eq("admin_removed", false).neq("id", submissionId).limit(1);
    if (duplicateError) throw duplicateError;
    if (duplicates?.length) {
      const reason = duplicates[0].user_id === submission.user_id
        ? "You've already submitted this exact image before. Please upload a new photo for this task."
        : "This exact image has already been submitted by someone else. Please upload your own photo.";
      const applied = await finish({
        file_hash: hash, ai_classification: "mismatch", ai_confidence: 1, ai_reasoning: reason,
        verification_status: "rejected", rejection_reason: reason,
      }, { event_type: "duplicate_detected", source: "system", decision: "rejected", reason, confidence: 1 });
      return json({ status: applied ? "rejected" : "pending" });
    }
    if (!["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"].includes(mime)) return await failed("Unsupported media type requires human review: " + mime, false);
    const { count, error: countError } = await admin.from("proof_submissions").select("id", { count: "exact", head: true })
      .eq("user_id", submission.user_id).eq("ai_reviewed", true).gte("submitted_at", new Date(Date.now() - 86400000).toISOString());
    if (countError) throw countError;
    if ((count ?? 0) >= Number(Deno.env.get("DAILY_AI_REVIEW_CAP") ?? "30")) return await failed("Daily automated-review limit reached; queued for human review", false);
    const task = submission.challenge_tasks as unknown as { title: string; description?: string; proof_type?: string } | null;
    const challenge = submission.challenges as unknown as { title: string; description?: string; category?: string; proof_methods?: string[] } | null;
    let spec: { activity_label: string; required_elements: string[]; optional_elements: string[]; reject_if: string[] } | null = null;
    if (submission.task_id) {
      const { data: requirements, error: requirementError } = await admin.from("proof_requirements")
        .select("activity_label,required_elements,optional_elements,reject_if").eq("challenge_task_id", submission.task_id).maybeSingle();
      if (requirementError) throw requirementError;
      if (requirements?.required_elements?.length) spec = requirements;
    }
    const requirement = task
      ? `Task: "${task.title}". ${task.description ?? ""} Expected proof type: ${task.proof_type ?? "unspecified"}.`
      : `Challenge: "${challenge?.title ?? "unknown"}" (category: ${challenge?.category ?? "unspecified"}). Expected proof: ${(challenge?.proof_methods ?? []).join(", ") || "unspecified"}.`;

    const prompt = spec
      ? [
          "You are checking whether a submitted image is genuine evidence that someone completed a specific task.",
          requirement,
          "",
          `The participant said they would do: ${spec.activity_label}.`,
          "",
          "The image MUST show ALL of:",
          ...spec.required_elements.map((r) => `  - ${r}`),
          ...(spec.optional_elements.length > 0
            ? ["", "These strengthen the proof but are not required:", ...spec.optional_elements.map((o) => `  - ${o}`)]
            : []),
          ...(spec.reject_if.length > 0
            ? ["", "Reject the proof if it is only one of these:", ...spec.reject_if.map((r) => `  - ${r}`)]
            : []),
          "",
          "Judge against the required list, not against whether the image looks nice or merely related.",
          "An image that is about the right topic but misses a required element is NOT proof — set `matches` to false.",
          "",
          "Set `confidence` from 0 to 1. Use below 0.6 only when you genuinely cannot tell whether a required element is present — those go to a human reviewer.",
          "In `reasoning`, name the specific required element that was missing or satisfied, in one short sentence the participant can read.",
        ].join("\n")
      : [
          // No spec defined for this task — fall back to the original, lenient
          // judgement rather than inventing requirements the creator never set.
          "You are checking whether a submitted photo is genuine evidence of completing a specific daily habit-challenge task.",
          requirement,
          "",
          "Judge whether the image plausibly shows real evidence of this activity.",
          "Be reasonably lenient: the goal is to catch obvious mismatches (for example a random selfie submitted for a coding challenge), not to nitpick photo quality, lighting, or framing.",
          "",
          "Set `matches` to true if the image is plausible evidence, false if it clearly is not.",
          "Set `confidence` to how certain you are of that judgement, from 0 to 1. Use a value below 0.6 only when you genuinely cannot tell — those cases go to a human reviewer.",
          "Keep `reasoning` to one short sentence, written so the participant can read it.",
        ].join("\n");


    const result = await reviewImage({ bytes, mime, prompt, apiKey: Deno.env.get("GEMINI_API_KEY") ?? "", model: Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite" });
    if (!result.verdict) return await failed(result.error ?? "Invalid model verdict", result.retryable);
    const verdict = result.verdict;
    const classification = verdict.confidence < 0.6 ? "uncertain" : verdict.matches ? "match" : "mismatch";
    const status = classification === "match" ? "approved" : classification === "mismatch" ? "rejected" : "pending";
    const applied = await finish({
      file_hash: hash, ai_classification: classification, ai_confidence: verdict.confidence, ai_reasoning: verdict.reasoning,
      verification_status: status, rejection_reason: status === "rejected" ? verdict.reasoning || "This doesn't match the required proof." : null,
    }, { event_type: classification === "match" ? "ai_approved" : "ai_flagged", source: "ai", decision: classification, reason: verdict.reasoning, confidence: verdict.confidence });
    return json({ status: applied ? status : "pending", review_state: classification === "uncertain" ? "human_review" : "complete" });
  } catch (error) {
    console.error("Proof review error:", error instanceof Error ? error.message : String(error));
    if (authenticatedWorker) {
      try { return await failed("Review service temporarily unavailable", true); } catch {
        // The durable job remains recoverable when its lease expires.
        return json({ status: "pending", review_state: "queued" }, 503);
      }
    }
    return json({ error: "Unable to queue review right now; the saved upload will be picked up automatically." }, 503);
  }
});
