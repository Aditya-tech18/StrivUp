"use client";

/**
 * ChallengeDetailClient.tsx — all interactive UI for a challenge detail page.
 *
 * Backward-compatible:
 *   • tasks.length === 0 → existing single-proof-per-day dark card (unchanged)
 *   • tasks.length  >  0 → task list with per-task status, upload, rejection
 *
 * Upload state machine per task (or the single legacy slot):
 *   idle → uploading → pending | error
 *   rejected tasks show reason + "Resubmit" (updates the existing row)
 */

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useCallback } from "react";
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Filter,
  Flame,
  ListChecks,
  Loader2,
  Lock,
  RefreshCw,
  Trophy,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { FeedCard, type FeedPost } from "@/components/features/FeedCard";
import { createClient } from "@/lib/supabase/client";
import type { ChallengeTask, TaskSubmission } from "@/lib/data/tasks";

/* ── Public types ─────────────────────────────────────────────────────────── */
export interface ChallengeDetail {
  id: string;
  title: string;
  creatorName: string;
  bannerUrl: string;
  memberCount: number;
  activeCount: number;
  successPercent: number;
  currentStreak: number;
  currentDay: number;
  totalDays: number;
  todayTask: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  avatarUrl: string;
  daysCompleted: number;
  totalDays: number | null;
  badge?: "champion" | "leader";
}

