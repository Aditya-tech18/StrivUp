"use client";
/**
 * BusinessQuestDetailClient — public detail page for a business-created Quest.
 *
 * Desktop-first two-column layout inside the (app) shell's sidebar. Every value
 * on the page comes from the Quest / business / participation records; nothing
 * about a specific business is hardcoded here, and anything a business has not
 * filled in is omitted rather than invented.
 *
 * Tasks whose proof_type is `order_verification` open the two-code order flow
 * (OrderVerificationModal) instead of a plain file upload.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Bookmark, Calendar, Check, CheckCircle2, ChevronRight,
  Clock, ExternalLink, ImageIcon, Loader2, MapPin, PlayCircle, Share2,
  ShieldCheck, Trophy, Upload, Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { BusinessQuestDetail, OrderPlatformLink } from "@/lib/data/quests";
import {
  getQuestLeaderboard, getVerificationsByTask,
  type LeaderboardRow, type OrderVerification,
} from "@/lib/data/questOrderVerification";
import OrderVerificationModal from "@/components/features/quest/OrderVerificationModal";
import VerificationStepper from "@/components/features/quest/VerificationStepper";
import {
  BusinessProfileCard, GoogleBusinessCard, LeaderboardPreviewCard,
  QuestProgressCard, RewardCard, formatAddress, type RewardSummary,
} from "@/components/features/quest/QuestSidebarCards";

interface Props {
  quest: BusinessQuestDetail;
  currentUserId: string | null;
  /** Display name of the signed-in user, for the verification prompt. */
  currentUserName: string | null;
}

type TabId = "overview" | "tasks" | "leaderboard" | "rules" | "about";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview",    label: "Overview" },
  { id: "tasks",       label: "Tasks" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "rules",       label: "Rules" },
  { id: "about",       label: "About Business" },
];

const PROOF_LABEL: Record<string, string> = {
  order_verification: "Order Verification",
  photo: "Photo Proof",
  video: "Video Proof",
  screenshot: "Screenshot",
  photo_text: "Photo + Description",
  qr: "QR Verification",
  bill_document: "Bill / Document",
  location: "Location Check-in",
  manual: "Manual Review",
  none: "No Proof Required",
};

/** Quest rules shown when the business has not written its own. */
const DEFAULT_RULES = [
  "User must join the Quest before attempting tasks.",
  "Only eligible orders count.",
  "User must generate the STRIVUP verification code through Upload Proof.",
  "The first verification code must be included in the eligible Zomato/Swiggy order description.",
  "Business must verify the order in STRIVUP.",
  "Business generates a second verification code after successful order verification.",
  "Business writes the second code on the bill.",
  "User enters the bill verification code in STRIVUP.",
  "Only successfully verified tasks count toward Quest progress.",
  "Duplicate, invalid or fraudulent verification attempts may be rejected.",
  "Only verified progress affects the leaderboard.",
  "Reward eligibility follows the Quest's published reward conditions.",
];

