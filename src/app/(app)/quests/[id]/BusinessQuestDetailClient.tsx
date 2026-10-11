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

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Bookmark, Calendar, Check, CheckCircle2, ChevronRight,
  Clock, ExternalLink, Heart, ImageIcon, Loader2, PlayCircle, Share2,
  ChevronDown, Lock, ShieldCheck, Trophy, Upload, Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCount } from "@/lib/formatCount";
import type { BusinessQuestDetail, OrderPlatformLink } from "@/lib/data/quests";
import {
  getQuestLeaderboard, getVerificationsByTask,
  type LeaderboardRow, type OrderVerification,
} from "@/lib/data/questOrderVerification";
import OrderVerificationModal from "@/components/features/quest/OrderVerificationModal";
import VerificationStepper from "@/components/features/quest/VerificationStepper";
import {
  BusinessProfileCard, GoogleBusinessCard, LeaderboardPreviewCard,
  formatAddress,
} from "@/components/features/quest/QuestSidebarCards";

interface Props {
  quest: BusinessQuestDetail;
  currentUserId: string | null;
  /** Display name of the signed-in user, for the verification prompt. */
  currentUserName: string | null;
}

type TabId = "overview" | "tasks" | "rewards" | "leaderboard" | "rules" | "about";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview",    label: "Overview" },
  { id: "tasks",       label: "Tasks" },
  { id: "rewards",     label: "Rewards" },
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

  // Favouriting follows the BUSINESS, not this quest: it opts the viewer into a
  // notification whenever that business publishes anything new.
  const [favorited, setFavorited] = useState(false);
  const [favoriting, setFavoriting] = useState(false);

  // Kept in state rather than read straight off the prop so the realtime
  // subscription below can move it without a page reload.
  const [participantCount, setParticipantCount] = useState(quest.participant_count);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const [verifications, setVerifications] = useState<Map<string, OrderVerification>>(new Map());
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set());
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [activeTask, setActiveTask] = useState<BusinessQuestDetail["tasks"][number] | null>(null);

  const tasks = quest.tasks;
  const totalTasks = tasks.length;
  const hasLeaderboard = quest.rewards.some((r) => r.is_leaderboard);
  const days = durationDays(quest.start_date, quest.end_date);
  const daysLeft = daysRemaining(quest.end_date);
  const isVerifiedBiz = quest.business_verification === "verified";
  const isEnded = quest.quest_status === "completed" || quest.quest_status === "expired";

  // "Live" means you can still join right now: published/active, not ended,
  // and the deadline has not passed. A paused or draft quest is not live even
  // if its dates are still open.
  const isLive =
    !isEnded &&
    (quest.quest_status === "active" || quest.quest_status === "published") &&
    (daysLeft == null || daysLeft > 0);
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

  // Reflect the stored state on load, so the heart is not empty on a page the
  // viewer has already favourited.
  useEffect(() => {
    if (!currentUserId || !quest.business_id) return;
    let cancelled = false;
    (async () => {
      const { isBusinessFavorited } = await import("@/lib/data/businessFavorites");
      const fav = await isBusinessFavorited(supabase, currentUserId, quest.business_id!);
      if (!cancelled) setFavorited(fav);
    })();
    return () => { cancelled = true; };
  }, [currentUserId, quest.business_id, supabase]);

  // The in-card join button is the primary one; the sticky bar is a fallback
  // that only appears once that button has scrolled out of view, so the two
  // are never on screen together.
  const joinRef = useRef<HTMLDivElement | null>(null);
  const [showStickyJoin, setShowStickyJoin] = useState(false);

  useEffect(() => {
    const el = joinRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyJoin(!entry.isIntersecting),
      { rootMargin: "-80px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tab]);

  // Live participant count. The trigger on quest_participants keeps
  // quests.participant_count true, so listening to that one row is cheaper and
  // simpler than recounting on every join.
  useEffect(() => {
    const channel = supabase
      .channel(`quest-participants-${quest.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quests", filter: `id=eq.${quest.id}` },
        (payload) => {
          const next = (payload.new as { participant_count?: number } | null)?.participant_count;
          if (typeof next === "number") setParticipantCount(next);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [quest.id, supabase]);

  const toggleFavorite = useCallback(async () => {
    if (!currentUserId || !quest.business_id) return;

    // Flip immediately so the tap feels instant, and roll back if the write
    // fails — a heart that lies is worse than one that is slow.
    const next = !favorited;
    setFavorited(next);
    setFavoriting(true);
    try {
      const { favoriteBusiness, unfavoriteBusiness } = await import(
        "@/lib/data/businessFavorites"
      );
      const { error } = next
        ? await favoriteBusiness(supabase, currentUserId, quest.business_id)
        : await unfavoriteBusiness(supabase, currentUserId, quest.business_id);
      if (error) setFavorited(!next);
    } catch {
      setFavorited(!next);
    } finally {
      setFavoriting(false);
    }
  }, [currentUserId, quest.business_id, favorited, supabase]);

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
    <div className="min-h-screen bg-[#F7F8FA] pb-24 pb-bottom-nav">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 pt-safe">
        <div className="max-w-[1400px] mx-auto px-5 lg:px-8 h-14 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center shrink-0 transition-colors"
          >
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{quest.title}</p>
            <p className="text-[11px] text-gray-400 truncate">{businessName}</p>
          </div>
          {shareNote && (
            <span role="status" className="text-xs font-medium text-gray-500 shrink-0">
              {shareNote}
            </span>
          )}
          <button
            onClick={toggleFavorite}
            disabled={favoriting || !currentUserId || !quest.business_id}
            aria-pressed={favorited}
            aria-label={favorited ? "Unfollow this business" : "Follow this business for new quests"}
            title={
              !currentUserId
                ? "Sign in to follow this business"
                : favorited
                  ? `You'll be notified about new quests from ${businessName}`
                  : `Get notified when ${businessName} posts a new quest`
            }
            className={`h-9 w-9 rounded-xl border flex items-center justify-center transition-colors disabled:opacity-50 ${
              favorited
                ? "border-rose-200 bg-rose-50 text-rose-600"
                : "border-gray-200 hover:bg-gray-50 text-gray-700"
            }`}
          >
            <Heart size={15} className={favorited ? "fill-rose-500 text-rose-500" : ""} />
          </button>
          <button
            onClick={handleShare}
            className="h-9 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700 hidden sm:flex items-center gap-1.5 transition-colors"
          >
            <Share2 size={14} /> Share
          </button>
          <button
            onClick={() => setSaved((s) => !s)}
            aria-pressed={saved}
            className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              saved
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-gray-200 hover:bg-gray-50 text-gray-700"
            }`}
          >
            <Bookmark size={14} className={saved ? "fill-blue-600 text-blue-600" : ""} />
            <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
          </button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-5 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">

          {/* ── Main column ──────────────────────────────────────────── */}
          <div className="min-w-0 flex flex-col gap-6">

            {/* Hero */}
            <section className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-900 min-h-[260px] flex">
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
                    <span className="w-11 h-11 rounded-xl bg-white/95 overflow-hidden shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={quest.business_logo}
                        alt={`${businessName} logo`}
                        className="w-full h-full object-cover"
                      />
                    </span>
                  )}
                  {quest.category && (
                    <span className="text-[11px] font-semibold text-white bg-white/15 border border-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
                      {quest.category}
                    </span>
                  )}
                </div>

                <h1 className="text-[30px] lg:text-[38px] leading-[1.1] font-bold text-white tracking-tight uppercase">
                  {quest.title}
                </h1>

                {quest.description && (
                  <p className="text-[15px] text-gray-200 leading-relaxed line-clamp-2">
                    {quest.description}
                  </p>
                )}

                {/* Location, dates and duration deliberately left out of the
                    hero — they already appear in the details list further down,
                    and repeating them here crowded the title. */}
              </div>
            </section>

            {/* Two facts decide whether someone joins: how many people are
                already in, and how long is left. Everything else was noise. */}
            <section className="bg-white rounded-2xl border border-gray-200 px-4 sm:px-5 py-3.5 flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-2">
              {isLive && (
                <span className="flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-1">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">
                    Live
                  </span>
                </span>
              )}

              <span className="flex items-center gap-2">
                <Users size={16} className="text-blue-600 shrink-0" />
                <span className="text-sm text-gray-700">
                  <strong className="text-gray-900 font-bold tabular-nums">
                    {formatCount(participantCount)}
                  </strong>{" "}
                  {participantCount === 1 ? "participant" : "participants"}
                </span>
              </span>

              {quest.end_date && (
                <span className="flex items-center gap-2">
                  <Calendar size={16} className="text-violet-600 shrink-0" />
                  <span className="text-sm text-gray-700">
                    {daysLeft != null && daysLeft <= 0 ? (
                      <strong className="text-gray-500 font-semibold">Closed</strong>
                    ) : (
                      <>
                        Register by{" "}
                        <strong className="text-gray-900 font-bold">
                          {formatShort(quest.end_date)}
                        </strong>
                        {daysLeft != null && (
                          <span className={daysLeft <= 3 ? "text-rose-600 font-semibold" : "text-gray-500"}>
                            {" "}· {daysLeft === 1 ? "1 day left" : `${daysLeft} days left`}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </span>
              )}
            </section>

            {/* Progress — always visible, not buried in the right rail */}
            {totalTasks > 0 && (
              <Link
                href={hasJoined ? `/quests/${quest.id}/tasks` : `#tasks`}
                className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-gray-900">Your Progress</p>
                    <p className="text-sm font-bold text-gray-900 shrink-0">
                      {completedCount}/{totalTasks} Tasks
                    </p>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-[width] duration-500"
                      style={{ width: `${totalTasks ? (completedCount / totalTasks) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300 shrink-0" aria-hidden="true" />
              </Link>
            )}

            {/* Tabs */}
            <nav
              aria-label="Quest sections"
              className="bg-white rounded-2xl border border-gray-200 px-2 flex gap-1 overflow-x-auto"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={`shrink-0 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                    tab === t.id
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-900"
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
                  joined={hasJoined}
                  onJoin={handleJoin}
                  joining={joining}
                  ended={isEnded}
                  joinRef={joinRef}
                />
                <TaskSection
                  tasks={tasks}
                  completedTaskIds={completedTaskIds}
                  verifications={verifications}
                  onProof={openProof}
                  loading={loading}
                  joined={hasJoined}
                  platforms={quest.order_platforms}
                  isLive={isLive}
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
                  isLive={isLive}
                />
                <VerificationStepper />
              </>
            )}

            {tab === "rewards" && <RewardsPanel rewards={quest.rewards} />}

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
              <section className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-[17px] font-bold text-gray-900">Quest Rules</h2>
                {quest.eligibility && (
                  <>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-5">
                      Eligibility
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed mt-1.5 whitespace-pre-line">
                      {quest.eligibility}
                    </p>
                  </>
                )}
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-5">
                  Rules
                </h3>
                {quest.rules ? (
                  <p className="text-sm text-gray-600 leading-relaxed mt-1.5 whitespace-pre-line">
                    {quest.rules}
                  </p>
                ) : (
                  <ul className="mt-2.5 flex flex-col gap-2.5">
                    {DEFAULT_RULES.map((rule) => (
                      <li key={rule} className="flex gap-2.5 items-start">
                        <Check size={15} className="text-blue-600 shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-600 leading-relaxed">{rule}</span>
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
              <Users size={14} className="text-gray-400 shrink-0" />
              <p className="text-xs text-gray-400">
                {quest.participant_count.toLocaleString("en-IN")} participants
              </p>
            </div>
          </aside>
        </div>
      </div>

      {/* ── Mobile join bar ──────────────────────────────────────────── */}
      {!loading && !hasJoined && !isEnded && (
        <div className="lg:hidden fixed above-bottom-nav left-0 right-0 z-40 bg-white border-t border-gray-200 px-5 py-3">
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-[15px] transition-colors"
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

      {/* Sticky join bar. Appears only once the in-card button has scrolled
          past, so the action is always reachable without ever duplicating it
          on screen. Hidden entirely once joined or ended — a bar that says
          nothing actionable is just a strip of wasted screen. */}
      {showStickyJoin && !hasJoined && !isEnded && (
        <div className="fixed above-bottom-nav z-40 border-t border-gray-200 bg-white/95 backdrop-blur-sm pb-safe">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-5 lg:px-8 py-3 flex items-center gap-4">
            <div className="min-w-0 flex-1 hidden sm:block">
              <p className="text-sm font-bold text-gray-900 truncate">{quest.title}</p>
              <p className="text-xs text-gray-500">
                {formatCount(participantCount)} joined
                {daysLeft != null && daysLeft > 0 && ` · ${daysLeft} days left`}
              </p>
            </div>
            <button
              onClick={handleJoin}
              disabled={joining}
              className="h-11 px-8 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm transition-colors w-full sm:w-auto"
            >
              {joining ? "Joining…" : "Join Quest"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat pill ─────────────────────────────────────────────────────────── */

/* ── About this Quest ──────────────────────────────────────────────────── */

function AboutQuestCard({
  quest, days, locationLine, joined, onJoin, joining, ended, joinRef,
}: {
  quest: BusinessQuestDetail;
  days: number | null;
  locationLine: string | null;
  joined: boolean;
  onJoin: () => void;
  joining: boolean;
  ended: boolean;
  /** Watched by the page so the sticky bar appears once this scrolls away. */
  joinRef: React.RefObject<HTMLDivElement | null>;
}) {
  const gallery = quest.tasks
    .map((t) => ({ url: t.image_url, label: t.title }))
    .filter((g): g is { url: string; label: string } => !!g.url)
    .slice(0, 4);

  const facts = [
    quest.category ? { k: "Category", v: quest.category } : null,
    locationLine ? { k: "Location", v: locationLine } : null,
    days != null ? { k: "Duration", v: `${days} Days` } : null,
    // Reward moved to its own tab; the dates are what people actually ask for
    // when deciding whether they still have time.
    quest.start_date && quest.end_date
      ? { k: "Timeline", v: `${formatShort(quest.start_date)} – ${formatShort(quest.end_date)}` }
      : null,
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6">
      {/* The action sits on the heading row, top-right, so it is the first
          thing in reach rather than something to scroll past the facts for. */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-[17px] font-bold text-gray-900">About This Quest</h2>

        <div ref={joinRef} className="shrink-0 w-full sm:w-auto">
          {ended ? (
            <button
              disabled
              className="h-10 px-6 rounded-xl bg-gray-100 text-gray-400 font-bold text-sm cursor-not-allowed w-full sm:w-auto"
            >
              Quest Ended
            </button>
          ) : joined ? (
            <div className="inline-flex h-10 px-5 rounded-xl bg-green-50 border border-green-200 text-green-700 font-bold text-sm items-center justify-center gap-2 w-full sm:w-auto">
              <ShieldCheck size={16} /> You&apos;ve Joined
            </div>
          ) : (
            <button
              onClick={onJoin}
              disabled={joining}
              className="h-10 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm transition-colors w-full sm:w-auto"
            >
              {joining ? "Joining…" : "Join Quest"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-6 mt-3">
        <div className="min-w-0">
          {quest.description && (
            <p className="text-sm text-gray-600 leading-relaxed">{quest.description}</p>
          )}

          {facts.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 mt-5">
              {facts.map((f) => (
                <div key={f.k}>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    {f.k}
                  </dt>
                  <dd className="text-sm font-semibold text-gray-900 mt-1">{f.v}</dd>
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
                className="aspect-square rounded-xl overflow-hidden border border-gray-100 bg-gray-50"
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
  tasks, completedTaskIds, verifications, onProof, loading, joined, platforms, isLive,
}: {
  tasks: BusinessQuestDetail["tasks"];
  completedTaskIds: Set<string>;
  verifications: Map<string, OrderVerification>;
  onProof: (t: BusinessQuestDetail["tasks"][number]) => void;
  loading: boolean;
  joined: boolean;
  platforms: OrderPlatformLink[] | null;
  isLive: boolean;
}) {
  if (tasks.length === 0) return null;

  return (
    <section id="tasks" className="bg-white rounded-2xl border border-gray-200 p-6 scroll-mt-20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold text-gray-900">
            Tasks ({tasks.length})
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Complete the required tasks to finish the Quest. Every task must be verified.
          </p>
        </div>
        <a
          href="#how-verification-works"
          className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-blue-50 border border-blue-100 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
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
            isLive={isLive}
          />
        ))}
      </ul>
    </section>
  );
}

function TaskCard({
  task, index, completed, verification, onProof, loading, joined, platforms, isLive,
}: {
  task: BusinessQuestDetail["tasks"][number];
  index: number;
  completed: boolean;
  verification: OrderVerification | null;
  onProof: () => void;
  loading: boolean;
  joined: boolean;
  platforms: OrderPlatformLink[] | null;
  /** The quest is open for submissions right now. */
  isLive: boolean;
}) {
  const [open, setOpen] = useState(false);

  const proofLabel = PROOF_LABEL[task.proof_type] ?? task.proof_type;
  const showPlatforms =
    task.proof_type === "order_verification" && (platforms?.length ?? 0) > 0;

  const state = completed
    ? { label: "Verified Order", cls: "text-green-700 bg-green-50 border-green-200", Icon: CheckCircle2 }
    : verification?.status === "order_verified"
      ? { label: "Enter bill code", cls: "text-blue-700 bg-blue-50 border-blue-200", Icon: Upload }
      : verification?.status === "code_issued"
        ? { label: "Awaiting business", cls: "text-amber-700 bg-amber-50 border-amber-200", Icon: Clock }
        : null;

  // Why the upload button is unavailable, checked in the order a user hits them.
  // Tasks are deliberately NOT sequential: someone may be able to do task 3
  // today and task 1 tomorrow, and forcing an order would just block them.
  const blockedReason = !joined
    ? "Join the Quest to start"
    : !isLive
      ? "This Quest is closed"
      : null;

  return (
    <li className="rounded-2xl border border-gray-200 bg-white transition-colors hover:border-gray-300">
      {/* Below sm the row would be number + thumb + text + two buttons on a
          375px screen, which overflows. Actions drop to their own full-width
          row instead of being squeezed. */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">

        <span
          className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
            completed ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
          }`}
        >
          {completed ? <Check size={14} strokeWidth={3} /> : index}
        </span>

        <div
          className="w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-xl overflow-hidden bg-gray-50 border border-gray-100 shrink-0 flex items-center justify-center"
        >
          {task.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={task.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={20} className="text-gray-300" aria-hidden="true" />
          )}
        </div>

        {/* Title plus one status line. Every other chip moved into View Details
            so the row stays scannable. */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-bold text-gray-900 truncate">{task.title}</h3>
          {task.description && (
            <p className="text-sm text-gray-500 leading-relaxed mt-0.5 line-clamp-1">
              {task.description}
            </p>
          )}
          {(state || blockedReason) && (
            <div className="mt-1.5">
              {state ? (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${state.cls}`}
                >
                  <state.Icon size={11} /> {state.label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                  <Lock size={10} /> {blockedReason}
                </span>
              )}
            </div>
          )}
        </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex-1 sm:flex-none justify-center h-9 px-3.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-colors"
          >
            View Details
            <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {completed ? (
            <span className="flex-1 sm:flex-none justify-center h-9 px-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-xs font-bold flex items-center gap-1.5">
              <Check size={14} /> Completed
            </span>
          ) : (
            <button
              onClick={onProof}
              disabled={loading || Boolean(blockedReason)}
              title={blockedReason ?? undefined}
              className="flex-1 sm:flex-none justify-center h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : blockedReason ? (
                <Lock size={14} />
              ) : (
                <Upload size={14} />
              )}
              Upload Proof
            </button>
          )}
        </div>
      </div>

      {/* Everything needed to actually do the task. */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/60 rounded-b-2xl space-y-3">
          {task.description && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                What to do
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{task.description}</p>
            </div>
          )}

          {task.instructions && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                Instructions
              </p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {task.instructions}
              </p>
            </div>
          )}

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">
              Requirements
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  task.is_required
                    ? "text-red-600 bg-red-50 border-red-100"
                    : "text-gray-500 bg-gray-50 border-gray-200"
                }`}
              >
                {task.is_required ? "Required" : "Optional"}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-600">
                {proofLabel}
              </span>
            </div>
          </div>

          {showPlatforms && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">
                Where to order
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {platforms!.map((pl) =>
                  pl.url ? (
                    <a
                      key={pl.platform}
                      href={pl.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {pl.label} <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span
                      key={pl.platform}
                      className="inline-flex items-center h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-500"
                    >
                      {pl.label}
                    </span>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/* ── Rewards panel ─────────────────────────────────────────────────────── */

/** "Winner", "Top 10", "Ranks 4–10" — however the business sliced it. */
function rankLabel(from: number | null, to: number | null): string {
  if (from == null && to == null) return "All participants";
  if (from == null) return `Up to rank ${to}`;
  if (to == null || to === from) {
    if (from === 1) return "Winner";
    if (from === 2) return "1st runner-up";
    if (from === 3) return "2nd runner-up";
    return `Rank ${from}`;
  }
  if (from === 1) return `Top ${to}`;
  return `Ranks ${from}–${to}`;
}

/** How many people this tier pays out to, when the range says so. */
function winnerCount(from: number | null, to: number | null): number | null {
  if (from == null || to == null) return null;
  const n = to - from + 1;
  return n > 0 ? n : null;
}

/**
 * Parses a rupee figure out of a free-text value so the pool can be totalled.
 * Returns null for anything non-numeric ("A free meal") — a pool is only shown
 * when it can actually be computed, never guessed.
 */
function parseAmount(value: string | null): number | null {
  if (!value) return null;
  const m = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function RewardsPanel({ rewards }: { rewards: BusinessQuestDetail["rewards"] }) {
  if (rewards.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-[17px] font-bold text-gray-900">Rewards</h2>
        <p className="text-sm text-gray-500 mt-1">
          This Quest doesn&apos;t have any rewards listed yet.
        </p>
      </section>
    );
  }

  // Highest tier first, so the headline prize leads.
  const tiers = [...rewards].sort(
    (a, b) => (a.rank_from ?? 9999) - (b.rank_from ?? 9999)
  );

  let totalPool = 0;
  let poolComplete = true;
  let totalWinners = 0;
  let winnersComplete = true;

  for (const r of tiers) {
    const amount = parseAmount(r.value);
    const count = winnerCount(r.rank_from, r.rank_to);
    if (amount != null && count != null) totalPool += amount * count;
    else poolComplete = false;
    if (count != null) totalWinners += count;
    else winnersComplete = false;
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[17px] font-bold text-gray-900">Rewards</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            What you get for finishing, and how it&apos;s split.
          </p>
        </div>

        {/* Only stated when every tier gave a number — a partial total would
            understate the prize and read as a mistake. */}
        {poolComplete && totalPool > 0 && (
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Total pool
            </p>
            <p className="text-[22px] font-bold text-gray-900 leading-tight">
              ₹{totalPool.toLocaleString("en-IN")}
            </p>
            {winnersComplete && totalWinners > 0 && (
              <p className="text-[11px] text-gray-500">
                across {totalWinners} {totalWinners === 1 ? "winner" : "winners"}
              </p>
            )}
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-3 mt-5">
        {tiers.map((r, i) => {
          const count = winnerCount(r.rank_from, r.rank_to);
          const amount = parseAmount(r.value);
          const tierPool = amount != null && count != null ? amount * count : null;
          const isTop = i === 0;

          return (
            <li
              key={r.id}
              className={`rounded-2xl border p-4 flex items-start sm:items-center gap-3 sm:gap-4 ${
                isTop ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-white"
              }`}
            >
              <span
                className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  isTop ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                <Trophy size={20} />
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[15px] font-bold text-gray-900">
                    {rankLabel(r.rank_from, r.rank_to)}
                  </p>
                  {count != null && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600">
                      {count} {count === 1 ? "winner" : "winners"}
                    </span>
                  )}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600 capitalize">
                    {r.reward_type.replace(/_/g, " ")}
                  </span>
                </div>

                <p className="text-sm text-gray-500 mt-0.5">{r.title}</p>

                {r.description && (
                  <p className="text-xs text-gray-500 leading-relaxed mt-1">
                    {r.description}
                  </p>
                )}
              </div>

              <div className="text-right shrink-0">
                <p
                  className={`text-[19px] font-bold leading-tight ${
                    isTop ? "text-amber-700" : "text-gray-900"
                  }`}
                >
                  {r.value ?? "—"}
                </p>
                <p className="text-[11px] text-gray-500">
                  {count != null && count > 1 ? "each" : "prize"}
                </p>
                {tierPool != null && count != null && count > 1 && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    ₹{tierPool.toLocaleString("en-IN")} total
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {tiers.some((r) => r.is_leaderboard) && (
        <p className="text-xs text-gray-500 mt-4 flex items-start gap-1.5">
          <Trophy size={13} className="mt-0.5 shrink-0 text-gray-400" />
          Ranks are decided by the leaderboard once the Quest closes. Finish the required
          tasks to be counted.
        </p>
      )}
    </section>
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
    <section className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-[17px] font-bold text-gray-900">Leaderboard</h2>
      <p className="text-sm text-gray-500 mt-0.5">
        {enabled
          ? "Ranked on verified task completions only."
          : "This Quest does not run a leaderboard."}
      </p>

      {enabled && (
        rows.length === 0 ? (
          <p className="text-sm text-gray-400 mt-6 text-center py-10 border border-dashed border-gray-200 rounded-xl">
            No verified activity yet — the leaderboard fills in as participants
            complete tasks.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-gray-100">
            {rows.map((r) => {
              const name = r.full_name ?? r.username ?? "Participant";
              return (
                <li key={r.user_id} className="flex items-center gap-4 py-3">
                  <span className="w-7 text-sm font-bold text-gray-400 text-center shrink-0">
                    {r.rank}
                  </span>
                  <div className="w-9 h-9 rounded-full bg-blue-50 overflow-hidden shrink-0 flex items-center justify-center">
                    {r.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-blue-600">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                    <p className="text-xs text-gray-400">
                      {r.tasks_completed}/{totalTasks} tasks verified
                    </p>
                  </div>
                  <span className="text-sm font-bold text-gray-900 shrink-0">
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
    <section className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
          {b?.logo_url ?? quest.business_logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={(b?.logo_url ?? quest.business_logo)!}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xl font-bold text-gray-300">{businessName.charAt(0)}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[19px] font-bold text-gray-900 truncate">{businessName}</h2>
            {verified && (
              <ShieldCheck size={16} className="text-blue-600 shrink-0" aria-label="Verified by STRIVUP" />
            )}
          </div>
          {b?.category && <p className="text-sm text-gray-500 mt-0.5">{b.category}</p>}
        </div>
      </div>

      {b?.description && (
        <p className="text-sm text-gray-600 leading-relaxed mt-5">{b.description}</p>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mt-5">
        {address.length > 0 && (
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Address
            </dt>
            <dd className="text-sm text-gray-600 leading-relaxed mt-1">
              {address.map((line) => <span key={line} className="block">{line}</span>)}
            </dd>
          </div>
        )}
        {phones.length > 0 && (
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Phone
            </dt>
            <dd className="text-sm text-gray-600 mt-1">{phones.join(" / ")}</dd>
          </div>
        )}
        {b?.website && (
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Website
            </dt>
            <dd className="text-sm mt-1">
              <a
                href={b.website.startsWith("http") ? b.website : `https://${b.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {b.website.replace(/^https?:\/\//, "")}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {!b && (
        <p className="text-sm text-gray-400 mt-5">
          This Quest is not linked to a verified business profile yet.
        </p>
      )}

      {b?.id && (
        <Link
          href={`/business/${b.id}`}
          className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          View Business Profile →
        </Link>
      )}
    </section>
  );
}
