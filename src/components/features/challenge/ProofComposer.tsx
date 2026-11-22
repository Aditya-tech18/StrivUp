"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { callReviewProof, uploadProof } from "@/lib/data/proofs";
import { emitStrivyEvent } from "@/components/features/strivy/companion";
import { ProofReviewWatcher } from "./ProofReviewWatcher";

type Review = "checking" | "approved" | "rejected" | "queued" | "human_review";

export function ProofComposer({
  open,
  onClose,
  challengeId,
  userId,
  joinedAt,
  taskId = null,
  existingSubmissionId = null,
  proofInstruction,
  videoOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  challengeId: string;
  userId: string | null;
  joinedAt: string | null;
  taskId?: string | null;
  existingSubmissionId?: string | null;
  proofInstruction?: string | null;
  videoOnly?: boolean;
}) {
  const router = useRouter();
  const overlay = useRef<HTMLDialogElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState(existingSubmissionId);
  const saved = useRef(false);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The software keyboard can shrink the visual viewport while the CSS layout
  // viewport stays the same. Keep the footer inside the visible area on both.
  useEffect(() => {
    const node = overlay.current;
    const viewport = window.visualViewport;
    if (!open || !node) return;
    node.showModal();
    function resize() {
      if (!node || !viewport) return;
      node.style.top = viewport.offsetTop + "px";
      node.style.height = viewport.height + "px";
    }
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      node.close();
    };
  }, [open]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  if (!open) return null;

  function selectFile(selected: File) {
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError(null);
  }

  function recordVerdict(result: Awaited<ReturnType<typeof callReviewProof>>) {
    setReview(
      result.status === "pending"
        ? result.reviewState === "human_review"
          ? "human_review"
          : "queued"
        : result.status
    );
    setError(
      result.status === "rejected"
        ? (result.rejectionReason ?? "Choose another photo that shows the required proof.")
        : null
    );
    if (result.status === "approved") emitStrivyEvent({ type: "CHALLENGE_COMPLETED" });
  }

  async function submit() {
    if (!file || uploading || review) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadProof(
        {
          challengeId,
          userId,
          joinedAt,
          taskId,
          existingSubmissionId: submissionId,
          caption: caption.trim(),
        },
        file
      );
      if (result.error || !result.submissionId) {
        setError(result.error ?? "Upload failed. Please try again.");
        return;
      }
      setSubmissionId(result.submissionId);
      saved.current = true;
      setReview("checking");
      void callReviewProof(result.submissionId).then(recordVerdict);
    } catch {
      setError("We couldn't upload the proof. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function close() {
    if (uploading) return;
    if (saved.current) router.refresh();
    onClose();
  }

  const status =
    review &&
    {
      checking: "Proof submitted. Checking your proof…",
      approved: "Verified",
      rejected: "Proof needs a different photo",
      queued: "Saved for automatic review",
      human_review: "Awaiting human review",
    }[review];

  return (
    <dialog
      ref={overlay}
      className="fixed inset-x-0 top-0 m-0 flex h-dvh max-h-none w-full max-w-none items-end justify-center bg-transparent p-0 backdrop:bg-black/50 sm:items-center"
      aria-label="Post today's proof"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      {review === "queued" && submissionId ? (
        <ProofReviewWatcher submissionId={submissionId} onResult={recordVerdict} />
      ) : null}

      <form
        className="flex max-h-[calc(100%-0.5rem)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-surface-container-lowest sm:max-h-[92%] sm:rounded-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-outline-variant px-4 py-2">
          <h2 className="text-body-lg font-bold text-on-surface">
            {file ? "Add a caption" : "Today's proof"}
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={uploading}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
          {!file ? (
            <div className="space-y-4">
              {proofInstruction ? (
                <p className="rounded-xl bg-secondary/8 p-3 text-body-sm">{proofInstruction}</p>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => camera.current?.click()}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-outline-variant p-4 text-secondary hover:bg-secondary/5"
                >
                  <Camera size={26} aria-hidden="true" />
                  <span className="font-semibold">{videoOnly ? "Record video" : "Take photo"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => gallery.current?.click()}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-outline-variant p-4 text-secondary hover:bg-secondary/5"
                >
                  <ImagePlus size={26} aria-hidden="true" />
                  <span className="font-semibold">Gallery</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {preview && !file.type.startsWith("video/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt="Selected proof"
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <Camera size={24} aria-hidden="true" />
                )}
                <p role="status" className="break-all text-body-sm text-on-surface-variant">
                  {status ?? file.name}
                </p>
              </div>
              <label className="block text-label-md font-semibold" htmlFor="proof-caption">
                Caption (optional)
              </label>
              <textarea
                id="proof-caption"
                aria-label="Caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                maxLength={500}
                rows={3}
                readOnly={uploading || Boolean(review)}
                placeholder="How did it go today?"
                className="w-full resize-none rounded-xl border border-outline-variant bg-surface-container-low p-3 text-base text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
              {error ? (
                <p role="alert" className="text-body-sm text-error">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {file ? (
          <footer className="flex shrink-0 gap-2 border-t border-outline-variant bg-surface-container-lowest px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {!review || review === "rejected" ? (
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  setReview(null);
                  setError(null);
                }}
                className="min-h-11 rounded-xl border border-outline-variant px-3 text-label-md font-semibold disabled:opacity-50"
              >
                Change media
              </button>
            ) : null}
            {review && review !== "rejected" ? (
              <button
                type="button"
                onClick={close}
                className="min-h-11 flex-1 rounded-xl bg-secondary px-3 font-semibold text-on-secondary"
              >
                Done
              </button>
            ) : (
              <button
                type="submit"
                disabled={uploading || review === "rejected"}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-secondary px-3 font-semibold text-on-secondary disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : null}
                {uploading ? "Uploading…" : "Upload proof"}
              </button>
            )}
          </footer>
        ) : null}

        <input
          ref={camera}
          type="file"
          accept={videoOnly ? "video/*" : "image/*"}
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (selected) selectFile(selected);
          }}
        />
        <input
          ref={gallery}
          type="file"
          accept={videoOnly ? "video/*" : "image/*,video/*"}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (selected) selectFile(selected);
          }}
        />
      </form>
    </dialog>
  );
}
