import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * review-proof — AI-first proof verification for StrivUp.
 *
 * Pipeline order is load-bearing and must not be reordered:
 *   1. SHA-256 hash of the media, checked against prior submissions.
 *      A hash collision is decided locally and NEVER reaches the model —
 *      it is both free and more reliable than asking an LLM.
 *   2. Gemini (gemini-3.5-flash-lite) judges whether the image is plausible
 *      evidence for the task, returning a structured verdict.
 *   3. Confident verdicts auto-approve / auto-reject. Genuinely uncertain
 *      verdicts stay pending and land in the human review queue.
 *
 * Queue semantics — how to tell the "pending" states apart without a schema
 * change:
 *   ai_reviewed=true,  ai_classification='uncertain' → human review queue
 *   ai_reviewed=false, ai_classification=null        → not yet processed, safe to retry
 * Never set ai_reviewed on a failure path, or the submission becomes a
 * silent orphan that no retry will pick up.
 *
 * IMPORTANT: ai_classification is constrained by
 * proof_submissions_ai_classification_check to exactly
 * ('match' | 'mismatch' | 'uncertain'). Duplicates therefore record 'mismatch'
 * and unsupported media records 'uncertain'; the finer-grained reason lives in
 * ai_reasoning and in moderation_events.event_type ('duplicate_detected').
 * Do not invent new values here without widening that constraint first.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** Confidence at or above this is treated as a decision; below it is uncertain. */
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Max AI reviews per user per rolling 24h. Every review costs a Gemini call, so
 * without a cap a scripted loop is a billing incident. Legitimate use is a few
 * proofs a day across a handful of challenges, so 30 is generous.
 *
 * Over the cap the submission is NOT rejected — it queues for human review.
 * Rejecting someone for being productive would be the wrong trade.
 */
const DAILY_AI_REVIEW_CAP = Number(Deno.env.get("DAILY_AI_REVIEW_CAP") ?? "30");

/** Image MIME types the Gemini API accepts inline. */
const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Pull the model's text out of an Interactions API response.
 * Shape: { steps: [ { type: "model_output", content: [ { type: "text", text } ] } ] }
 * (The `output_text` shortcut is an SDK convenience and is not present on REST.)
 */
function extractOutputText(payload: unknown): string {
  const steps = (payload as { steps?: unknown[] })?.steps;
  if (!Array.isArray(steps)) return "";

  const chunks: string[] = [];
  for (const step of steps) {
    const s = step as { type?: string; content?: unknown[] };
    if (s?.type !== "model_output" || !Array.isArray(s.content)) continue;
    for (const part of s.content) {
      const p = part as { type?: string; text?: string };
      if (p?.type === "text" && typeof p.text === "string") chunks.push(p.text);
    }
  }
  return chunks.join("");
}