/* ── Props ────────────────────────────────────────────────────────────────── */
export interface ChallengeDetailClientProps {
  challenge: ChallengeDetail;
  leaderboard: LeaderboardEntry[];
  feed: FeedPost[];
  userId: string | null;
  joinedAt: string | null;
  tasks: ChallengeTask[];
  userSubmissions: TaskSubmission[];
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function calcDayNumber(joinedAt: string | null): number {
  if (!joinedAt) return 1;
  const ms = Date.now() - new Date(joinedAt).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(ms / 86_400_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

const PROOF_TYPE_ICONS: Record<string, string> = {
  photo: "📷", video: "🎥", text: "✍️", link: "🔗", none: "✓",
};

/* ── Upload logic (shared between legacy and per-task modes) ─────────────── */
interface UploadOpts {
  challengeId: string;
  userId: string | null;
  joinedAt: string | null;
  taskId?: string | null;
  /** If set, PATCH this row instead of INSERT (for resubmits) */
  existingSubmissionId?: string | null;
}

type SlotState = "idle" | "uploading" | "pending" | "error";
interface SlotData {
  state: SlotState;
  preview: string | null;
  error: string | null;
}

async function uploadProof(
  opts: UploadOpts,
  file: File
): Promise<{ preview: string; error: null } | { preview: null; error: string }> {
  const { challengeId, userId, joinedAt, taskId, existingSubmissionId } = opts;

  if (!userId) return { preview: null, error: "Sign in to upload proof." };

  const supabase = createClient();
  const dayNumber = calcDayNumber(joinedAt);

  // 1. Upload to storage
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/proofs/${challengeId}/${taskId ?? "main"}/${dayNumber}-${Date.now()}.${ext}`;
  const { error: storageError } = await supabase.storage
    .from("proof-media")
    .upload(path, file, { upsert: false });
  if (storageError) return { preview: null, error: storageError.message };

  const { data: { publicUrl } } = supabase.storage.from("proof-media").getPublicUrl(path);

  // 2. Upsert proof_submissions row
  if (existingSubmissionId) {
    // Resubmit: PATCH the existing row (respects unique constraints)
    const { error: updateError } = await supabase
      .from("proof_submissions")
      .update({
        media_url: publicUrl,
        verification_status: "pending",
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", existingSubmissionId);
    if (updateError) return { preview: null, error: updateError.message };
  } else {
    const { error: insertError } = await supabase
      .from("proof_submissions")
      .insert({
        challenge_id: challengeId,
        user_id: userId,
        day_number: dayNumber,
        task_id: taskId ?? null,
        media_url: publicUrl,
        verification_status: "pending",
      });
    if (insertError) return { preview: null, error: insertError.message };
  }

  // 3. Generate preview data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return { preview: dataUrl, error: null };
}

/* ── Per-task upload slot ────────────────────────────────────────────────── */
function TaskUploadSlot({
  task,
  submission,
  challengeId,
  userId,
  joinedAt,
}: {
  task: ChallengeTask;
  submission: TaskSubmission | undefined;
  challengeId: string;
  userId: string | null;
  joinedAt: string | null;
}) {
  const [slot, setSlot] = useState<SlotData>({
    state: submission?.status === "approved"
      ? "pending"   // approved → show approved state
      : submission?.status === "pending"
      ? "pending"
      : "idle",
    preview: null,
    error: null,
  });
  const [localStatus, setLocalStatus] = useState<TaskSubmission["status"] | null>(
    submission?.status ?? null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSlot({ state: "uploading", preview: null, error: null });

    const result = await uploadProof(
      {
        challengeId,
        userId,
        joinedAt,
        taskId: task.id,
        existingSubmissionId:
          localStatus === "rejected" ? submission?.submissionId ?? null : null,
      },
      file
    );

    if (result.error) {
      setSlot({ state: "error", preview: null, error: result.error });
    } else {
      setSlot({ state: "pending", preview: result.preview, error: null });
      setLocalStatus("pending");
    }
  }, [challengeId, userId, joinedAt, task.id, localStatus, submission]);

  const isApproved = localStatus === "approved";
  const isPending  = localStatus === "pending" && slot.state === "pending";
  const isRejected = localStatus === "rejected";
  const isIdle     = !isApproved && !isPending && !isRejected && slot.state === "idle";

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3">
      {/* Task header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-on-surface text-sm">{task.title}</h3>
            {!task.isRequired && (
              <Badge variant="default" className="text-[10px]">Optional</Badge>
            )}
            {task.proofType && task.proofType !== "none" && (
              <span className="text-[11px] text-on-surface-variant">
                {PROOF_TYPE_ICONS[task.proofType]} {task.proofType}
              </span>
            )}
          </div>
          {task.description && (
            <p className="text-xs text-on-surface-variant mt-0.5">{task.description}</p>
          )}
        </div>
        {/* Status badge */}
        {isApproved && (
          <div className="flex items-center gap-1 text-green-600 flex-shrink-0">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span className="text-xs font-semibold">Approved</span>
          </div>
        )}
        {isPending && (
          <div className="flex items-center gap-1 text-yellow-600 flex-shrink-0">
            <Clock size={14} aria-hidden="true" />
            <span className="text-xs font-semibold">Pending</span>
          </div>
        )}
        {isRejected && (
          <div className="flex items-center gap-1 text-red-500 flex-shrink-0">
            <XCircle size={14} aria-hidden="true" />
            <span className="text-xs font-semibold">Rejected</span>
          </div>
        )}
      </div>

      {/* Rejection reason */}
      {isRejected && submission?.rejectionReason && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          <strong>Reason:</strong> {submission.rejectionReason}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={task.proofType === "video" ? "video/*" : "image/*,video/*"}
        className="sr-only"
        onChange={handleFile}
        aria-hidden="true"
      />

      {/* Action area */}
      {!isApproved && (
        <>
          {slot.state === "uploading" && (
            <div className="flex items-center gap-2 text-on-surface-variant text-sm">
              <Loader2 size={14} className="animate-spin" />
              Uploading…
            </div>
          )}

          {(isIdle || isRejected) && slot.state !== "uploading" && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!userId}
              className={[
                "w-full h-9 rounded-lg border-2 border-dashed",
                "flex items-center justify-center gap-2",
                "text-sm font-medium transition-colors",
                isRejected
                  ? "border-red-300 text-red-500 hover:bg-red-50"
                  : "border-secondary/30 text-secondary hover:bg-secondary/5",
                !userId ? "opacity-50 cursor-not-allowed" : "",
              ].join(" ")}
            >
              {isRejected ? (
                <><RefreshCw size={14} aria-hidden="true" /> Resubmit</>
              ) : (
                <><Upload size={14} aria-hidden="true" /> Upload Proof</>
              )}
            </button>
          )}

          {slot.state === "pending" && slot.preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slot.preview}
              alt="Proof preview"
              className="w-full rounded-lg object-cover max-h-32"
            />
          )}

          {slot.state === "error" && (
            <div className="space-y-2">
              {slot.error && <p className="text-red-500 text-xs">{slot.error}</p>}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-secondary hover:underline"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Legacy single-proof upload card ─────────────────────────────────────── */
function LegacyUploadCard({
  challenge,
  userId,
  joinedAt,
  existingSubmission,
}: {
  challenge: ChallengeDetail;
  userId: string | null;
  joinedAt: string | null;
  existingSubmission: TaskSubmission | undefined;
}) {
  const [slot, setSlot] = useState<SlotData>({
    state: existingSubmission ? "pending" : "idle",
    preview: null,
    error: null,
  });
  const [localStatus, setLocalStatus] = useState<TaskSubmission["status"] | null>(
    existingSubmission?.status ?? null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSlot({ state: "uploading", preview: null, error: null });

    const result = await uploadProof(
      {
        challengeId: challenge.id,
        userId,
        joinedAt,
        taskId: null,
        existingSubmissionId:
          localStatus === "rejected" ? existingSubmission?.submissionId ?? null : null,
      },
      file
    );

    if (result.error) {
      setSlot({ state: "error", preview: null, error: result.error });
    } else {
      setSlot({ state: "pending", preview: result.preview, error: null });
      setLocalStatus("pending");
    }
  }, [challenge.id, userId, joinedAt, localStatus, existingSubmission]);

  const isRejected = localStatus === "rejected";

  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ background: "linear-gradient(135deg, #0d1c32 0%, #1a3a6b 100%)" }}
    >
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <Calendar size={12} className="text-white/60" aria-hidden="true" />
          <span className="type-label-caps text-white/60 text-[10px]">CURRENT CHALLENGE</span>
        </div>
        <h2 className="text-white font-semibold text-base leading-snug">
          Day {challenge.currentDay}: {challenge.todayTask}
        </h2>
        <p className="text-white/50 text-xs mt-1">
          {challenge.currentDay} of {challenge.totalDays} days
        </p>
      </div>

      {/* Rejection reason */}
      {isRejected && existingSubmission?.rejectionReason && (
        <div className="rounded-lg bg-red-900/30 border border-red-500/30 px-3 py-2 text-xs text-red-300">
          <strong>Rejected:</strong> {existingSubmission.rejectionReason}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="sr-only"
        onChange={handleFile}
        aria-hidden="true"
      />

      {slot.state === "idle" && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!userId}
          className={[
            "w-full h-11 rounded-lg bg-white text-primary",
            "flex items-center justify-center gap-2 font-semibold text-sm",
            "hover:bg-white/90 active:bg-white/80 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
            !userId ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
        >
          <Upload size={16} aria-hidden="true" />
          {userId
            ? isRejected ? "Resubmit Proof" : "Upload Today's Proof"
            : "Sign in to upload proof"}
        </button>
      )}

      {slot.state === "uploading" && (
        <div className="w-full h-11 rounded-lg bg-white/10 flex items-center justify-center gap-2 text-white/80 text-sm font-medium">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Uploading…
        </div>
      )}

      {slot.state === "pending" && (
        <div className="space-y-2">
          {slot.preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slot.preview} alt="Proof preview" className="w-full rounded-lg object-cover max-h-40" />
          )}
          <div className="w-full h-11 rounded-lg bg-yellow-500/20 border border-yellow-400/30 flex items-center justify-center gap-2 text-yellow-300 text-sm font-medium">
            <Clock size={16} aria-hidden="true" />
            Pending review — we&apos;ll notify you when approved
          </div>
          <button type="button" onClick={() => setSlot(s => ({ ...s, state: "idle" }))}
            className="w-full text-white/40 text-xs hover:text-white/60 transition-colors">
            Upload again
          </button>
        </div>
      )}

      {slot.state === "error" && (
        <div className="space-y-2">
          {slot.error && <p className="text-red-300 text-xs">{slot.error}</p>}
          <div className="w-full h-11 rounded-lg bg-red-500/20 border border-red-400/30 flex items-center justify-center gap-2 text-red-300 text-sm font-medium">
            <XCircle size={16} aria-hidden="true" />
            Upload failed. Try again.
          </div>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="w-full h-11 rounded-lg bg-white text-primary flex items-center justify-center gap-2 font-semibold text-sm hover:bg-white/90 transition-colors">
            <Upload size={16} aria-hidden="true" />
            Retry Upload
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Page client component ────────────────────────────────────────────────── */
export function ChallengeDetailClient({
  challenge,
  leaderboard,
  feed,
  userId,
  joinedAt,
  tasks,
  userSubmissions,
}: ChallengeDetailClientProps) {
  const hasTasks = tasks.length > 0;

  // Build a map: taskId → submission (latest per task)
  const submissionByTask = Object.fromEntries(
    userSubmissions
      .filter((s) => s.taskId)
      .map((s) => [s.taskId!, s])
  );
  // Legacy (no task_id)
  const legacySubmission = userSubmissions.find((s) => !s.taskId);

  // Determine if current user is the creator (for review link)
  // We can check via challenge.creatorName match but we don't have creatorId here
  // The review page does its own auth check, so just show the link to any logged-in user
  // (the page will 404/redirect if not the creator)

  return (
    <div className="min-h-screen bg-surface">

      {/* ── TopAppBar ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-outline-variant">
        <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-container flex items-center justify-center">
              <Flame size={16} className="text-on-primary" aria-hidden="true" />
            </div>
            <span className="type-label-caps text-secondary tracking-widest font-semibold">
              STRIV
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Manage Tasks link (creator-only — page does its own auth check) */}
            {userId && (
              <Link
                href={`/creator/challenges/${challenge.id}/manage-tasks`}
                className="flex items-center gap-1 text-xs text-on-surface-variant font-medium hover:text-secondary transition-colors w-9 h-9 justify-center rounded-full hover:bg-surface-variant"
                title="Manage tasks"
                aria-label="Manage tasks"
              >
                <ListChecks size={18} aria-hidden="true" />
              </Link>
            )}
            {/* Creator review link */}
            {userId && (
              <Link
                href={`/creator/challenges/${challenge.id}/submissions`}
                className="flex items-center gap-1 text-xs text-secondary font-semibold hover:underline w-9 h-9 justify-center rounded-full hover:bg-surface-variant transition-colors"
                title="Review submissions"
                aria-label="Review submissions"
              >
                <ClipboardList size={15} aria-hidden="true" />
              </Link>
            )}
            <Link
              href="/alerts"
              aria-label="Notifications"
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors"
            >
              <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto pb-8 space-y-5">

        {/* ── Banner ────────────────────────────────────────────────── */}
        <div className="relative">
          <div className="relative h-48 w-full bg-surface-variant overflow-hidden">
            <Image
              src={challenge.bannerUrl}
              alt={challenge.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 672px"
              priority
            />
          </div>
          <div className="mx-4 -mt-6 relative z-10">
            <Card bordered padding="md" className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="type-headline-sm text-on-surface font-semibold leading-tight">
                  {challenge.title}
                </h1>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Created by {challenge.creatorName}
                </p>
              </div>
              <div className="flex items-center gap-1 bg-secondary-container rounded-full px-3 py-1 flex-shrink-0">
                <Users size={12} className="text-on-secondary-container" aria-hidden="true" />
                <span className="type-label-caps text-on-secondary-container text-[10px] font-semibold">
                  {formatCount(challenge.memberCount)} MEMBERS
                </span>
              </div>
            </Card>
          </div>
        </div>

        <div className="px-4 space-y-5">

          {/* ── Stats row ───────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3" role="list" aria-label="Challenge statistics">
            {[
              { label: "ACTIVE",  value: challenge.activeCount.toLocaleString(), icon: null },
              { label: "SUCCESS", value: `${challenge.successPercent}%`,          icon: null },
              { label: "STREAK",  value: challenge.currentStreak,                 icon: <Flame size={14} className="text-secondary-fixed-dim" aria-hidden="true" /> },
            ].map(({ label, value, icon }) => (
              <Card key={label} bordered padding="sm" className="text-center" role="listitem">
                <p className="type-label-caps text-on-surface-variant text-[10px]">{label}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {icon}
                  <p className="font-bold text-on-surface text-xl leading-tight">{value}</p>
                </div>
              </Card>
            ))}
          </div>

          {/* ── Task list OR legacy single-proof card ─────────────── */}
          {hasTasks ? (
            <section aria-label="Challenge tasks">
              <div className="flex items-center justify-between mb-3">
                <h2 className="type-headline-sm text-on-surface font-semibold">
                  Today&apos;s Tasks
                </h2>
                <span className="text-xs text-on-surface-variant">
                  Day {challenge.currentDay} of {challenge.totalDays}
                </span>
              </div>
              {!userId && (
                <div className="mb-3 rounded-lg border border-outline-variant bg-surface-container px-4 py-3 flex items-center gap-2 text-sm text-on-surface-variant">
                  <Lock size={14} aria-hidden="true" />
                  Sign in to upload proof for each task.
                </div>
              )}
              <div className="space-y-3">
                {tasks.map((task) => (
                  <TaskUploadSlot
                    key={task.id}
                    task={task}
                    submission={submissionByTask[task.id]}
                    challengeId={challenge.id}
                    userId={userId}
                    joinedAt={joinedAt}
                  />
                ))}
              </div>
            </section>
          ) : (
            <LegacyUploadCard
              challenge={challenge}
              userId={userId}
              joinedAt={joinedAt}
              existingSubmission={legacySubmission}
            />
          )}

          {/* ── Rejected submissions notice (task mode) ───────────── */}
          {hasTasks && userSubmissions.some((s) => s.status === "rejected") && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex gap-2 text-sm text-red-700">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <strong>Some tasks were rejected.</strong> Review the reasons above and resubmit.
              </div>
            </div>
          )}

          {/* ── Leaderboard ───────────────────────────────────────────── */}
          <section aria-label="Leaderboard">
            <div className="flex items-center justify-between mb-3">
              <h2 className="type-headline-sm text-on-surface font-semibold">Leaderboard</h2>
              <Link href={`/challenges/${challenge.id}/leaderboard`}
                className="text-secondary text-sm font-semibold hover:underline">
                View All
              </Link>
            </div>

            {leaderboard.length > 0 ? (
              <Card bordered padding="none">
                {leaderboard.map((entry, idx) => (
                  <div
                    key={entry.rank}
                    className={[
                      "flex items-center gap-3 px-4 py-3",
                      idx < leaderboard.length - 1 ? "border-b border-outline-variant" : "",
                    ].join(" ")}
                  >
                    <span className={["w-6 text-center font-bold text-sm flex-shrink-0",
                      entry.rank === 1 ? "text-yellow-500" : "text-on-surface-variant"].join(" ")}>
                      {entry.rank}
                    </span>
                    <div className="relative w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-surface-variant">
                      <Image src={entry.avatarUrl} alt={entry.name} fill className="object-cover" unoptimized />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-on-surface text-sm truncate">{entry.name}</span>
                        {entry.badge === "champion" && (
                          <Badge variant="secondary" className="text-[10px] !bg-yellow-100 !text-yellow-700">Champion</Badge>
                        )}
                        {entry.badge === "leader" && (
                          <Badge variant="default" className="text-[10px]">Leader</Badge>
                        )}
                      </div>
                      <p className="text-xs text-on-surface-variant">
                        {entry.totalDays !== null
                          ? `${entry.daysCompleted}/${entry.totalDays} DAYS`
                          : `${entry.daysCompleted} DAY STREAK`}
                      </p>
                    </div>
                    {entry.rank === 1 && (
                      <Trophy size={18} className="text-yellow-500 flex-shrink-0" aria-label="Champion trophy" />
                    )}
                  </div>
                ))}
              </Card>
            ) : (
              <div className="rounded-xl border border-outline-variant px-6 py-5 text-center">
                <p className="text-on-surface-variant text-sm">No streaks recorded yet. Be the first!</p>
              </div>
            )}
          </section>

          {/* ── Community Feed ────────────────────────────────────────── */}
          <section aria-label="Community Feed">
            <div className="flex items-center justify-between mb-3">
              <h2 className="type-headline-sm text-on-surface font-semibold">Community Feed</h2>
              <button type="button"
                className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors"
                aria-label="Filter feed">
                <Filter size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {feed.length > 0 ? (
              <div className="space-y-4">
                {feed.map((post) => <FeedCard key={post.id} post={post} />)}
              </div>
            ) : (
              <div className="rounded-xl border border-outline-variant px-6 py-8 text-center">
                <p className="type-body-md text-on-surface-variant text-sm">
                  No approved posts yet. Upload your proof above to be the first!
                </p>
              </div>
            )}
          </section>

        </div>

        <div className="h-4" aria-hidden="true" />
      </div>
    </div>
  );
}
