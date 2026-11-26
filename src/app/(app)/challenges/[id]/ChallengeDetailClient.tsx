"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProofComposer } from "@/components/features/challenge/ProofComposer";
import { ProofReviewWatcher } from "@/components/features/challenge/ProofReviewWatcher";
import { createClient } from "@/lib/supabase/client";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  ChartNoAxesColumnIncreasing,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Coins,
  Flame,
  Images,
  ListChecks,
  Loader2,
  Lock,
  ShieldCheck,
  Trophy,
  Upload,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { Badge, BrandMark, UserAvatar } from "@/components/ui";
import { FeedCard, type FeedPost } from "@/components/features/FeedCard";
import { calcDayNumber } from "@/lib/data/proofs";
import { emitStrivyEvent } from "@/components/features/strivy/companion";
import { InviteSheet } from "@/components/features/InviteSheet";
import { ShareButton } from "@/components/features/share/ShareButton";
import { PeopleListSheet } from "@/components/features/people/PeopleList";
import { getChallengeMembers, type Facepile as FacepileData } from "@/lib/data/social";
import { Facepile } from "@/components/features/people/Facepile";
import type { ChallengeTask, TaskSubmission } from "@/lib/data/tasks";
import { PhysicalTaskCard, LiveStepTracker } from "@/components/features/activity";
import { currentChallengePeriodProgress } from "@/lib/data/activity";
import { ProofRequirementsNotice } from "@/components/features/proof/ProofRequirementsNotice";
import type { ProofRequirement } from "@/lib/data/proofRequirements";
import type { PhysicalActivityConfig, QuestActivityProgress } from "@/lib/activity/types";
import { challengeDeadline, isPastDeadline } from "@/lib/participation";
import { ClosedBadge } from "@/components/features/participation/ClosedBadge";
import { LeaveParticipationButton } from "@/components/features/participation/LeaveParticipationButton";
import { LeaderboardRefresh } from "@/components/features/participation/LeaderboardRefresh";
import { useScheduleTime } from "@/components/features/participation/useScheduleTime";

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
  durationDays: number | null;
  enrollmentEndsAt: string | null;
  todayTask: string;
  visibility: "public" | "private";
  /** Derived at creation time; tells a participant what to photograph. */
  proofInstructions: string | null;
  /** StrivCoins burned for each missed day. 0 on every unstaked challenge. */
  dailyStake: number;
  /** Used to decide whether the daily proof should offer the step counter. */
  category?: string | null;
  proofMethods?: string[];
}

export interface LeaderboardEntry {
  userId: string;
  rank: number;
  name: string;
  avatarUrl: string;
  daysCompleted: number;
  badge?: "champion" | "leader";
}

/* ── Props ────────────────────────────────────────────────────────────────── */
export interface ChallengeDetailClientProps {
  challenge: ChallengeDetail;
  leaderboard: LeaderboardEntry[];
  feed: FeedPost[];
  userId: string | null;
  joinedAt: string | null;
  isParticipant: boolean;
  /** Viewer created this challenge. Gates the creator-only controls. */
  isCreator: boolean;
  tasks: ChallengeTask[];
  userSubmissions: TaskSubmission[];
  /** A few members' faces plus the real total, for the facepile line. */
  memberPile?: FacepileData;
}

const PROOF_TYPE_LABELS = {
  photo: "Photo",
  video: "Video",
  text: "Text",
  link: "Link",
  physical_activity: "Activity",
  none: null,
};