interface Verdict {
  matches: boolean;
  confidence: number;
  reasoning: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { submission_id } = await req.json();
    if (!submission_id) {
      return json({ error: "submission_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: submission, error: subError } = await supabase
      .from("proof_submissions")
      .select(
        `id, media_url, verification_status, ai_reviewed, challenge_id, task_id, user_id,
         challenges ( title, description, category, proof_methods ),
         challenge_tasks ( title, description, proof_type )`
      )
      .eq("id", submission_id)
      .single();

    if (subError || !submission) {
      return json({ error: "submission not found" }, 404);
    }

    // Gate on status only, never on ai_reviewed. A resubmission resets the row
    // to 'pending' and MUST be re-reviewed; gating on ai_reviewed is what used
    // to strand every second attempt in pending forever.
    if (submission.verification_status !== "pending") {
      return json({
        skipped: true,
        reason: "already decided",
        status: submission.verification_status,
      });
    }

    if (!submission.media_url) {
      return json({ skipped: true, reason: "no media_url on submission", status: "pending" });
    }

    // ── Fetch the media ───────────────────────────────────────────────────────
    const imgResp = await fetch(submission.media_url);
    if (!imgResp.ok) {
      await supabase.from("moderation_events").insert({
        proof_id: submission_id,
        user_id: submission.user_id,
        event_type: "ai_failed",
        source: "system",
        reason: `failed to fetch proof media (HTTP ${imgResp.status})`,
      });
      return json({ error: "failed to fetch proof media", status: "pending" }, 502);
    }

    const contentType = (imgResp.headers.get("content-type") ?? "").split(";")[0].trim();
    const imgBuffer = await imgResp.arrayBuffer();
    const fileHash = await sha256Hex(imgBuffer);

    // ── 1. SHA-256 dedupe — always before any model call ─────────────────────
    // Scoped across ALL submissions, not just this user in this challenge:
    // the cheat that actually happens on a campus is two people sharing one
    // photo, and a per-user/per-challenge scope waves that straight through.
    const { data: priorMatches } = await supabase
      .from("proof_submissions")
      .select("id, user_id, challenge_id")
      .eq("file_hash", fileHash)
      .eq("admin_removed", false)
      .neq("id", submission_id)
      .limit(1);

    const dupe = priorMatches?.[0];
    if (dupe) {
      const sameUser = dupe.user_id === submission.user_id;
      const rejectionReason = sameUser
        ? "You've already submitted this exact image before. Please upload a new photo for this task."
        : "This exact image has already been submitted by someone else. Please upload your own photo.";

      const { error: dupeUpdateError } = await supabase
        .from("proof_submissions")
        .update({
          file_hash: fileHash,
          ai_reviewed: true,
          // Constrained vocabulary — see the note at the top of this file.
          ai_classification: "mismatch",
          ai_confidence: 1,
          ai_reasoning: sameUser
            ? "Exact file-hash match against this user's earlier submission."
            : "Exact file-hash match against a different user's submission.",
          verification_status: "rejected",
          rejection_reason: rejectionReason,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", submission_id);

      // Never report a verdict we failed to persist: the caller would show the
      // participant a rejection while the row sat untouched at 'pending'.
      if (dupeUpdateError) {
        return json(
          { error: "failed to record duplicate verdict", detail: dupeUpdateError.message },
          500
        );
      }

      await supabase.from("moderation_events").insert({
        proof_id: submission_id,
        user_id: submission.user_id,
        event_type: "duplicate_detected",
        source: "system",
        decision: "rejected",
        confidence: 1,
        reason: sameUser
          ? "Exact file hash match against a prior submission by the same user"
          : `Exact file hash match against submission ${dupe.id} by a different user`,
      });

      return json({
        status: "rejected",
        rejection_reason: rejectionReason,
        classification: "duplicate",
        confidence: 1,
        duplicate_of: dupe.id,
        same_user: sameUser,
      });
    }

    // Record the hash even when we cannot decide — it is what makes the next
    // submission's dedupe check meaningful.
    if (!SUPPORTED_IMAGE_TYPES.includes(contentType)) {
      const { error: mediaUpdateError } = await supabase
        .from("proof_submissions")
        .update({
          file_hash: fileHash,
          ai_reviewed: true,
          // 'uncertain' is the constraint-legal value for "a human must look".
          ai_classification: "uncertain",
          ai_reasoning: `Proof media type "${contentType || "unknown"}" cannot be reviewed automatically; queued for human review.`,
        })
        .eq("id", submission_id);

      if (mediaUpdateError) {
        return json(
          { error: "failed to queue unsupported media", detail: mediaUpdateError.message },
          500
        );
      }

      return json({
        status: "pending",
        classification: "uncertain",
        reason: "non-image proof — queued for human review",
      });
    }

    // ── 1b. Daily AI-review cap ──────────────────────────────────────────────
    // Checked after dedupe (which is free) but before the paid model call.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentReviews } = await supabase
      .from("proof_submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", submission.user_id)
      .eq("ai_reviewed", true)
      .gte("submitted_at", since);

    if ((recentReviews ?? 0) >= DAILY_AI_REVIEW_CAP) {
      const { error: capError } = await supabase
        .from("proof_submissions")
        .update({
          file_hash: fileHash,
          ai_reviewed: true,
          ai_classification: "uncertain",
          ai_reasoning: `Daily automated-review limit reached (${DAILY_AI_REVIEW_CAP}/24h); queued for human review.`,
        })
        .eq("id", submission_id);

      if (capError) {
        return json({ error: "failed to queue rate-limited proof", detail: capError.message }, 500);
      }

      await supabase.from("moderation_events").insert({
        proof_id: submission_id,
        user_id: submission.user_id,
        event_type: "ai_flagged",
        source: "system",
        decision: "uncertain",
        reason: `Rate limit: ${recentReviews} AI reviews in the last 24h (cap ${DAILY_AI_REVIEW_CAP})`,
      });

      return json({
        status: "pending",
        classification: "uncertain",
        reason: "daily automated-review limit reached — queued for human review",
      });
    }

    // ── 2. Gemini review ─────────────────────────────────────────────────────
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      await supabase.from("proof_submissions").update({ file_hash: fileHash }).eq("id", submission_id);
      await supabase.from("moderation_events").insert({
        proof_id: submission_id,
        user_id: submission.user_id,
        event_type: "ai_failed",
        source: "system",
        reason: "GEMINI_API_KEY not configured",
      });
      return json({ error: "GEMINI_API_KEY not configured", status: "pending" }, 500);
    }

    const task = submission.challenge_tasks as unknown as {
      title: string;
      description: string | null;
      proof_type: string | null;
    } | null;
    const challenge = submission.challenges as unknown as {
      title: string;
      description: string | null;
      category: string | null;
      proof_methods: string[] | null;
    } | null;

    /* An explicit per-task spec, if the creator defined one. This is the same
       list the participant was shown before uploading (see
       src/components/features/proof/ProofRequirementsNotice.tsx), so the model
       is held to exactly what they were promised — not to its own taste. */
    let spec: {
      activity_label: string;
      required_elements: string[];
      optional_elements: string[];
      reject_if: string[];
    } | null = null;

    if (submission.task_id) {
      const { data: req } = await supabase
        .from("proof_requirements")
        .select("activity_label, required_elements, optional_elements, reject_if")
        .eq("challenge_task_id", submission.task_id)
        .maybeSingle();
      if (req && Array.isArray(req.required_elements) && req.required_elements.length > 0) {
        spec = req as typeof spec;
      }
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

    const aiResponse = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "x-goog-api-key": geminiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: [
          { type: "text", text: prompt },
          {
            type: "image",
            data: arrayBufferToBase64(imgBuffer),
            mime_type: contentType,
          },
        ],
        // Structured output: the schema is enforced by the API, so there is no
        // need to regex a JSON object out of prose.
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: {
              matches: { type: "boolean" },
              confidence: { type: "number" },
              reasoning: { type: "string" },
            },
            required: ["matches", "confidence", "reasoning"],
          },
        },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      // Leave ai_reviewed false so this submission stays retryable.
      await supabase.from("proof_submissions").update({ file_hash: fileHash }).eq("id", submission_id);
      await supabase.from("moderation_events").insert({
        proof_id: submission_id,
        user_id: submission.user_id,
        event_type: "ai_failed",
        source: "ai",
        reason: `${GEMINI_MODEL} HTTP ${aiResponse.status}: ${errText.slice(0, 400)}`,
      });
      return json({ error: "gemini API error", detail: errText.slice(0, 500), status: "pending" }, 502);
    }

    const rawText = extractOutputText(await aiResponse.json());

    let verdict: Verdict | null = null;
    try {
      const parsed = JSON.parse(rawText) as Partial<Verdict>;
      if (typeof parsed.matches === "boolean" && typeof parsed.confidence === "number") {
        verdict = {
          matches: parsed.matches,
          // Clamp: a model returning 1.4 or -0.2 must not skew the thresholds.
          confidence: Math.min(1, Math.max(0, parsed.confidence)),
          reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
        };
      }
    } catch {
      verdict = null;
    }

    if (!verdict) {
      // Unparseable output is an AI failure, not a rejection. The old code
      // turned it into { matches: false, confidence: 0 }, which quietly
      // reclassified an infrastructure problem as the participant's fault.
      await supabase.from("proof_submissions").update({ file_hash: fileHash }).eq("id", submission_id);
      await supabase.from("moderation_events").insert({
        proof_id: submission_id,
        user_id: submission.user_id,
        event_type: "ai_failed",
        source: "ai",
        reason: `Unparseable model output: ${rawText.slice(0, 300)}`,
      });
      return json({ error: "could not parse model verdict", status: "pending" }, 502);
    }

    // ── 3. Three-way outcome ─────────────────────────────────────────────────
    const classification: "match" | "mismatch" | "uncertain" =
      verdict.confidence >= CONFIDENCE_THRESHOLD
        ? verdict.matches
          ? "match"
          : "mismatch"
        : "uncertain";

    const updatePayload: Record<string, unknown> = {
      file_hash: fileHash,
      ai_reviewed: true,
      ai_confidence: verdict.confidence,
      ai_classification: classification,
      ai_reasoning: verdict.reasoning,
    };

    let status: "approved" | "rejected" | "pending" = "pending";
    let rejectionReason: string | null = null;

    if (classification === "match") {
      status = "approved";
      updatePayload.verification_status = "approved";
      updatePayload.reviewed_at = new Date().toISOString();
    } else if (classification === "mismatch") {
      status = "rejected";
      rejectionReason =
        verdict.reasoning || "This doesn't appear to match the required proof for this task.";
      updatePayload.verification_status = "rejected";
      updatePayload.rejection_reason = rejectionReason;
      updatePayload.reviewed_at = new Date().toISOString();
    }
    // 'uncertain' → verification_status stays 'pending', but ai_reviewed is now
    // true with classification 'uncertain', which is what puts it in the queue.

    const { error: updateError } = await supabase
      .from("proof_submissions")
      .update(updatePayload)
      .eq("id", submission_id);

    if (updateError) {
      return json({ error: "failed to update submission", detail: updateError.message }, 500);
    }

    await supabase.from("moderation_events").insert({
      proof_id: submission_id,
      user_id: submission.user_id,
      event_type: classification === "match" ? "ai_approved" : "ai_flagged",
      source: "ai",
      decision: classification,
      reason: verdict.reasoning,
      confidence: verdict.confidence,
    });

    return json({
      status,
      rejection_reason: rejectionReason,
      classification,
      confidence: verdict.confidence,
      reasoning: verdict.reasoning,
      model: GEMINI_MODEL,
    });
  } catch (e) {
    return json({ error: String(e), status: "pending" }, 500);
  }
});
