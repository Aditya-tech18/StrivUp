"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { callReviewProof, uploadProof } from "@/lib/data/proofs";

/**
 * ProofComposer — post today's proof.
 *
 * WHY THIS REPLACES THE OLD FLOW. Before, picking a file blocked the screen on
 * "reviewing" until the edge function answered, and when it approved, nothing
 * refreshed — the post only appeared after a manual reload, which read as the
 * page being stuck. There was also nowhere to say anything about the day; the
 * proof_submissions.caption column existed and no screen ever wrote to it.
 *
 * The order is deliberate: the upload and the review start the moment a file
 * is chosen and run in the background while the caption is being written, so
 * the wait costs nothing. By the time there is something to say, the verdict
 * is usually already in.
 *
 * Post is enabled only once the proof is approved. That is not an artificial
 * gate — a pending or rejected proof is invisible to everyone but its author
 * anyway (see can_see_proof), so "posting" before approval would promise
 * something the database would not deliver.
 */

type Phase = "pick" | "compose";
type Review = "idle" | "uploading" | "checking" | "approved" | "rejected" | "failed";

export function ProofComposer({
  open,
  onClose,
  challengeId,
  userId,
  joinedAt,
  taskId = null,
  existingSubmissionId = null,
  proofInstruction,
}: {
  open: boolean;
  onClose: () => void;
  challengeId: string;
  userId: string | null;
  joinedAt: string | null;
  taskId?: string | null;
  /** Set when replacing a rejected submission. */
  existingSubmissionId?: string | null;
  /** What this challenge asks for, derived at creation time. */
  proofInstruction?: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("pick");
  const [review, setReview] = useState<Review>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  // No reset effect: the parent gives this a key that changes each time the
  // sheet opens, so every open is a fresh mount with fresh state. Clearing
  // nine useStates from an effect is the cascading-render pattern
  // react-hooks/set-state-in-effect exists to catch, and remounting is both
  // cheaper to reason about and impossible to get half-right.
  if (!open) return null;

  async function handleFile(file: File) {
    setIsVideo(file.type.startsWith("video/"));
    setError(null);
    setRejectionReason(null);
    setReview("uploading");
    // Straight to the caption step: there is nothing to look at on an upload
    // spinner, and the whole point is that the wait overlaps with writing.
    setPhase("compose");

    const result = await uploadProof(
      { challengeId, userId, joinedAt, taskId, existingSubmissionId },
      file
    );

    if (result.error || !result.submissionId) {
      setReview("failed");
      setError(result.error ?? "Upload failed.");
      return;
    }

    setPreview(result.preview);
    setSubmissionId(result.submissionId);
    setReview("checking");

    const verdict = await callReviewProof(result.submissionId);
    if (verdict.status === "approved") {
      setReview("approved");
    } else if (verdict.status === "rejected") {
      setReview("rejected");
      setRejectionReason(verdict.rejectionReason);
    } else {
      // Still pending: the reviewer could not reach a verdict. Treat it as
      // reviewable later rather than pretending it failed.
      setReview("failed");
      setError("We couldn't check that just now. Your proof is saved — try posting again shortly.");
    }
  }

  async function handlePost() {
    if (!submissionId || review !== "approved" || posting) return;
    setPosting(true);
    setError(null);

    const supabase = createClient();
    const trimmed = caption.trim();
    if (trimmed) {
      const { error: captionError } = await supabase
        .from("proof_submissions")
        .update({ caption: trimmed })
        .eq("id", submissionId);
      // The proof is already approved and visible; a caption that failed to
      // save is worth saying so rather than silently dropping the words.
      if (captionError) {
        setError("Your proof is posted, but the caption didn't save.");
        setPosting(false);
        return;
      }
    }

    // This is the line whose absence made the old flow look stuck: the server
    // components holding the feed and the day's state have to be told.
    router.refresh();
    onClose();
  }

  const statusPill = {
    idle: null,
    uploading: { icon: Loader2, text: "Uploading…", tone: "text-on-surface-variant", spin: true },
    checking: { icon: Sparkles, text: "Checking your proof…", tone: "text-secondary", spin: false },
    approved: { icon: CheckCircle2, text: "Verified", tone: "text-success", spin: false },
    rejected: { icon: AlertCircle, text: "Doesn't match", tone: "text-error", spin: false },
    failed: { icon: AlertCircle, text: "Couldn't check", tone: "text-warning", spin: false },
  }[review];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Post today's proof"
      onClick={(e) => {
        if (e.target === e.currentTarget && !posting) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface-container-lowest sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <p className="text-body-lg font-bold text-on-surface">
            {phase === "pick" ? "Today's proof" : "Add a caption"}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container tap-target"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {phase === "pick" ? (
          <div className="space-y-4 p-4">
            {proofInstruction ? (
              <div className="flex items-start gap-2.5 rounded-xl bg-secondary/8 p-3">
                <Camera size={16} className="mt-0.5 shrink-0 text-secondary" aria-hidden="true" />
                <p className="text-body-sm text-on-surface-variant">{proofInstruction}</p>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low py-10 transition-colors hover:border-secondary hover:bg-secondary/5"
            >
              <ImagePlus size={28} className="text-on-surface-variant" aria-hidden="true" />
              <span className="text-body-md font-semibold text-on-surface">
                Choose a photo or video
              </span>
              <span className="text-label-sm text-on-surface-variant">
                It gets checked while you write
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-container">
                {preview && !isVideo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    {review === "uploading" ? (
                      <Loader2 size={18} className="animate-spin text-on-surface-variant" aria-hidden="true" />
                    ) : (
                      <Camera size={18} className="text-on-surface-variant" aria-hidden="true" />
                    )}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {statusPill ? (
                  <p className={`flex items-center gap-1.5 text-label-sm font-semibold ${statusPill.tone}`}>
                    <statusPill.icon
                      size={13}
                      className={statusPill.spin ? "animate-spin" : ""}
                      aria-hidden="true"
                    />
                    {statusPill.text}
                  </p>
                ) : null}

                {review === "rejected" && rejectionReason ? (
                  <p className="mt-1 text-label-sm text-on-surface-variant">{rejectionReason}</p>
                ) : null}

                {review === "checking" ? (
                  <p className="mt-1 text-label-sm text-on-surface-variant">
                    Carry on writing — this finishes on its own.
                  </p>
                ) : null}
              </div>
            </div>

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="How did it go today?"
              aria-label="Caption"
              className="w-full resize-none rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-body-md text-on-surface placeholder:text-outline focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
            <p className="-mt-2 text-right text-label-sm text-on-surface-variant">
              {caption.length}/500
            </p>

            {error ? (
              <p role="alert" className="text-label-sm text-error">
                {error}
              </p>
            ) : null}

            {review === "rejected" || review === "failed" ? (
              <button
                type="button"
                onClick={() => {
                  setPhase("pick");
                  setReview("idle");
                  setPreview(null);
                  setError(null);
                }}
                className="w-full rounded-xl border border-outline-variant py-2.5 text-body-md font-semibold text-on-surface transition-colors hover:bg-surface-container"
              >
                Try a different photo
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePost}
                disabled={review !== "approved" || posting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary py-2.5 text-body-md font-semibold text-on-secondary elev-brand transition-opacity disabled:opacity-40"
              >
                {posting ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send size={15} aria-hidden="true" />
                )}
                {review === "approved" ? "Post" : "Post when verified"}
              </button>
            )}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </div>
    </div>
  );
}
