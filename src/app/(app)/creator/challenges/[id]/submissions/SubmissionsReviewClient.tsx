"use client";

/**
 * SubmissionsReviewClient.tsx — interactive review queue for challenge creators.
 *
 * Filter tabs: All / Pending / Approved / Rejected
 * Each row: avatar, name, task title, submitted_at, proof preview, Approve / Reject
 * Reject opens an inline form requiring a rejection_reason before submitting.
 */

import Image from "next/image";
import { useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Loader2,
  X,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { approveSubmission, rejectSubmission } from "@/lib/data/tasks";
import type { ReviewSubmission, SubmissionStatus } from "@/lib/data/tasks";

type TabFilter = "all" | SubmissionStatus;
const TABS: { label: string; value: TabFilter }[] = [
  { label: "All",      value: "all" },
  { label: "Pending",  value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(ms / 86_400_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

/* ── Single submission row ────────────────────────────────────────────────── */
function SubmissionRow({
  submission,
  reviewerId,
  onStatusChange,
}: {
  submission: ReviewSubmission;
  reviewerId: string;
  onStatusChange: (id: string, newStatus: SubmissionStatus, reason?: string) => void;
}) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const supabase = createClient();

  const handleApprove = () => {
    setRowError(null);
    startTransition(async () => {
      const { error } = await approveSubmission(supabase, submission.submissionId, reviewerId);
      if (error) { setRowError(error); return; }
      onStatusChange(submission.submissionId, "approved");
    });
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) return;
    setRowError(null);
    startTransition(async () => {
      const { error } = await rejectSubmission(
        supabase, submission.submissionId, reviewerId, rejectionReason.trim()
      );
      if (error) { setRowError(error); return; }
      onStatusChange(submission.submissionId, "rejected", rejectionReason.trim());
      setShowRejectForm(false);
      setRejectionReason("");
    });
  };

  return (
    <div className="border border-outline-variant rounded-xl overflow-hidden bg-surface-container-lowest">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Avatar */}
        <div className="relative w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-surface-variant">
          <Image
            src={submission.userAvatarUrl}
            alt={submission.userName}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-on-surface text-sm truncate">{submission.userName}</p>
          <p className="text-xs text-on-surface-variant">
            {submission.taskTitle ? `Task: ${submission.taskTitle}` : `Day ${submission.dayNumber}`}
            {" · "}
            {relativeTime(submission.submittedAt)}
          </p>
        </div>
        {/* Current status badge */}
        <div className="flex-shrink-0">
          {submission.status === "approved" && (
            <span className="flex items-center gap-1 text-green-700 bg-green-100 text-[11px] font-semibold rounded-full px-2 py-0.5">
              <CheckCircle2 size={11} /> Approved
            </span>
          )}
          {submission.status === "pending" && (
            <span className="flex items-center gap-1 text-yellow-700 bg-yellow-100 text-[11px] font-semibold rounded-full px-2 py-0.5">
              <Clock size={11} /> Pending
            </span>
          )}
          {submission.status === "rejected" && (
            <span className="flex items-center gap-1 text-red-700 bg-red-100 text-[11px] font-semibold rounded-full px-2 py-0.5">
              <XCircle size={11} /> Rejected
            </span>
          )}
        </div>
      </div>

      {/* Proof preview */}
      {submission.mediaUrl && (
        <div className="px-4 pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={submission.mediaUrl}
            alt="Proof"
            className="w-full rounded-lg object-cover max-h-52 bg-surface-variant"
            loading="lazy"
          />
          {submission.caption && (
            <p className="text-xs text-on-surface-variant mt-2 line-clamp-2">{submission.caption}</p>
          )}
        </div>
      )}

      {/* Rejection reason (if already rejected) */}
      {submission.status === "rejected" && submission.rejectionReason && (
        <div className="mx-4 mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          <strong>Rejection reason:</strong> {submission.rejectionReason}
        </div>
      )}

      {/* Error */}
      {rowError && (
        <p className="mx-4 mb-3 text-xs text-red-600">{rowError}</p>
      )}

      {/* Actions — only show when not already reviewed (or allow re-review) */}
      {submission.status !== "approved" && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          {/* Reject form */}
          {showRejectForm && (
            <div className="space-y-2">
              <textarea
                id={`reject-reason-${submission.submissionId}`}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this proof is rejected (required)…"
                rows={2}
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface resize-none focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={!rejectionReason.trim() || isPending}
                  className="flex-1 h-9 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  Confirm Reject
                </button>
                <button
                  type="button"
                  onClick={() => { setShowRejectForm(false); setRejectionReason(""); }}
                  className="px-4 h-9 rounded-lg border border-outline-variant text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!showRejectForm && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleApprove}
                disabled={isPending}
                className="flex-1 h-9 rounded-lg bg-secondary text-on-secondary text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Approve
              </button>
              <button
                type="button"
                onClick={() => setShowRejectForm(true)}
                disabled={isPending}
                className="flex-1 h-9 rounded-lg border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <X size={14} />
                Reject
              </button>
            </div>
          )}
        </div>
      )}

      {/* Already approved — allow un-approve via reject */}
      {submission.status === "approved" && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => setShowRejectForm(!showRejectForm)}
            className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-red-600 transition-colors"
          >
            <ChevronDown size={12} className={showRejectForm ? "rotate-180" : ""} />
            Override decision
          </button>
          {showRejectForm && (
            <div className="mt-2 space-y-2">
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Reason for overriding approval…"
                rows={2}
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={!rejectionReason.trim() || isPending}
                  className="h-9 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-700 transition-colors"
                >
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : "Reject"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowRejectForm(false); setRejectionReason(""); }}
                  className="h-9 px-4 rounded-lg border border-outline-variant text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main client component ───────────────────────────────────────────────── */
export function SubmissionsReviewClient({
  initialSubmissions,
  challengeTitle,
  reviewerId,
}: {
  initialSubmissions: ReviewSubmission[];
  challengeTitle: string;
  reviewerId: string;
}) {
  const [activeTab, setActiveTab] = useState<TabFilter>("pending");
  const [submissions, setSubmissions] = useState(initialSubmissions);

  const handleStatusChange = (
    id: string,
    newStatus: SubmissionStatus,
    reason?: string
  ) => {
    setSubmissions((prev) =>
      prev.map((s) =>
        s.submissionId === id
          ? { ...s, status: newStatus, rejectionReason: reason ?? s.rejectionReason }
          : s
      )
    );
  };

  const filtered =
    activeTab === "all"
      ? submissions
      : submissions.filter((s) => s.status === activeTab);

  const counts = {
    all:      submissions.length,
    pending:  submissions.filter((s) => s.status === "pending").length,
    approved: submissions.filter((s) => s.status === "approved").length,
    rejected: submissions.filter((s) => s.status === "rejected").length,
  };

  return (
    <div className="space-y-4">
      {/* Challenge subtitle */}
      <p className="text-sm text-on-surface-variant">{challengeTitle}</p>

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-container rounded-xl p-1" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={[
              "flex-1 h-8 rounded-lg text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
              activeTab === tab.value
                ? "bg-surface text-on-surface shadow-sm"
                : "text-on-surface-variant hover:text-on-surface",
            ].join(" ")}
          >
            {tab.label}
            {counts[tab.value] > 0 && (
              <span className={[
                "ml-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold w-4 h-4",
                tab.value === "pending"
                  ? "bg-yellow-100 text-yellow-700"
                  : tab.value === "rejected"
                  ? "bg-red-100 text-red-700"
                  : "bg-secondary/10 text-secondary",
              ].join(" ")}>
                {counts[tab.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Submission list */}
      {filtered.length > 0 ? (
        <div className="space-y-3" role="list">
          {filtered.map((s) => (
            <div key={s.submissionId} role="listitem">
              <SubmissionRow
                submission={s}
                reviewerId={reviewerId}
                onStatusChange={handleStatusChange}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-outline-variant px-6 py-12 text-center">
          <p className="font-semibold text-on-surface mb-1">No submissions here</p>
          <p className="text-sm text-on-surface-variant">
            {activeTab === "pending"
              ? "All caught up — no pending submissions."
              : `No ${activeTab} submissions yet.`}
          </p>
        </div>
      )}
    </div>
  );
}