function celebrateApproval() {
  emitStrivyEvent({ type: "CHALLENGE_COMPLETED" });
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
  const [composerOpen, setComposerOpen] = useState(false);
  const router = useRouter();
  const status = submission?.status;
  const canUpload = !status || status === "rejected";
  const proofType = task.proofType ? PROOF_TYPE_LABELS[task.proofType] : null;

  return (
    <div className="space-y-3 rounded-xl bg-surface-container-high/55 p-3 sm:p-4">
      {status === "pending" && submission ? (
        <ProofReviewWatcher submissionId={submission.submissionId} onResult={result => {
          if (result.status !== "pending") router.refresh();
        }} />
      ) : null}
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
          <ClipboardList size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-sm font-bold text-on-surface">{task.title}</h3>
            {!task.isRequired ? <Badge variant="default" className="text-label-sm">Optional</Badge> : null}
            {proofType ? <span className="text-xs font-semibold text-on-surface-variant">{proofType}</span> : null}
          </div>
          {task.description ? <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">{task.description}</p> : null}
        </div>
        {status ? (
          <Badge variant={status === "approved" ? "success" : status === "rejected" ? "error" : "outline"}>
            {status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Pending"}
          </Badge>
        ) : null}
      </div>
      {status === "rejected" && submission?.rejectionReason ? (
        <p className="rounded-lg border border-error-outline bg-error-container px-3 py-2 text-sm text-on-error-container">
          {submission.rejectionReason}
        </p>
      ) : null}
      {canUpload ? (
        <button type="button" onClick={() => setComposerOpen(true)} disabled={!userId}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary-container px-3 text-sm font-semibold text-on-secondary-container transition-opacity hover:opacity-90 disabled:opacity-50">
          <Upload size={14} aria-hidden="true" /> {status === "rejected" ? "Resubmit proof" : "Upload proof"}
        </button>
      ) : null}
      {composerOpen ? (
        <ProofComposer
          open
          onClose={() => setComposerOpen(false)}
          onApproved={celebrateApproval}
          challengeId={challengeId}
          userId={userId}
          joinedAt={joinedAt}
          taskId={task.id}
          existingSubmissionId={submission?.submissionId ?? null}
          proofTitle={task.title}
          proofInstruction={task.description || task.title}
          videoOnly={task.proofType === "video"}
        />
      ) : null}
    </div>
  );
}

/* ── Legacy single-proof upload card ─────────────────────────────────────── */
/**
 * Does this challenge measure movement?
 *
 * A walking or running challenge was still asking only for a photo, which
 * proves someone owns shoes rather than that they walked. There is no task
 * config on a task-less challenge to read a target from, so the signal has to
 * come from what the creator chose: the category, the proof methods they
 * picked, or the title itself.
 */
const MOVEMENT_WORDS = /\b(walk|walking|steps?|run|running|jog|jogging|cycle|cycling|marathon|10k|5k)\b/i;

function isMovementChallenge(c: ChallengeDetail): boolean {
  if (c.category && MOVEMENT_WORDS.test(c.category)) return true;
  if ((c.proofMethods ?? []).some((m) => MOVEMENT_WORDS.test(m))) return true;
  return MOVEMENT_WORDS.test(c.title) || MOVEMENT_WORDS.test(c.todayTask ?? "");
}

function LegacyUploadCard({
  challenge,
  userId,
  joinedAt,
  submission,
}: {
  challenge: ChallengeDetail;
  userId: string | null;
  joinedAt: string | null;
  submission: TaskSubmission | undefined;
}) {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const status = submission?.status;
  const rejected = status === "rejected";

  return (
    <section id="proof" aria-label="Today's proof" className="scroll-mt-24 space-y-3 rounded-2xl bg-surface-container-low p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
          <Camera size={19} className="text-streak-ink" aria-hidden="true" /> Today&apos;s proof
        </h2>
        <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
          Day {calcDayNumber(joinedAt)}{challenge.durationDays ? ` of ${challenge.durationDays}` : ""}
        </span>
      </div>

      {isMovementChallenge(challenge) ? <LiveStepTracker timezone="Asia/Kolkata" /> : null}

      {status === "pending" && submission ? (
        <>
          <ProofReviewWatcher submissionId={submission.submissionId} onResult={(result) => {
            if (result.status !== "pending") router.refresh();
          }} />
          <p role="status" className="flex items-center gap-2 rounded-xl bg-surface-container-high p-3 text-sm font-semibold">
            <Clock size={17} className="shrink-0 text-coin-ink" aria-hidden="true" />
            Proof saved and awaiting review
          </p>
        </>
      ) : null}

      {status === "approved" ? (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-streak/15 p-3 text-sm font-bold text-streak-ink">
          <CheckCircle2 size={17} className="shrink-0" aria-hidden="true" /> Proof approved
        </p>
      ) : null}

      {rejected && submission?.rejectionReason ? (
        <p className="rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container">{submission.rejectionReason}</p>
      ) : null}

      {!status || rejected ? (
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          disabled={!userId}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary-container px-4 text-sm font-bold text-on-secondary-container transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Camera size={18} aria-hidden="true" />
          {userId ? (rejected ? "Resubmit proof" : "Post today's proof") : "Sign in to upload proof"}
        </button>
      ) : null}

      {composerOpen ? (
        <ProofComposer
          open
          onClose={() => setComposerOpen(false)}
          onApproved={celebrateApproval}
          challengeId={challenge.id}
          userId={userId}
          joinedAt={joinedAt}
          existingSubmissionId={rejected ? submission?.submissionId : null}
          proofInstruction={challenge.proofInstructions}
          proofTitle={challenge.title}
        />
      ) : null}
    </section>
  );
}

/* ── Page client component ────────────────────────────────────────────────── */
export function ChallengeDetailClient({
  challenge,
  leaderboard,
  feed,
  userId,
  joinedAt,
  isParticipant: initialIsParticipant,
  isCreator,
  tasks,
  userSubmissions,
  memberPile,
}: ChallengeDetailClientProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isParticipant, setIsParticipant] = useState(initialIsParticipant);
  const [joinError, setJoinError] = useState<string | null>(null);
  const hasTasks = tasks.length > 0;
  const deadline = isParticipant && joinedAt
    ? challengeDeadline(joinedAt, challenge.durationDays)
    : challenge.enrollmentEndsAt;
  const scheduleTime = useScheduleTime(null, deadline);
  const closed = isPastDeadline(deadline, scheduleTime);

  // Physical activity is additive: a challenge with no physical task simply
  // gets two empty results and renders exactly as it did before.
  const [activityConfigs, setActivityConfigs] = useState<Map<string, PhysicalActivityConfig>>(
    new Map()
  );
  const [activityProgress, setActivityProgress] = useState<QuestActivityProgress[]>([]);

  // What each task's proof must show. Loaded for every challenge with tasks,
  // not just physical ones — this is what the participant is told before they
  // upload, and what the AI reviewer is held to.
  const [proofRequirements, setProofRequirements] = useState<Map<string, ProofRequirement>>(
    new Map()
  );

  const hasPhysicalTask = tasks.some((t) => t.proofType === "physical_activity");

  useEffect(() => {
    if (!hasTasks) return;
    let cancelled = false;
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const { getChallengeProofRequirements } = await import("@/lib/data/proofRequirements");
      const reqs = await getChallengeProofRequirements(createClient(), challenge.id);
      if (!cancelled) setProofRequirements(reqs);
    })();
    return () => {
      cancelled = true;
    };
  }, [challenge.id, hasTasks]);

  useEffect(() => {
    if (!userId || !hasPhysicalTask) return;
    let cancelled = false;
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const { getChallengeActivityConfigs, getChallengeActivityProgress } = await import(
        "@/lib/data/activity"
      );
      const supabase = createClient();
      const [configs, progress] = await Promise.all([
        getChallengeActivityConfigs(supabase, challenge.id),
        getChallengeActivityProgress(supabase, challenge.id, userId),
      ]);
      if (cancelled) return;
      setActivityConfigs(configs);
      setActivityProgress(progress);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, challenge.id, hasPhysicalTask]);

  const handleJoin = () => {
    if (isPastDeadline(challenge.enrollmentEndsAt)) return;
    if (!userId) {
      router.push(`/login?next=/challenges/${challenge.id}`);
      return;
    }
    setJoinError(null);

    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("challenge_participants").insert({
        challenge_id: challenge.id,
        user_id: userId,
        status: "active",
      });

      if (error && error.code !== "23505") {
        setJoinError(error.message);
        return;
      }

      setIsParticipant(true);
      router.refresh();
    });
  };

  const proofDay = calcDayNumber(joinedAt);
  const todaysSubmissions = userSubmissions.filter((submission) => submission.dayNumber === proofDay);
  const submissionByTask = Object.fromEntries(
    todaysSubmissions.filter((s) => s.taskId).map((s) => [s.taskId!, s])
  );
  const legacySubmission = todaysSubmissions.find((s) => !s.taskId);

  const isPrivate = challenge.visibility === "private";
  const panel = "space-y-3 rounded-2xl bg-surface-container-low p-4 sm:p-5";
  const toolbarButton = "grid size-11 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface";

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface/95 pt-safe backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-1 sm:gap-2 sm:px-6">
          <Link href="/challenges" aria-label="Back to challenges" className={toolbarButton + " -ml-2"}>
            <ArrowLeft size={21} aria-hidden="true" />
          </Link>
          <BrandMark variant="mark" height={23} className="mr-1 hidden shrink-0 sm:block" />
          <p className="min-w-0 flex-1 font-display text-sm leading-tight font-extrabold tracking-tight sm:text-lg">Challenge details</p>
          <ShareButton
            kind="challenge"
            id={challenge.id}
            title={challenge.title}
            isPrivate={isPrivate}
            className={toolbarButton}
          />
          {isCreator && !isPastDeadline(challenge.enrollmentEndsAt) ? (
            <button type="button" onClick={() => setInviteOpen(true)} className={toolbarButton} aria-label="Invite people to this challenge" title="Invite people">
              <UserPlus size={19} aria-hidden="true" />
            </button>
          ) : null}
          <Link href="/alerts" aria-label="Notifications" className={toolbarButton + " -mr-2"}>
            <Bell size={19} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-6">
        <section aria-labelledby="challenge-title" className="overflow-hidden rounded-2xl bg-surface-container-low sm:rounded-3xl">
          <div className={`relative flex min-h-56 flex-col justify-end overflow-hidden bg-[#151c2a] p-4 text-white sm:min-h-72 sm:p-6 lg:min-h-80 ${closed ? "grayscale" : ""}`}>
            <Image
              src={challenge.bannerUrl}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1050px) 90vw, 976px"
              preload
            />
            <div className="absolute inset-0 bg-linear-to-b from-black/50 via-black/20 to-[#101522]" aria-hidden="true" />

            <div className="absolute inset-x-4 top-4 flex flex-wrap items-center justify-between gap-2 sm:inset-x-6 sm:top-6">
              {closed ? <ClosedBadge /> : <span className="inline-flex items-center gap-1.5 rounded-full bg-streak px-2.5 py-1 text-xs font-bold text-on-streak">
                {isPrivate ? <Lock size={13} aria-hidden="true" /> : <Zap size={13} aria-hidden="true" />}
                {isPrivate ? "Private challenge" : "Public challenge"}
              </span>}
              {!closed && challenge.dailyStake > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-coin px-2.5 py-1 text-xs font-bold text-on-coin">
                  <Coins size={13} aria-hidden="true" /> {challenge.dailyStake} StrivCoins per day
                </span>
              ) : null}
            </div>

            <div className="relative max-w-2xl pt-12">
              <p className="mb-2 w-fit rounded-full bg-[#151c2a]/90 px-2.5 py-1 text-xs font-semibold text-white/90">Hosted by {challenge.creatorName}</p>
              <h1 id="challenge-title" className="break-words font-display text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
                {challenge.title}
              </h1>
              {challenge.category ? <p className="mt-1 text-sm font-semibold text-white/85 capitalize">{challenge.category.replace(/[-_]+/g, " ")}</p> : null}
            </div>
          </div>
          {closed ? (
            <p className="bg-surface-container-high px-4 py-3 text-sm font-semibold text-on-surface-variant sm:px-6">This challenge has ended.</p>
          ) : challenge.dailyStake > 0 ? (
            <p className="flex items-start gap-2 bg-surface-container-high px-4 py-3 text-sm text-on-surface-variant sm:px-6">
              <ShieldCheck className="shrink-0 text-streak-ink" size={18} aria-hidden="true" />
              <span>Missed days cost <strong className="text-coin-ink">{challenge.dailyStake} StrivCoins</strong> each.</span>
            </p>
          ) : null}
        </section>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3" aria-label="Challenge statistics" role="list">
          {[
            { label: "Duration", value: challenge.durationDays ?? "Ongoing", unit: challenge.durationDays ? "days" : undefined, detail: challenge.durationDays ? `Day ${isParticipant ? Math.min(proofDay, challenge.durationDays) : challenge.currentDay} of ${challenge.durationDays}` : undefined, Icon: Calendar, tone: "text-secondary" },
            { label: "Active members", value: challenge.activeCount.toLocaleString(), detail: "See members", Icon: Users, tone: "text-streak-ink" },
            { label: "Your streak", value: challenge.currentStreak, unit: challenge.currentStreak === 1 ? "day" : "days", Icon: Flame, tone: "text-coin-ink" },
            { label: "Latest proof rate", value: challenge.successPercent + "%", Icon: ChartNoAxesColumnIncreasing, tone: "text-secondary" },
          ].map(({ label, value, unit, detail, Icon, tone }) => {
            const isMembers = Icon === Users;
            const content = (
              <>
                <span className="flex items-center justify-between gap-2 text-[0.6875rem] font-bold tracking-wider text-on-surface-variant uppercase sm:text-xs">
                  {label}
                  <Icon size={16} className={"shrink-0 " + tone} aria-hidden="true" />
                </span>
                <span className="mt-2 block font-display text-2xl leading-none font-extrabold tracking-tight tabular-nums sm:text-[1.75rem]">
                  {value}{unit ? <span className="ml-1 text-xs font-semibold tracking-normal text-on-surface-variant">{unit}</span> : null}
                </span>
                {detail ? <span className={"mt-2 block text-xs font-semibold " + (isMembers ? "text-streak-ink" : "text-on-surface-variant")}>{detail}</span> : null}
                {Icon === ChartNoAxesColumnIncreasing ? (
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-surface-container-highest" aria-hidden="true">
                    <span className="block h-full rounded-full bg-streak" style={{ width: challenge.successPercent + "%" }} />
                  </span>
                ) : null}
              </>
            );
            return (
              <div key={label} role="listitem" className="min-w-0 rounded-xl bg-surface-container-low">
                {isMembers ? (
                  <button
                    type="button"
                    onClick={() => setMembersOpen(true)}
                    className="block h-full w-full rounded-xl p-3 text-left transition-colors hover:bg-surface-container-high sm:p-4"
                  >
                    {content}
                  </button>
                ) : <div className="p-3 sm:p-4">{content}</div>}
              </div>
            );
          })}
        </div>

        {isCreator ? (
          <nav aria-label="Creator tools" className="flex flex-wrap gap-2">
            <Link href={"/creator/challenges/" + challenge.id + "/manage-tasks"} className="flex min-h-11 min-w-fit flex-1 items-center justify-center gap-2 rounded-xl bg-surface-container-low px-3 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">
              <ListChecks size={17} className="text-secondary" aria-hidden="true" /> Manage tasks
            </Link>
            <Link href={"/creator/challenges/" + challenge.id + "/submissions"} className="flex min-h-11 min-w-fit flex-1 items-center justify-center gap-2 rounded-xl bg-surface-container-low px-3 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">
              <ClipboardList size={17} className="text-secondary" aria-hidden="true" /> Review submissions
            </Link>
          </nav>
        ) : null}

        {isParticipant && userId ? (
          <LeaveParticipationButton kind="challenge" id={challenge.id} onLeft={() => {
            setIsParticipant(false);
            if (isPrivate && !isCreator) router.replace("/challenges");
            else router.refresh();
          }} />
        ) : null}

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-4 sm:space-y-5">
            {isParticipant && !closed ? (
              hasTasks ? (
                <section id="proof" aria-label="Challenge tasks" className={panel + " scroll-mt-24"}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
                      <ListChecks size={19} className="text-streak-ink" aria-hidden="true" /> Today&apos;s tasks
                    </h2>
                    <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
                      Day {proofDay}{challenge.durationDays ? ` of ${challenge.durationDays}` : ""}
                    </span>
                  </div>
                  {!userId ? (
                    <p className="flex items-center gap-2 rounded-xl bg-surface-container-high p-3 text-sm text-on-surface-variant">
                      <Lock size={16} aria-hidden="true" /> Sign in to upload proof for each task.
                    </p>
                  ) : null}
                  {tasks.map((task) => {
                    // A configured physical task uses its tracker in place of a media upload.
                    const activityConfig = activityConfigs.get(task.id);
                    if (task.proofType === "physical_activity" && activityConfig) {
                      return (
                        <PhysicalTaskCard
                          key={task.id}
                          taskTitle={task.title}
                          taskDescription={task.description}
                          config={activityConfig}
                          progress={currentChallengePeriodProgress(
                            activityProgress,
                            task.id,
                            new Date().toLocaleDateString("en-CA", {
                              timeZone: activityConfig.timezone || "Asia/Kolkata",
                            })
                          )}
                          questTitle={challenge.title}
                        />
                      );
                    }
                    const requirement = proofRequirements.get(task.id);
                    const submission = submissionByTask[task.id];
                    return (
                      <div key={task.id} className="space-y-2">
                        {requirement && submission?.status !== "approved" ? <ProofRequirementsNotice requirement={requirement} /> : null}
                        <TaskUploadSlot
                          key={proofDay + ":" + (submission?.submissionId ?? "new") + ":" + (submission?.status ?? "")}
                          task={task}
                          submission={submission}
                          challengeId={challenge.id}
                          userId={userId}
                          joinedAt={joinedAt}
                        />
                      </div>
                    );
                  })}
                  {todaysSubmissions.some((submission) => submission.status === "rejected") ? (
                    <p className="flex items-start gap-2 rounded-xl bg-error-container p-3 text-sm text-on-error-container">
                      <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                      Review the reasons above before resubmitting any rejected tasks.
                    </p>
                  ) : null}
                </section>
              ) : (
                <LegacyUploadCard
                  key={proofDay + ":" + (legacySubmission?.submissionId ?? "new") + ":" + (legacySubmission?.status ?? "")}
                  challenge={challenge}
                  userId={userId}
                  joinedAt={joinedAt}
                  submission={legacySubmission}
                />
              )
            ) : isPrivate && !closed && !isParticipant ? (
              <section aria-label="Join this challenge" className={panel}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary-fixed text-on-secondary-fixed">
                    <Lock size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-display font-extrabold tracking-tight">This challenge is private</h2>
                    <p className="mt-1 text-sm text-on-surface-variant">Ask the creator for an invite link to join.</p>
                  </div>
                </div>
              </section>
            ) : null}

            <section aria-labelledby="challenge-rules" className={panel}>
              <h2 id="challenge-rules" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
                <ShieldCheck size={19} className="text-streak-ink" aria-hidden="true" /> Rules &amp; proof
              </h2>
              <div className="flex items-start gap-3 rounded-xl bg-surface-container-high/55 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
                  <ClipboardList size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold">What to do</h3>
                  <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-on-surface-variant">{challenge.todayTask}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-surface-container-high/55 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-streak text-on-streak">
                  <Camera size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold">{hasTasks ? "Task proof" : "Daily proof"}</h3>
                  <p className="mt-1 break-words text-sm leading-relaxed text-on-surface-variant">
                    {challenge.proofInstructions || (hasTasks ? "Follow the proof requirements for each task." : "Upload a photo or video showing your activity. You can add a caption before submitting.")}
                  </p>
                </div>
              </div>
              {hasTasks && !isParticipant ? (
                <ol className="space-y-1 rounded-xl bg-surface-container-high/55 py-2 pr-3 pl-8 text-sm text-on-surface-variant marker:font-semibold marker:text-secondary list-decimal">
                  {tasks.map((task) => (
                    <li key={task.id} className="break-words py-1">
                      <span className="font-semibold text-on-surface">{task.title}</span>{task.isRequired ? null : " (optional)"}
                      {task.description ? <p className="mt-0.5 leading-relaxed">{task.description}</p> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          </div>

          <section aria-labelledby="challenge-leaderboard" className={panel + " self-start"}>
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <h2 id="challenge-leaderboard" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
                <Trophy size={19} className="text-coin-ink" aria-hidden="true" /> Leaderboard
              </h2>
              <div className="flex items-center gap-1">
                <LeaderboardRefresh />
                <Link prefetch={false} href={"/challenges/" + challenge.id + "/leaderboard"} className="inline-flex min-h-11 items-center gap-0.5 rounded-md text-xs font-bold text-secondary hover:underline">
                  View all <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
            {leaderboard.length > 0 ? (
              <ol className="space-y-2">
                {leaderboard.map((entry) => (
                  <li key={entry.userId} className="flex min-h-14 items-center gap-2.5 rounded-xl bg-surface-container-high/55 px-3 py-2">
                    <span className={"grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold " + (entry.rank === 1 ? "bg-coin text-on-coin" : "bg-surface-container-highest text-on-surface-variant")}>
                      {entry.rank}
                    </span>
                    <UserAvatar src={entry.avatarUrl} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{entry.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {entry.daysCompleted} {entry.daysCompleted === 1 ? "verified day" : "verified days"}
                      </p>
                    </div>
                    {entry.badge ? (
                      <span className={"rounded-full px-2 py-1 text-[0.6875rem] font-bold " + (entry.badge === "champion" ? "bg-coin/20 text-coin-ink" : "bg-streak/20 text-streak-ink")}>
                        {entry.badge === "champion" ? "Champion" : "Leader"}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : <p className="rounded-xl bg-surface-container-high/55 p-3 text-sm text-on-surface-variant">Rankings appear after participants get proof approved.</p>}
            {memberPile && memberPile.total > 0 ? (
              <Facepile people={memberPile.people} total={memberPile.total} verb="Joined by" noun="member" size={25} className="min-h-11 max-w-full" onOpen={() => setMembersOpen(true)} />
            ) : null}
          </section>
        </div>

        <section aria-labelledby="challenge-community" className={panel}>
          <h2 id="challenge-community" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
            <Images size={19} className="text-streak-ink" aria-hidden="true" /> Recent community proofs
          </h2>
          {feed.length > 0 ? (
            <div className="space-y-3">
              {feed.map((post) => <FeedCard key={post.id} post={post} viewerId={userId} />)}
            </div>
          ) : (
            <p className="rounded-xl bg-surface-container-high/55 p-3 text-sm text-on-surface-variant">No approved posts yet.</p>
          )}
        </section>

        {!closed && !isParticipant && !isPrivate ? (
          <footer aria-label="Join this challenge" className="sticky bottom-[var(--bottom-nav-h)] z-20 -mx-4 border-t border-outline-variant/60 bg-surface/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 md:bottom-0">
            {joinError ? <p role="alert" className="mb-2 rounded-xl bg-error-container p-3 text-sm text-on-error-container">{joinError}</p> : null}
            <button
              type="button"
              onClick={handleJoin}
              disabled={isPending}
              className="flex min-h-12 w-full flex-wrap items-center justify-center gap-2 rounded-xl bg-secondary-container px-4 py-2 font-bold text-on-secondary-container transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {isPending ? <Loader2 size={18} className="motion-safe:animate-spin" aria-hidden="true" /> : <Zap size={18} aria-hidden="true" />}
              {isPending ? "Joining…" : "Join challenge"}
              {challenge.dailyStake > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-xs">
                  <Coins size={13} aria-hidden="true" /> {challenge.dailyStake} per day
                </span>
              ) : null}
            </button>
          </footer>
        ) : null}
      </div>
      <PeopleListSheet
        open={membersOpen}
        title="Members"
        viewerId={userId}
        emptyMessage="Nobody has joined yet. Be the first."
        onClose={() => setMembersOpen(false)}
        load={() => getChallengeMembers(createClient(), challenge.id, userId)}
      />
      {inviteOpen && isCreator ? (
        <InviteSheet
          challengeId={challenge.id}
          challengeTitle={challenge.title}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
    </div>
  );
}
