"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Camera, CheckCircle2, Clock, Focus, ImagePlus, Info, Loader2,
  Send, ShieldCheck, Video, XCircle,
} from "lucide-react";
import { callReviewProof, uploadProof } from "@/lib/data/proofs";
import { ProofReviewWatcher } from "./ProofReviewWatcher";

type Review = "checking" | "approved" | "rejected" | "queued" | "human_review";

const REVIEW_COPY = {
  checking: {
    title: "Proof submitted. Checking your proof…",
    detail: "Your proof is saved. You can close this screen while review continues.",
    icon: Loader2,
  },
  approved: {
    title: "Verified",
    detail: "Your proof has been approved.",
    icon: CheckCircle2,
  },
  rejected: {
    title: "Proof needs different media",
    detail: "Choose a new photo or video to resubmit your proof.",
    icon: XCircle,
  },
  queued: {
    title: "Saved for automatic review",
    detail: "You can close this screen. We’ll keep your submission in the review queue.",
    icon: Clock,
  },
  human_review: {
    title: "Awaiting human review",
    detail: "Your proof is saved. Check this challenge for the review result.",
    icon: ShieldCheck,
  },
} satisfies Record<Review, { title: string; detail: string; icon: typeof Info }>;

export function ProofComposer({
  open,
  onClose,
  onApproved,
  challengeId,
  userId,
  joinedAt,
  taskId = null,
  existingSubmissionId = null,
  proofInstruction,
  proofTitle,
  videoOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  onApproved: () => void;
  challengeId: string;
  userId: string | null;
  joinedAt: string | null;
  taskId?: string | null;
  existingSubmissionId?: string | null;
  proofInstruction?: string | null;
  proofTitle?: string | null;
  videoOnly?: boolean;
}) {
  const router = useRouter();
  const overlay = useRef<HTMLDialogElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [captureMode, setCaptureMode] = useState<"photo" | "video">(videoOnly ? "video" : "photo");
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
        ? result.rejectionReason
        : null
    );
    if (result.status === "approved") onApproved();
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

  const StatusIcon = review ? REVIEW_COPY[review].icon : null;
  const CaptureIcon = captureMode === "video" ? Video : Camera;

  return (
    <dialog
      ref={overlay}
      className="fixed inset-x-0 top-0 m-0 flex h-dvh max-h-none w-full max-w-none items-center justify-center bg-transparent p-0 backdrop:bg-black/65"
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
        className="flex h-full w-full flex-col overflow-hidden bg-surface text-on-surface sm:h-auto sm:max-h-[94%] sm:max-w-lg sm:rounded-3xl sm:border sm:border-outline-variant sm:shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-outline-variant/60 px-4 py-1 pt-safe sm:px-5">
          <button
            type="button"
            onClick={close}
            disabled={uploading}
            aria-label="Close"
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            <ArrowLeft size={21} aria-hidden="true" />
          </button>
          <h2 className="text-lg font-bold tracking-tight">Submit proof</h2>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold tracking-wider text-on-surface-variant uppercase">
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
                {file ? "2" : "1"}
              </span>
              {file ? "Step 2 of 2 · Review proof" : "Step 1 of 2 · Capture proof"}
            </p>
            <div aria-hidden="true" className="mt-2 h-1 rounded-full bg-surface-container-highest">
              <div className={file ? "h-full rounded-full bg-streak" : "h-full w-1/2 rounded-full bg-secondary-container"} />
            </div>
          </div>

          {!file ? (
            <div className="space-y-4">
              {proofTitle ? (
                <div className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-container-high text-streak-ink">
                    <Camera size={20} aria-hidden="true" />
                  </span>
                  <p className="min-w-0 break-words font-bold leading-snug">{proofTitle}</p>
                </div>
              ) : null}
              <div className="relative flex min-h-40 flex-col justify-end overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-3 sm:min-h-48">
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden="true">
                  {Array.from({ length: 9 }, (_, index) => (
                    <span key={index} className="border border-outline-variant/25" />
                  ))}
                </div>
                <div className="absolute inset-0 grid place-items-center pb-8 text-secondary" aria-hidden="true">
                  <Focus size={42} strokeWidth={1.35} />
                </div>
                <p className="relative flex items-start gap-2 rounded-xl bg-surface-container-high px-3 py-2.5 text-sm leading-snug">
                  <Info size={18} className="shrink-0 text-coin-ink" aria-hidden="true" />
                  {proofInstruction || "Show the activity clearly in your photo or video."}
                </p>
              </div>
              {!videoOnly ? (
                <div className="mx-auto flex w-fit max-w-full flex-wrap justify-center rounded-3xl bg-surface-container-high p-1" role="group" aria-label="Camera mode">
                  {([
                    { mode: "photo", label: "Photo proof", Icon: Camera },
                    { mode: "video", label: "Video proof", Icon: Video },
                  ] as const).map(({ mode, label, Icon }) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={captureMode === mode}
                      onClick={() => setCaptureMode(mode)}
                      className={`flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                        captureMode === mode ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      <Icon size={16} aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="grid grid-cols-3 items-start gap-2 text-center">
                <button
                  type="button"
                  onClick={() => gallery.current?.click()}
                  className="group flex flex-col items-center gap-2 rounded-xl px-1 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface"
                >
                  <span className="grid size-12 place-items-center rounded-xl bg-surface-container-high transition-colors group-hover:bg-surface-container-highest">
                    <ImagePlus size={23} aria-hidden="true" />
                  </span>
                  Gallery
                </button>
                <button
                  type="button"
                  onClick={() => camera.current?.click()}
                  className="group flex flex-col items-center gap-2 rounded-xl px-1 text-sm font-semibold"
                >
                  <span className="grid size-16 place-items-center rounded-full border-4 border-surface bg-secondary-fixed text-on-secondary-fixed ring-4 ring-secondary-container/40 transition-colors group-hover:ring-secondary-container/70">
                    <CaptureIcon size={26} aria-hidden="true" />
                  </span>
                  {captureMode === "video" ? "Record video" : "Take photo"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {proofTitle ? <p className="text-lg font-bold leading-tight">{proofTitle}</p> : null}
              {preview ? (
                <figure className="overflow-hidden rounded-2xl bg-surface-container-lowest">
                  {file.type.startsWith("video/") ? (
                    <video src={preview} controls playsInline preload="metadata" aria-label="Selected proof video" className="max-h-[min(38dvh,18rem)] min-h-28 w-full bg-black object-contain" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="Selected proof" className="max-h-[min(38dvh,18rem)] min-h-28 w-full object-contain" />
                  )}
                  <figcaption className="break-all px-3 py-2 text-xs text-on-surface-variant">{file.name}</figcaption>
                </figure>
              ) : null}
              {review && StatusIcon ? (
                <div role="status" className={`flex items-start gap-3 rounded-2xl border-l-4 bg-surface-container-low p-4 ${review === "rejected" ? "border-error" : "border-streak"}`}>
                  <div className={`grid size-9 shrink-0 place-items-center rounded-full ${review === "rejected" ? "bg-error-container text-on-error-container" : "bg-streak/15 text-streak-ink"}`}>
                    <StatusIcon size={19} className={review === "checking" ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-bold leading-snug">{REVIEW_COPY[review].title}</p>
                    <p className="mt-1 text-sm text-on-surface-variant">{REVIEW_COPY[review].detail}</p>
                  </div>
                </div>
              ) : null}
              {!review ? (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <label className="text-sm font-bold" htmlFor="proof-caption">
                      Caption <span className="font-normal text-on-surface-variant">(optional)</span>
                    </label>
                    <span className="shrink-0 text-xs tabular-nums text-on-surface-variant" aria-hidden="true">{caption.length}/500</span>
                  </div>
                  <textarea
                    id="proof-caption"
                    aria-label="Caption"
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                    maxLength={500}
                    rows={3}
                    readOnly={uploading}
                    placeholder="How did it go today?"
                    className="w-full resize-none rounded-2xl border border-outline-variant bg-surface-container-high p-3 text-base text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                  />
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {file ? (
          <footer className="flex shrink-0 gap-2 border-t border-outline-variant/60 bg-surface px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-5">
            {review && review !== "rejected" ? (
              <button
                type="button"
                onClick={close}
                className="min-h-12 flex-1 rounded-xl bg-secondary-container px-3 font-semibold text-on-secondary-container transition-opacity hover:opacity-90"
              >
                Done
              </button>
            ) : review !== "rejected" ? (
              <button
                type="submit"
                disabled={uploading}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-secondary-container px-3 text-sm font-semibold text-on-secondary-container transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 size={17} className="motion-safe:animate-spin" aria-hidden="true" />
                ) : <Send size={17} aria-hidden="true" />}
                {uploading ? "Uploading…" : "Upload proof"}
              </button>
            ) : null}
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
                className={`min-h-12 rounded-xl bg-surface-container-high px-3 text-sm font-semibold transition-colors hover:bg-surface-container-highest disabled:opacity-50 ${review === "rejected" ? "w-full" : ""}`}
              >
                Change media
              </button>
            ) : null}
          </footer>
        ) : null}

        <input
          ref={camera}
          type="file"
          accept={captureMode === "video" ? "video/*" : "image/*"}
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