function formatDate(d: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatShort(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Whole days from now until the end date; negative once it has passed. */
function daysRemaining(end: string | null): number | null {
  if (!end) return null;
  const ms = new Date(end).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

function durationDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.round(ms / 86_400_000));
}

/**
 * Collapse the Quest's reward rows into the headline the card renders.
 * Reads rank_from/rank_to and value straight off the records — a Quest with no
 * rewards configured simply has no reward card.
 */
function summariseRewards(rewards: BusinessQuestDetail["rewards"]): RewardSummary | null {
  if (rewards.length === 0) return null;

  const primary =
    rewards.find((r) => r.is_leaderboard) ??
    [...rewards].sort((a, b) => (a.rank_from ?? 999) - (b.rank_from ?? 999))[0];

  const from = primary.rank_from;
  const to = primary.rank_to ?? primary.rank_from;
  const winners = from != null && to != null ? to - from + 1 : null;

  const subline =
    winners != null && winners > 1
      ? `For Top ${to} Users`
      : from != null
        ? `For Rank ${from}`
        : null;

  // Total pool is only stated when it can actually be computed from a numeric
  // per-winner value — a guessed pool would be a fabricated number.
  let totalPool: string | null = null;
  const numeric = primary.value?.match(/₹\s*([\d,]+(?:\.\d+)?)/);
  if (numeric && winners != null) {
    const per = Number(numeric[1].replace(/,/g, ""));
    if (Number.isFinite(per)) {
      totalPool = `₹${(per * winners).toLocaleString("en-IN")}`;
    }
  }

  return {
    headline: primary.value ? `${primary.value} ${primary.title}` : primary.title,
    subline,
    winners,
    perWinner: primary.value ?? null,
    totalPool,
  };
}

export default function BusinessQuestDetailClient({
  quest, currentUserId, currentUserName,
}: Props) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [tab, setTab] = useState<TabId>("overview");
  const [hasJoined, setHasJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const [verifications, setVerifications] = useState<Map<string, OrderVerification>>(new Map());
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set());
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [activeTask, setActiveTask] = useState<BusinessQuestDetail["tasks"][number] | null>(null);

  const tasks = quest.tasks;
  const totalTasks = tasks.length;
  const reward = useMemo(() => summariseRewards(quest.rewards), [quest.rewards]);
  const hasLeaderboard = quest.rewards.some((r) => r.is_leaderboard);
  const days = durationDays(quest.start_date, quest.end_date);
  const daysLeft = daysRemaining(quest.end_date);
  const isVerifiedBiz = quest.business_verification === "verified";
  const isEnded = quest.quest_status === "completed" || quest.quest_status === "expired";
  const businessName = quest.business?.business_name ?? quest.business_name ?? "Business";
  const userName = currentUserName?.split(" ")[0] ?? "there";

  const heroImage = quest.cover_url ?? quest.thumbnail_url;
  const locationLine =
    quest.location_name ??
    [quest.business?.city, quest.business?.state].filter(Boolean).join(", ") ??
    null;

  /* ── Load participation, verifications and leaderboard ──────────────── */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const lb = await getQuestLeaderboard(supabase, quest.id, 10);
      if (cancelled) return;
      setLeaderboard(lb);

      if (!currentUserId) { setLoading(false); return; }

      const [{ data: participant }, { data: submissions }, vMap] = await Promise.all([
        supabase.from("quest_participants").select("id")
          .eq("quest_id", quest.id).eq("user_id", currentUserId).maybeSingle(),
        supabase.from("quest_task_submissions").select("task_id, verification_status")
          .eq("quest_id", quest.id).eq("user_id", currentUserId),
        getVerificationsByTask(supabase, quest.id, currentUserId),
      ]);
      if (cancelled) return;

      setHasJoined(!!participant);
      setVerifications(vMap);
      setCompletedTaskIds(
        new Set(
          (submissions ?? [])
            .filter((s) => s.verification_status === "approved")
            .map((s) => s.task_id as string)
        )
      );
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [supabase, quest.id, currentUserId]);

  /* ── Join ───────────────────────────────────────────────────────────── */

  const handleJoin = useCallback(async () => {
    if (!currentUserId) {
      router.push(`/login?redirectTo=/quests/${quest.id}`);
      return;
    }
    setJoining(true);
    const { error } = await supabase.from("quest_participants").upsert(
      {
        quest_id: quest.id,
        user_id: currentUserId,
        verification_status: "pending",
        joined_at: new Date().toISOString(),
      },
      { onConflict: "quest_id,user_id", ignoreDuplicates: true }
    );
    setJoining(false);

    if (error) {
      setShareNote("Could not join the Quest. Please try again.");
      return;
    }
    setHasJoined(true);
    void supabase
      .from("quest_events")
      .insert({ quest_id: quest.id, user_id: currentUserId, event_type: "join" });
  }, [currentUserId, quest.id, router, supabase]);

  /* ── Share ──────────────────────────────────────────────────────────── */

  const handleShare = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: quest.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied");
      setTimeout(() => setShareNote(null), 2000);
    } catch {
      // A dismissed share sheet is a normal outcome, not an error worth showing.
    }
  }, [quest.title]);

  /* ── Proof entry point ──────────────────────────────────────────────── */

  const openProof = useCallback(
    (task: BusinessQuestDetail["tasks"][number]) => {
      if (!currentUserId) {
        router.push(`/login?redirectTo=/quests/${quest.id}`);
        return;
      }
      if (!hasJoined) { void handleJoin(); return; }

      // Order-verification tasks run the two-code flow; every other proof type
      // keeps using the existing upload page.
      if (task.proof_type === "order_verification") {
        setActiveTask(task);
      } else {
        router.push(`/quests/${quest.id}/tasks`);
      }
    },
    [currentUserId, hasJoined, handleJoin, quest.id, router]
  );

  const completedCount = completedTaskIds.size;

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-surface pb-24">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-surface-container-lowest/95 backdrop-blur border-b border-outline-variant pt-safe">
        <div className="max-w-[1400px] mx-auto px-5 lg:px-8 h-14 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="w-9 h-9 rounded-xl hover:bg-surface-container flex items-center justify-center shrink-0 transition-colors"
          >
            <ArrowLeft size={18} className="text-on-surface-variant" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-on-surface truncate">{quest.title}</p>
            <p className="text-[11px] text-on-surface-variant truncate">{businessName}</p>
          </div>
          {shareNote && (
            <span role="status" className="text-xs font-medium text-on-surface-variant shrink-0">
              {shareNote}
            </span>
          )}
          <button
            onClick={handleShare}
            className="h-9 px-3 rounded-xl border border-outline-variant hover:bg-surface-container-low text-xs font-semibold text-on-surface-variant hidden sm:flex items-center gap-1.5 transition-colors"
          >
            <Share2 size={14} /> Share
          </button>
          <button
            onClick={() => setSaved((s) => !s)}
            aria-pressed={saved}
            className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              saved
                ? "border-secondary-fixed-dim bg-secondary-fixed text-secondary"
                : "border-outline-variant hover:bg-surface-container-low text-on-surface-variant"
            }`}
          >
            <Bookmark size={14} className={saved ? "fill-blue-600 text-secondary" : ""} />
            <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
          </button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-5 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">

          {/* ── Main column ──────────────────────────────────────────── */}
          <div className="min-w-0 flex flex-col gap-6">

            {/* Hero */}
            <section className="relative rounded-2xl overflow-hidden border border-outline-variant bg-primary min-h-[260px] flex">
              {heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroImage}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
              )}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-r from-gray-950/95 via-gray-950/80 to-gray-950/35"
              />

              <div className="relative z-10 p-7 lg:p-9 flex flex-col justify-center gap-3 max-w-2xl">
                <div className="flex items-center gap-3">
                  {quest.business_logo && (
                    <span className="w-11 h-11 rounded-xl bg-surface-container-lowest/95 overflow-hidden shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={quest.business_logo}
                        alt={`${businessName} logo`}
                        className="w-full h-full object-cover"
                      />
                    </span>
                  )}
                  {quest.category && (
                    <span className="text-[11px] font-semibold text-white bg-surface-container-lowest/15 border border-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
                      {quest.category}
                    </span>
                  )}
                </div>

                <h1 className="text-[30px] lg:text-[38px] leading-[1.1] font-bold text-white tracking-tight uppercase">
                  {quest.title}
                </h1>

                {quest.description && (
                  <p className="text-[15px] text-on-surface-variant leading-relaxed line-clamp-2">
                    {quest.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-1">
                  {locationLine && (
                    <span className="flex items-center gap-1.5 text-sm text-on-surface-variant">
                      <MapPin size={14} className="shrink-0" /> {locationLine}
                    </span>
                  )}
                  {quest.start_date && quest.end_date && (
                    <span className="flex items-center gap-1.5 text-sm text-on-surface-variant">
                      <Calendar size={14} className="shrink-0" />
                      {formatDate(quest.start_date)} – {formatDate(quest.end_date)}
                    </span>
                  )}
                  {days != null && (
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-white bg-surface-container-lowest/15 border border-white/20 px-2.5 py-0.5 rounded-full">
                      <Clock size={13} /> {days} Days
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* At-a-glance stats — the three numbers that decide whether to join */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {reward && (
                <StatPill
                  icon={Trophy} tone="amber"
                  value={reward.perWinner ?? reward.headline}
                  label={reward.subline ?? "Reward"}
                />
              )}
              <StatPill
                icon={Users} tone="blue"
                value={quest.participant_count.toLocaleString("en-IN")}
                label="Participants"
              />
              <StatPill
                icon={Calendar} tone="violet"
                value={
                  quest.start_date && quest.end_date
                    ? `${formatShort(quest.start_date)} – ${formatShort(quest.end_date)}`
                    : days != null ? `${days} Days` : "—"
                }
                label={
                  daysLeft != null
                    ? daysLeft > 0 ? `Ends in ${daysLeft} days` : "Ended"
                    : "Duration"
                }
              />
            </section>

            {/* Progress — always visible, not buried in the right rail */}
            {totalTasks > 0 && (
              <Link
                href={hasJoined ? `/quests/${quest.id}/tasks` : `#tasks`}
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-5 py-4 flex items-center gap-4 hover:border-outline transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-on-surface">Your Progress</p>
                    <p className="text-sm font-bold text-on-surface shrink-0">
                      {completedCount}/{totalTasks} Tasks
                    </p>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-surface-container overflow-hidden">
                    <div
                      className="h-full rounded-full bg-secondary transition-[width] duration-500"
                      style={{ width: `${totalTasks ? (completedCount / totalTasks) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <ChevronRight size={18} className="text-on-surface-variant shrink-0" aria-hidden="true" />
              </Link>
            )}

            {/* Tabs */}
            <nav
              aria-label="Quest sections"
              className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-2 flex gap-1 overflow-x-auto"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={`shrink-0 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                    tab === t.id
                      ? "border-secondary text-secondary"
                      : "border-transparent text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {/* ── Overview ──────────────────────────────────────────── */}
            {tab === "overview" && (
              <>
                <AboutQuestCard
                  quest={quest}
                  days={days}
                  locationLine={locationLine}
                  reward={reward}
                />
                <TaskSection
                  tasks={tasks}
                  completedTaskIds={completedTaskIds}
                  verifications={verifications}
                  onProof={openProof}
                  loading={loading}
                  joined={hasJoined}
                  platforms={quest.order_platforms}
                />
                <VerificationStepper />
              </>
            )}

            {/* ── Tasks ─────────────────────────────────────────────── */}
            {tab === "tasks" && (
              <>
                <TaskSection
                  tasks={tasks}
                  completedTaskIds={completedTaskIds}
                  verifications={verifications}
                  onProof={openProof}
                  loading={loading}
                  joined={hasJoined}
                  platforms={quest.order_platforms}
                />
                <VerificationStepper />
              </>
            )}

            {/* ── Leaderboard ───────────────────────────────────────── */}
            {tab === "leaderboard" && (
              <LeaderboardPanel
                rows={leaderboard}
                totalTasks={totalTasks}
                enabled={hasLeaderboard}
              />
            )}

            {/* ── Rules ─────────────────────────────────────────────── */}
            {tab === "rules" && (
              <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6">
                <h2 className="text-[17px] font-bold text-on-surface">Quest Rules</h2>
                {quest.eligibility && (
                  <>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mt-5">
                      Eligibility
                    </h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed mt-1.5 whitespace-pre-line">
                      {quest.eligibility}
                    </p>
                  </>
                )}
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mt-5">
                  Rules
                </h3>
                {quest.rules ? (
                  <p className="text-sm text-on-surface-variant leading-relaxed mt-1.5 whitespace-pre-line">
                    {quest.rules}
                  </p>
                ) : (
                  <ul className="mt-2.5 flex flex-col gap-2.5">
                    {DEFAULT_RULES.map((rule) => (
                      <li key={rule} className="flex gap-2.5 items-start">
                        <Check size={15} className="text-secondary shrink-0 mt-0.5" />
                        <span className="text-sm text-on-surface-variant leading-relaxed">{rule}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* ── About business ────────────────────────────────────── */}
            {tab === "about" && (
              <AboutBusinessPanel
                quest={quest}
                businessName={businessName}
                verified={isVerifiedBiz}
              />
            )}
          </div>

          {/* ── Right rail ───────────────────────────────────────────── */}
          <aside className="flex flex-col gap-5 lg:sticky lg:top-20">
            <BusinessProfileCard
              business={quest.business}
              fallbackName={businessName}
              verified={isVerifiedBiz}
              questId={quest.id}
            />
            <RewardCard
              reward={reward}
              joined={hasJoined}
              onJoin={handleJoin}
              joining={joining}
              ended={isEnded}
            />
            <QuestProgressCard
              completed={completedCount}
              total={totalTasks}
              joined={hasJoined}
            />
            <LeaderboardPreviewCard
              rows={leaderboard}
              totalTasks={totalTasks}
              questId={quest.id}
              enabled={hasLeaderboard}
            />
            <GoogleBusinessCard
              business={quest.business}
              fallbackName={businessName}
            />
            <div className="flex items-center gap-2 px-1">
              <Users size={14} className="text-on-surface-variant shrink-0" />
              <p className="text-xs text-on-surface-variant">
                {quest.participant_count.toLocaleString("en-IN")} participants
              </p>
            </div>
          </aside>
        </div>
      </div>

      {/* ── Mobile join bar ──────────────────────────────────────────── */}
      {!loading && !hasJoined && !isEnded && (
        <div className="lg:hidden fixed above-bottom-nav left-0 right-0 z-40 bg-surface-container-lowest border-t border-outline-variant px-5 py-3">
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full h-12 rounded-xl bg-secondary hover:opacity-90 disabled:opacity-50 text-white font-bold text-[15px] transition-colors"
          >
            {joining ? "Joining…" : "Join Quest"}
          </button>
        </div>
      )}

      {/* ── Verification modal ───────────────────────────────────────── */}
      {activeTask && (
        <OrderVerificationModal
          key={activeTask.id}
          open
          onClose={() => setActiveTask(null)}
          supabase={supabase}
          questId={quest.id}
          taskId={activeTask.id}
          taskTitle={activeTask.title}
          userName={userName}
          businessName={businessName}
          existing={verifications.get(activeTask.id) ?? null}
          onIssued={(row) =>
            setVerifications((m) => new Map(m).set(row.task_id, row))
          }
          onCompleted={(row) => {
            setVerifications((m) => new Map(m).set(row.task_id, row));
            setCompletedTaskIds((s) => new Set(s).add(row.task_id));
            void getQuestLeaderboard(supabase, quest.id, 10).then(setLeaderboard);
          }}
        />
      )}
    </div>
  );
}

/* ── Stat pill ─────────────────────────────────────────────────────────── */

const PILL_TONE = {
  amber:  { wrap: "bg-warning-container border-warning-outline",   icon: "text-warning" },
  blue:   { wrap: "bg-secondary-fixed border-secondary-fixed-dim",     icon: "text-secondary" },
  violet: { wrap: "bg-violet-50 border-violet-100", icon: "text-violet-600" },
} as const;

function StatPill({
  icon: Icon, value, label, tone,
}: {
  icon: typeof Trophy;
  value: string;
  label: string;
  tone: keyof typeof PILL_TONE;
}) {
  const t = PILL_TONE[tone];
  return (
    <div className={`rounded-2xl border px-4 py-3.5 flex items-center gap-3 ${t.wrap}`}>
      <Icon size={20} className={`${t.icon} shrink-0`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-on-surface leading-tight truncate">{value}</p>
        <p className="text-[11px] text-on-surface-variant truncate">{label}</p>
      </div>
    </div>
  );
}

/* ── About this Quest ──────────────────────────────────────────────────── */

function AboutQuestCard({
  quest, days, locationLine, reward,
}: {
  quest: BusinessQuestDetail;
  days: number | null;
  locationLine: string | null;
  reward: RewardSummary | null;
}) {
  const gallery = quest.tasks
    .map((t) => ({ url: t.image_url, label: t.title }))
    .filter((g): g is { url: string; label: string } => !!g.url)
    .slice(0, 4);

  const facts = [
    quest.category ? { k: "Category", v: quest.category } : null,
    locationLine ? { k: "Location", v: locationLine } : null,
    days != null ? { k: "Duration", v: `${days} Days` } : null,
    reward
      ? {
          k: "Reward",
          v: reward.subline
            ? `${reward.subline.replace(/^For /, "")} — ${reward.perWinner ?? reward.headline}`
            : reward.headline,
        }
      : null,
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6">
      <h2 className="text-[17px] font-bold text-on-surface">About This Quest</h2>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-6 mt-3">
        <div className="min-w-0">
          {quest.description && (
            <p className="text-sm text-on-surface-variant leading-relaxed">{quest.description}</p>
          )}

          {facts.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 mt-5">
              {facts.map((f) => (
                <div key={f.k}>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    {f.k}
                  </dt>
                  <dd className="text-sm font-semibold text-on-surface mt-1">{f.v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {gallery.length > 0 && (
          <ul className="grid grid-cols-4 lg:grid-cols-2 gap-2 lg:w-[212px] shrink-0">
            {gallery.map((g) => (
              <li
                key={g.label}
                className="aspect-square rounded-xl overflow-hidden border border-outline-variant bg-surface-container-low"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt={g.label} className="w-full h-full object-cover" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ── Task list ─────────────────────────────────────────────────────────── */

function TaskSection({
  tasks, completedTaskIds, verifications, onProof, loading, joined, platforms,
}: {
  tasks: BusinessQuestDetail["tasks"];
  completedTaskIds: Set<string>;
  verifications: Map<string, OrderVerification>;
  onProof: (t: BusinessQuestDetail["tasks"][number]) => void;
  loading: boolean;
  joined: boolean;
  platforms: OrderPlatformLink[] | null;
}) {
  if (tasks.length === 0) return null;

  return (
    <section id="tasks" className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 scroll-mt-20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold text-on-surface">
            Tasks ({tasks.length})
          </h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Complete the required tasks to finish the Quest. Every task must be verified.
          </p>
        </div>
        <a
          href="#how-verification-works"
          className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary-fixed border border-secondary-fixed-dim text-xs font-semibold text-secondary hover:bg-secondary-fixed transition-colors"
        >
          <PlayCircle size={13} /> How It Works?
        </a>
      </div>

      <ul className="flex flex-col gap-3 mt-5">
        {tasks.map((task, i) => (
          <TaskCard
            key={task.id}
            task={task}
            index={i + 1}
            completed={completedTaskIds.has(task.id)}
            verification={verifications.get(task.id) ?? null}
            onProof={() => onProof(task)}
            loading={loading}
            joined={joined}
            platforms={platforms}
          />
        ))}
      </ul>
    </section>
  );
}

function TaskCard({
  task, index, completed, verification, onProof, loading, joined, platforms,
}: {
  task: BusinessQuestDetail["tasks"][number];
  index: number;
  completed: boolean;
  verification: OrderVerification | null;
  onProof: () => void;
  loading: boolean;
  joined: boolean;
  platforms: OrderPlatformLink[] | null;
}) {
  const proofLabel = PROOF_LABEL[task.proof_type] ?? task.proof_type;
  // Only order_verification tasks are fulfilled through an ordering platform.
  const showPlatforms =
    task.proof_type === "order_verification" && (platforms?.length ?? 0) > 0;

  // The status line reflects where this task actually stands, so a user who
  // walks away mid-flow can see what is waiting on whom.
  const state = completed
    ? { label: "Verified Order", cls: "text-on-success-container bg-success-container border-success-outline", Icon: CheckCircle2 }
    : verification?.status === "order_verified"
      ? { label: "Enter bill code", cls: "text-secondary bg-secondary-fixed border-secondary-fixed-dim", Icon: Upload }
      : verification?.status === "code_issued"
        ? { label: "Awaiting business", cls: "text-on-warning-container bg-warning-container border-warning-outline", Icon: Clock }
        : null;

  return (
    <li className="group rounded-2xl border border-outline-variant hover:border-outline bg-surface-container-lowest transition-colors">
      <div className="flex items-center gap-4 p-4">

        {/* Number */}
        <span className="w-7 h-7 rounded-full bg-surface-container text-on-surface-variant text-xs font-bold flex items-center justify-center shrink-0">
          {index}
        </span>

        {/* Thumbnail */}
        <div className="w-[72px] h-[72px] rounded-xl overflow-hidden bg-surface-container-low border border-outline-variant shrink-0 flex items-center justify-center">
          {task.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={task.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={20} className="text-on-surface-variant" aria-hidden="true" />
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-bold text-on-surface truncate">{task.title}</h3>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                task.is_required
                  ? "text-on-error-container bg-error-container border-error-outline"
                  : "text-on-surface-variant bg-surface-container-low border-outline-variant"
              }`}
            >
              {task.is_required ? "Required" : "Optional"}
            </span>
          </div>

          {task.description && (
            <p className="text-sm text-on-surface-variant leading-relaxed mt-1 line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className="text-[11px] font-medium text-on-surface-variant">
              Proof Type: <span className="text-on-surface-variant">{proofLabel}</span>
            </span>
            {showPlatforms && platforms!.map((p) => (
              p.url ? (
                <a
                  key={p.platform}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-outline-variant bg-surface-container-low text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  {p.label} <ExternalLink size={9} />
                </a>
              ) : (
                <span
                  key={p.platform}
                  className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border border-outline-variant bg-surface-container-low text-on-surface-variant"
                >
                  {p.label}
                </span>
              )
            ))}
            {state && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${state.cls}`}
              >
                <state.Icon size={11} /> {state.label}
              </span>
            )}
          </div>
        </div>

        {/* Action */}
        <div className="flex items-center gap-2 shrink-0">
          {completed ? (
            <span className="h-9 px-4 rounded-xl bg-success-container border border-success-outline text-on-success-container text-xs font-bold flex items-center gap-1.5">
              <Check size={14} /> Completed
            </span>
          ) : (
            <button
              onClick={onProof}
              disabled={loading}
              className="h-9 px-4 rounded-xl bg-secondary hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              {loading
                ? <Loader2 size={14} className="animate-spin" />
                : <Upload size={14} />}
              {joined ? "Upload Proof" : "Join to Start"}
            </button>
          )}
          <ChevronRight size={18} className="text-on-surface-variant hidden sm:block" aria-hidden="true" />
        </div>
      </div>
    </li>
  );
}

/* ── Leaderboard panel ─────────────────────────────────────────────────── */

function LeaderboardPanel({
  rows, totalTasks, enabled,
}: {
  rows: LeaderboardRow[];
  totalTasks: number;
  enabled: boolean;
}) {
  return (
    <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6">
      <h2 className="text-[17px] font-bold text-on-surface">Leaderboard</h2>
      <p className="text-sm text-on-surface-variant mt-0.5">
        {enabled
          ? "Ranked on verified task completions only."
          : "This Quest does not run a leaderboard."}
      </p>

      {enabled && (
        rows.length === 0 ? (
          <p className="text-sm text-on-surface-variant mt-6 text-center py-10 border border-dashed border-outline-variant rounded-xl">
            No verified activity yet — the leaderboard fills in as participants
            complete tasks.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-gray-100">
            {rows.map((r) => {
              const name = r.full_name ?? r.username ?? "Participant";
              return (
                <li key={r.user_id} className="flex items-center gap-4 py-3">
                  <span className="w-7 text-sm font-bold text-on-surface-variant text-center shrink-0">
                    {r.rank}
                  </span>
                  <div className="w-9 h-9 rounded-full bg-secondary-fixed overflow-hidden shrink-0 flex items-center justify-center">
                    {r.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-secondary">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{name}</p>
                    <p className="text-xs text-on-surface-variant">
                      {r.tasks_completed}/{totalTasks} tasks verified
                    </p>
                  </div>
                  <span className="text-sm font-bold text-on-surface shrink-0">
                    {r.points} pts
                  </span>
                </li>
              );
            })}
          </ol>
        )
      )}
    </section>
  );
}

/* ── About business panel ──────────────────────────────────────────────── */

function AboutBusinessPanel({
  quest, businessName, verified,
}: {
  quest: BusinessQuestDetail;
  businessName: string;
  verified: boolean;
}) {
  const b = quest.business;
  const address = formatAddress(b);
  const phones = [b?.business_phone, b?.business_phone_alt].filter(Boolean);

  return (
    <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-surface-container-low border border-outline-variant overflow-hidden shrink-0 flex items-center justify-center">
          {b?.logo_url ?? quest.business_logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={(b?.logo_url ?? quest.business_logo)!}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xl font-bold text-on-surface-variant">{businessName.charAt(0)}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[19px] font-bold text-on-surface truncate">{businessName}</h2>
            {verified && (
              <ShieldCheck size={16} className="text-secondary shrink-0" aria-label="Verified by STRIVUP" />
            )}
          </div>
          {b?.category && <p className="text-sm text-on-surface-variant mt-0.5">{b.category}</p>}
        </div>
      </div>

      {b?.description && (
        <p className="text-sm text-on-surface-variant leading-relaxed mt-5">{b.description}</p>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mt-5">
        {address.length > 0 && (
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Address
            </dt>
            <dd className="text-sm text-on-surface-variant leading-relaxed mt-1">
              {address.map((line) => <span key={line} className="block">{line}</span>)}
            </dd>
          </div>
        )}
        {phones.length > 0 && (
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Phone
            </dt>
            <dd className="text-sm text-on-surface-variant mt-1">{phones.join(" / ")}</dd>
          </div>
        )}
        {b?.website && (
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Website
            </dt>
            <dd className="text-sm mt-1">
              <a
                href={b.website.startsWith("http") ? b.website : `https://${b.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-secondary hover:underline break-all"
              >
                {b.website.replace(/^https?:\/\//, "")}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {!b && (
        <p className="text-sm text-on-surface-variant mt-5">
          This Quest is not linked to a verified business profile yet.
        </p>
      )}

      {b?.id && (
        <Link
          href={`/business/${b.id}`}
          className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-secondary hover:text-secondary"
        >
          View Business Profile →
        </Link>
      )}
    </section>
  );
}
