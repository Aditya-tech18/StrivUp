"use client";
/**
 * BusinessQuestDetailClient — Quest detail page for business-created Quests.
 *
 * Desktop: main column (hero, tabs, overview, tasks, verification, leaderboard,
 * rules, business) + right sidebar (reward, join, business, progress,
 * leaderboard preview). Mobile: single column + sticky Join/Continue bar.
 *
 * Everything shown comes from the Quest, its tasks/rewards, the business
 * profile, and the viewer's verified progress. No ratings, points or
 * popularity numbers are invented; missing data simply isn't shown.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, BadgeCheck, Calendar, CheckCircle2, ChevronRight, Clock, Copy, ExternalLink, Globe,
  ListChecks, MapPin, Navigation, Phone, Receipt, Share2, ShieldCheck, Store, Tag, Trophy,
  Upload, Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { BusinessQuestDetail } from "@/lib/data/quests";
import {
  getMyOrderRequests, getQuestLeaderboard, type LeaderboardRow, type OrderRequest,
} from "@/lib/data/orderVerification";
import { QuestProofModal } from "./QuestProofModal";

interface Props {
  quest: BusinessQuestDetail;
  currentUserId: string | null;
  currentUserName: string | null;
  /** Viewer is a business looking at another business's Quest. */
  canCreateSimilar?: boolean;
}

type Task = BusinessQuestDetail["tasks"][number];
type TabId = "overview" | "tasks" | "leaderboard" | "rules" | "business";

const PROOF_LABEL: Record<string, string> = {
  order_verification: "Verified Order", photo: "Photo", video: "Video", screenshot: "Screenshot",
  photo_text: "Photo + text", qr: "QR code", bill_document: "Bill / document", location: "Location",
  manual: "Manual review", none: "No proof needed",
};

const VERIFY_STEPS = [
  "Select eligible item", "Tap Upload Proof", "STRIVUP generates your order code",
  "Add the code to the Zomato/Swiggy order note", "Business receives the order", "Business searches the code in STRIVUP",
  "Business verifies the order", "STRIVUP issues a new bill code", "Business writes it on the bill",
  "You enter the bill code in STRIVUP", "Task completed", "Quest progress updated",
];

const ORDER_RULES = [
  "Join the Quest before attempting tasks.",
  "Only eligible orders count.",
  "Generate your STRIVUP verification code through Upload Proof.",
  "Include that code in the eligible Zomato/Swiggy order description.",
  "The business must verify the order in STRIVUP.",
  "After verification, the business receives a second code and writes it on the bill.",
  "Enter the bill verification code in STRIVUP.",
  "Only successfully verified tasks count toward Quest progress.",
  "Duplicate, invalid or fraudulent attempts may be rejected.",
  "Only verified progress affects the leaderboard.",
  "Reward eligibility follows the Quest's published reward conditions.",
];

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "rules", label: "Rules" },
  { id: "business", label: "About Business" },
];

const fmtDate = (d: string | null) => d
  ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
  : null;

function parseAmount(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const card = "rounded-2xl border border-gray-200/70 bg-white shadow-[0_1px_2px_rgba(13,28,50,0.04)]";
const primaryBtn = "h-12 rounded-xl bg-blue-600 px-5 text-[15px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(13,28,50,0.2)] hover:bg-blue-700 active:scale-[0.98] transition";

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 34, c = 2 * Math.PI * r, pct = total > 0 ? done / total : 0;
  return (
    <div className="relative h-24 w-24 shrink-0" role="img" aria-label={`${done} of ${total} required tasks completed`}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#E5E7EB" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="#2166F3" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-gray-900">{done}/{total}</span>
    </div>
  );
}

export default function BusinessQuestDetailClient({ quest, currentUserId, currentUserName, canCreateSimilar = false }: Props) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [hasJoined, setHasJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  // Signed-out visitors have nothing to load.
  const [loading, setLoading] = useState(!!currentUserId);
  const [approvedTasks, setApprovedTasks] = useState<Set<string>>(new Set());
  const [requests, setRequests] = useState<Map<string, OrderRequest>>(new Map());
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [proofTask, setProofTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [shareNote, setShareNote] = useState<string | null>(null);

  const businessName = quest.business?.name ?? quest.business_name ?? "this business";
  const hasOrderTasks = quest.tasks.some(t => t.proof_type === "order_verification");
  const requiredTasks = quest.tasks.filter(t => t.is_required);
  const doneRequired = requiredTasks.filter(t => approvedTasks.has(t.id)).length;
  const isEnded = quest.quest_status === "completed";

  const durationDays = quest.start_date && quest.end_date
    ? Math.max(1, Math.round((new Date(quest.end_date).getTime() - new Date(quest.start_date).getTime()) / 86_400_000))
    : null;

  // Headline reward: first rank-based reward, else the first reward.
  const headline = quest.rewards.find(r => r.is_leaderboard || r.rank_from) ?? quest.rewards[0] ?? null;
  const winners = headline?.rank_from ? (headline.rank_to ?? headline.rank_from) - headline.rank_from + 1 : null;
  const each = parseAmount(headline?.value ?? null);
  const pool = winners && each ? winners * each : null;
  const rewardSummary = headline
    ? winners ? `Top ${winners} win ${headline.value ?? headline.title}${headline.value ? " each" : ""}` : headline.title
    : null;

  const gallery = useMemo(() => {
    const imgs = [quest.cover_url ?? quest.thumbnail_url, ...quest.tasks.map(t => t.image_url)].filter(Boolean) as string[];
    return Array.from(new Set(imgs));
  }, [quest]);

  const cityLine = quest.business
    ? [quest.business.city, quest.business.state].filter(Boolean).join(", ") + (quest.business.pincode ? ` – ${quest.business.pincode}` : "")
    : "";
  const addressLines = [quest.business?.address, cityLine].filter((l): l is string => !!l && !!l.replace(/[–\s]/g, ""));
  const mapsQuery = encodeURIComponent([businessName, ...addressLines].join(", ") || quest.location_name || businessName);
  const website = quest.business?.website || quest.destination_link;
  const phoneHref = quest.business?.phone ? `tel:${quest.business.phone.split("/")[0].replace(/[^\d+]/g, "")}` : null;

  type Progress = { joined: boolean; approved: Set<string>; reqs: Map<string, OrderRequest>; board: LeaderboardRow[] };

  // Fetch returns data; state is applied separately so effects only set state in callbacks.
  const fetchProgress = useCallback(async (): Promise<Progress | null> => {
    if (!currentUserId) return null;
    const [{ data: part }, { data: subs }, reqs, board] = await Promise.all([
      supabase.from("quest_participants").select("id").eq("quest_id", quest.id).eq("user_id", currentUserId).maybeSingle(),
      supabase.from("quest_task_submissions").select("task_id").eq("quest_id", quest.id).eq("user_id", currentUserId).eq("verification_status", "approved"),
      getMyOrderRequests(supabase, quest.id, currentUserId),
      getQuestLeaderboard(supabase, quest.id, 20),
    ]);
    return { joined: !!part, approved: new Set((subs ?? []).map((s: { task_id: string }) => s.task_id)), reqs, board };
  }, [supabase, quest.id, currentUserId]);

  const applyProgress = useCallback((p: Progress | null) => {
    if (!p) return;
    setHasJoined(p.joined);
    setApprovedTasks(p.approved);
    setRequests(p.reqs);
    setLeaderboard(p.board);
    setLoading(false);
  }, []);

  const loadProgress = useCallback(async () => applyProgress(await fetchProgress()), [applyProgress, fetchProgress]);

  useEffect(() => {
    if (!currentUserId) {
      getQuestLeaderboard(supabase, quest.id, 20).then(setLeaderboard);
      return;
    }
    fetchProgress().then(applyProgress);
  }, [currentUserId, fetchProgress, applyProgress, supabase, quest.id]);

  // Business verification happens elsewhere — refresh when the user returns.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") loadProgress(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadProgress]);

  // Highlight the tab for the section currently in view.
  useEffect(() => {
    const els = TABS.map(t => document.getElementById(t.id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(entries => {
      const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActiveTab(top.target.id as TabId);
    }, { rootMargin: "-120px 0px -60% 0px" });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  const goTo = (id: TabId) => {
    setActiveTab(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const join = async (): Promise<boolean> => {
    if (!currentUserId) { router.push(`/login?redirectTo=/quests/${quest.id}`); return false; }
    setJoining(true);
    const { error } = await supabase.from("quest_participants").upsert(
      { quest_id: quest.id, user_id: currentUserId, verification_status: "pending", joined_at: new Date().toISOString() },
      { onConflict: "quest_id,user_id", ignoreDuplicates: true }
    );
    setJoining(false);
    if (error) return false;
    setHasJoined(true);
    supabase.from("quest_events").insert({ quest_id: quest.id, user_id: currentUserId, event_type: "join" })
      .then(() => { /* fire and forget */ }, () => { /* ignore */ });
    return true;
  };

  const closeProof = useCallback(() => setProofTask(null), []);

  const openProof = (task: Task) => {
    if (!currentUserId) { router.push(`/login?redirectTo=/quests/${quest.id}`); return; }
    if (task.proof_type === "order_verification") setProofTask(task);
    else router.push(`/quests/${quest.id}/tasks`);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: quest.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied");
      setTimeout(() => setShareNote(null), 2000);
    } catch { /* share sheet dismissed */ }
  };

  const taskStatus = (t: Task): { label: string; cls: string } | null => {
    if (approvedTasks.has(t.id)) return { label: "Completed", cls: "bg-green-50 text-green-800 border-green-200" };
    const r = requests.get(t.id);
    if (!r) return null;
    if (r.status === "pending") return { label: "Waiting for business", cls: "bg-amber-50 text-amber-900 border-amber-200" };
    if (r.status === "approved") return { label: "Enter bill code", cls: "bg-blue-50 text-blue-800 border-blue-200" };
    if (r.status === "rejected") return { label: "Rejected", cls: "bg-red-50 text-red-800 border-red-200" };
    return null;
  };

  const joinButton = hasJoined ? (
    <button type="button" onClick={() => goTo("tasks")} className={`w-full ${primaryBtn}`}>
      Continue Quest · {doneRequired}/{requiredTasks.length}
    </button>
  ) : isEnded ? (
    <button type="button" disabled className="h-12 w-full rounded-xl bg-gray-200 px-5 text-[15px] font-bold text-gray-700">Quest Ended</button>
  ) : (
    <button type="button" onClick={join} disabled={joining || loading}
      className={`flex w-full items-center justify-center gap-2 disabled:opacity-60 ${primaryBtn}`}>
      {joining && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />} Join Quest
    </button>
  );

  const heroImg = quest.cover_url ?? quest.thumbnail_url;
  const directionsHref = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const outlineBtn = "flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-800 hover:bg-gray-50";

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28 lg:pb-10">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <div className="flex items-center py-2">
          <button type="button" onClick={() => router.back()}
            className="-ml-2 flex h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-700 hover:bg-white">
            <ArrowLeft size={18} aria-hidden="true" /> Back to Explore
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ═════════════ MAIN ═════════════ */}
          <div className="flex min-w-0 flex-col gap-5">
            {/* Hero */}
            <section className="relative overflow-hidden rounded-2xl bg-[#0d1c32] shadow-[0_8px_24px_-12px_rgba(13,28,50,0.45)]">
              {heroImg && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/25" aria-hidden="true" />
              <div className="relative flex min-h-[220px] items-center gap-5 p-5 pt-14 sm:min-h-[250px] sm:p-7">
                <div className="hidden h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/80 bg-white sm:flex md:h-36 md:w-36">
                  {quest.business_logo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={quest.business_logo} alt={`${businessName} logo`} className="h-full w-full object-cover" />
                    : <Store size={40} className="text-gray-400" aria-hidden="true" />}
                </div>
                <div className="min-w-0 flex-1">
                  {quest.category && (
                    <span className="inline-block rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">{quest.category}</span>
                  )}
                  <h1 className="mt-2 text-[28px] font-black leading-tight tracking-tight text-white sm:text-[36px]">{quest.title}</h1>
                  <p className="mt-1 text-sm font-semibold text-white/90">by {businessName}</p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white">
                    {quest.location_name && <span className="flex items-center gap-1.5"><MapPin size={16} aria-hidden="true" />{quest.location_name}</span>}
                    {quest.start_date && quest.end_date && (
                      <span className="flex items-center gap-1.5">
                        <Calendar size={16} aria-hidden="true" />
                        {fmtDate(quest.start_date)} – {fmtDate(quest.end_date)}{durationDays ? ` (${durationDays} days)` : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button type="button" onClick={share}
                className="absolute right-3 top-3 flex h-10 items-center gap-1.5 rounded-xl border border-white/40 bg-black/40 px-3 text-sm font-semibold text-white backdrop-blur-sm hover:bg-black/60">
                <Share2 size={15} aria-hidden="true" /> {shareNote ?? "Share"}
              </button>
            </section>

            {/* Reward summary (mobile — desktop shows it in the sidebar) */}
            {headline && (
              <div className="flex items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 lg:hidden">
                <Trophy size={22} className="shrink-0 text-amber-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-black text-gray-900">{headline.title}</p>
                  <p className="text-xs text-gray-700">
                    {[winners && `Top ${winners}`, headline.value && `${headline.value} each`, pool && `₹${pool.toLocaleString("en-IN")} pool`].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-gray-200 bg-[#F8F9FC]/95 px-4 backdrop-blur-sm no-scrollbar lg:mx-0 lg:px-0">
              <nav aria-label="Quest sections" className="flex gap-1">
                {TABS.map(t => (
                  <button key={t.id} type="button" aria-current={activeTab === t.id ? "true" : undefined} onClick={() => goTo(t.id)}
                    className={`-mb-px h-12 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors ${activeTab === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Overview */}
            <section id="overview" className="grid scroll-mt-16 gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className={`${card} p-5`}>
                <h2 className="text-lg font-black text-gray-900">About This Quest</h2>
                {quest.description && <p className="mt-2 text-[15px] leading-relaxed text-gray-700">{quest.description}</p>}
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                  {[
                    { icon: Tag, v: quest.category, k: "Category" },
                    { icon: MapPin, v: quest.location_name, k: "Location" },
                    { icon: Calendar, v: durationDays ? `${durationDays} days` : null, k: "Duration" },
                    { icon: Users, v: rewardSummary, k: "Reward" },
                  ].filter(x => x.v).map(({ icon: Icon, v, k }) => (
                    <div key={k} className="flex flex-col gap-1.5">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50"><Icon size={18} className="text-blue-700" aria-hidden="true" /></span>
                      <dd className="text-sm font-bold leading-snug text-gray-900">{v}</dd>
                      <dt className="text-xs text-gray-600">{k}</dt>
                    </div>
                  ))}
                </dl>
              </div>
              {gallery.length > 0 && (
                <div className={`grid min-h-[200px] gap-2 p-2 ${card} ${gallery.length > 1 ? "grid-cols-[2fr_1fr] grid-rows-3" : ""}`}>
                  {gallery.slice(0, 4).map((src, i) => (
                    <div key={src} className={`relative min-h-[60px] overflow-hidden rounded-xl bg-gray-100 ${i === 0 && gallery.length > 1 ? "row-span-3" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={i === 0 ? `${quest.title} cover` : `${quest.tasks.find(t => t.image_url === src)?.title ?? "Quest"} photo`}
                        className="absolute inset-0 h-full w-full object-cover" />
                      {i === 3 && gallery.length > 4 && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-black text-white">+{gallery.length - 4}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Tasks */}
            <section id="tasks" className={`scroll-mt-16 ${card} p-5`}>
              <h2 className="text-lg font-black text-gray-900">Tasks ({quest.tasks.length})</h2>
              <p className="mt-0.5 text-sm text-gray-600">Complete the required tasks to finish the Quest. Every task must be verified.</p>
              <ol className="mt-4 flex flex-col gap-3">
                {quest.tasks.map((task, i) => {
                  const st = taskStatus(task);
                  const done = approvedTasks.has(task.id);
                  return (
                    <li key={task.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200/70 p-3 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-black sm:flex ${done ? "border-green-600 bg-green-600 text-white" : "border-gray-200 text-gray-800"}`}>
                          {done ? <CheckCircle2 size={18} aria-label="Completed" /> : i + 1}
                        </span>
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-[72px] sm:w-[72px]">
                          <span className={`absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-black shadow-sm sm:hidden ${done ? "bg-green-600 text-white" : "bg-white text-gray-900"}`} aria-hidden="true">
                            {done ? "✓" : i + 1}
                          </span>
                          {task.image_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={task.image_url} alt={task.title} className="h-full w-full object-cover" />
                            : <div className="flex h-full w-full items-center justify-center"><ListChecks size={24} className="text-gray-400" aria-hidden="true" /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[15px] font-bold text-gray-900">{task.title}</p>
                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${task.is_required ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-700"}`}>
                              {task.is_required ? "Required" : "Optional"}
                            </span>
                          </div>
                          {task.description && <p className="mt-0.5 line-clamp-2 text-sm text-gray-700">{task.description}</p>}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
                              {task.proof_type === "order_verification" ? <Receipt size={13} aria-hidden="true" /> : <ShieldCheck size={13} aria-hidden="true" />}
                              {PROOF_LABEL[task.proof_type] ?? task.proof_type}
                            </span>
                            {st && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>}
                          </div>
                        </div>
                      </div>
                      {!done && (
                        <div className="flex items-center gap-1 sm:shrink-0">
                          <button type="button" onClick={() => openProof(task)} disabled={isEnded}
                            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-blue-600 px-5 text-sm font-bold text-blue-700 transition hover:bg-blue-50 active:scale-[0.98] disabled:opacity-40 sm:flex-none">
                            <Upload size={16} aria-hidden="true" /> Upload Proof
                          </button>
                          <Link href={`/quests/${quest.id}/tasks`} aria-label={`Open ${task.title}`}
                            className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-50">
                            <ChevronRight size={20} aria-hidden="true" />
                          </Link>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* How verification works */}
            {hasOrderTasks && (
              <section className={`${card} p-5`} aria-labelledby="how-verify">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="how-verify" className="text-lg font-black text-gray-900">How Verification Works</h2>
                  <Link href="/how-quests-work" className="text-sm font-semibold text-blue-700 hover:underline">Full guide</Link>
                </div>
                <ol className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 xl:grid-cols-4">
                  {VERIFY_STEPS.map((s, i) => (
                    <li key={s} className="flex items-start gap-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${i >= 10 ? "bg-green-700 text-white" : "bg-blue-50 text-blue-800"}`}>{i + 1}</span>
                      <span className="pt-1 text-[13px] leading-snug text-gray-800">{s}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-700">
                  STRIVUP isn&apos;t connected to Zomato or Swiggy — the code in your order note is what links your order to this Quest.
                  One active verification code per task at a time.
                </p>
              </section>
            )}

            {/* Leaderboard */}
            <section id="leaderboard" className={`scroll-mt-16 ${card} p-5`}>
              <div className="flex items-center gap-2">
                <Trophy size={18} className="text-amber-600" aria-hidden="true" />
                <h2 className="flex-1 text-lg font-black text-gray-900">Leaderboard</h2>
                <span className="text-xs text-gray-600">Verified tasks only</span>
              </div>
              {leaderboard.length === 0 ? (
                <p className="mt-3 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-700">
                  No verified completions yet. Complete a task to be the first on the board.
                </p>
              ) : (
                <ol className="mt-3 divide-y divide-gray-100">
                  {leaderboard.map(row => (
                    <li key={row.user_id} className={`flex items-center gap-3 py-2.5 ${row.is_me ? "-mx-2 rounded-xl bg-blue-50 px-2" : ""}`}>
                      <span className={`w-9 text-sm font-black ${row.rank <= 3 ? "text-amber-700" : "text-gray-700"}`}>#{row.rank}</span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-xs font-bold text-gray-700">
                        {row.avatar_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={row.avatar_url} alt="" className="h-full w-full object-cover" />
                          : row.display_name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{row.is_me ? "You" : row.display_name}</span>
                      <span className="text-sm font-black text-gray-900">{row.completed_tasks}<span className="font-medium text-gray-600">/{requiredTasks.length}</span></span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-3 text-xs text-gray-600">Ranked by verified tasks. Ties go to whoever completed their latest verification first.</p>
            </section>

            {/* Rules */}
            <section id="rules" className={`scroll-mt-16 ${card} p-5`}>
              <h2 className="text-lg font-black text-gray-900">Rules</h2>
              {hasOrderTasks && (
                <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {ORDER_RULES.map(r => (
                    <li key={r} className="flex items-start gap-2 text-sm text-gray-800">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" /> {r}
                    </li>
                  ))}
                </ul>
              )}
              {(quest.eligibility || quest.rules) && (
                <div className="mt-4 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
                  {quest.eligibility && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-600">Eligibility</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{quest.eligibility}</p>
                    </div>
                  )}
                  {quest.rules && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-600">Rules from {businessName}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{quest.rules}</p>
                    </div>
                  )}
                </div>
              )}
              {!hasOrderTasks && !quest.eligibility && !quest.rules && (
                <p className="mt-2 text-sm text-gray-700">Complete each task and have it verified. Only verified tasks count toward progress.</p>
              )}
            </section>

            {/* About Business */}
            <section id="business" className={`scroll-mt-16 ${card} p-5`}>
              <h2 className="text-lg font-black text-gray-900">About {businessName}</h2>
              {quest.business?.description
                ? <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-gray-700">{quest.business.description}</p>
                : <p className="mt-2 text-sm text-gray-700">{quest.business ? "This business hasn't added a description yet." : "Full business details appear here once STRIVUP has verified the business."}</p>}
              {(addressLines.length > 0 || quest.location_name) && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-gray-200/70 p-4">
                  <MapPin size={18} className="mt-0.5 shrink-0 text-blue-700" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900">{businessName}</p>
                    {quest.business?.category && <p className="text-xs text-gray-600">{quest.business.category}</p>}
                    <address className="mt-1 not-italic text-sm text-gray-800">
                      {addressLines.length > 0 ? addressLines.map(l => <span key={l} className="block">{l}</span>) : quest.location_name}
                    </address>
                    {quest.business?.phone && <p className="mt-1 text-sm text-gray-800">{quest.business.phone}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={directionsHref} target="_blank" rel="noopener noreferrer" className={outlineBtn}>
                        <Navigation size={15} aria-hidden="true" /> Directions
                      </a>
                      {phoneHref && (
                        <a href={phoneHref} className={outlineBtn}><Phone size={15} aria-hidden="true" /> Call</a>
                      )}
                      {website && (
                        <a href={website} target="_blank" rel="noopener noreferrer" className={outlineBtn}>
                          <Globe size={15} aria-hidden="true" /> Website
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* ═════════════ SIDEBAR ═════════════ */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start" aria-label="Quest summary">
            {headline && (
              <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-[0_1px_2px_rgba(13,28,50,0.08)]">
                    <Trophy size={24} className="text-amber-600" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xl font-black leading-tight text-gray-900">{headline.title}</p>
                    {winners && <p className="text-sm text-gray-700">for Top {winners} {winners === 1 ? "user" : "users"}</p>}
                  </div>
                </div>
                {(winners || headline.value || pool) && (
                  <div className="mt-4 grid grid-cols-3 divide-x divide-amber-200/80 rounded-xl bg-white/70 py-2 text-center">
                    <div><p className="text-sm font-black text-gray-900">{winners ?? "—"}</p><p className="text-[11px] text-gray-600">Winners</p></div>
                    <div><p className="text-sm font-black text-gray-900">{headline.value ?? "—"}</p><p className="text-[11px] text-gray-600">Each</p></div>
                    <div><p className="text-sm font-black text-gray-900">{pool ? `₹${pool.toLocaleString("en-IN")}` : "—"}</p><p className="text-[11px] text-gray-600">Total pool</p></div>
                  </div>
                )}
                {quest.rewards.length > 1 && (
                  <ul className="mt-3 flex flex-col gap-1 text-xs text-gray-700">
                    {quest.rewards.filter(r => r.id !== headline.id).map(r => <li key={r.id}>+ {r.title}{r.value ? ` · ${r.value}` : ""}</li>)}
                  </ul>
                )}
                <p className="mt-3 text-[11px] text-gray-600">Reward terms are set by {businessName}.</p>
              </div>
            )}

            <div className="hidden lg:block">{joinButton}</div>

            {canCreateSimilar && (
              <Link href={`/business/quests/new?template=${quest.id}`}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-blue-600 bg-white text-sm font-bold text-blue-700 hover:bg-blue-50">
                <Copy size={15} aria-hidden="true" /> Create Similar Quest
              </Link>
            )}

            {/* Business information */}
            <div className={`${card} p-5`}>
              <p className="text-sm font-black text-gray-900">Business Information</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white">
                  {quest.business_logo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={quest.business_logo} alt={`${businessName} logo`} className="h-full w-full object-cover" />
                    : <Store size={22} className="text-gray-400" aria-hidden="true" />}
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-[15px] font-bold text-gray-900">
                    <span className="truncate">{businessName}</span>
                    {quest.business?.verified && <BadgeCheck size={17} className="shrink-0 text-blue-600" aria-label="Verified by STRIVUP" />}
                  </p>
                  {quest.business?.category && <p className="text-xs text-gray-600">{quest.business.category}</p>}
                </div>
              </div>
              {(addressLines.length > 0 || quest.location_name) && (
                <p className="mt-3 flex items-start gap-2 text-sm text-gray-800">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
                  <span>{addressLines.length > 0 ? addressLines.join(", ") : quest.location_name}</span>
                </p>
              )}
              {quest.business?.phone && (
                <p className="mt-2 flex items-center gap-2 text-sm text-gray-800">
                  <Phone size={16} className="shrink-0 text-gray-500" aria-hidden="true" /> {quest.business.phone}
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => goTo("business")}
                  className="col-span-2 flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm font-semibold text-blue-700 hover:bg-gray-100">
                  View Business Details
                </button>
                <a href={directionsHref} target="_blank" rel="noopener noreferrer" className={outlineBtn}>
                  <Navigation size={15} aria-hidden="true" /> Directions
                </a>
                {website ? (
                  <a href={website} target="_blank" rel="noopener noreferrer" className={outlineBtn}>
                    Website <ExternalLink size={13} aria-hidden="true" />
                  </a>
                ) : phoneHref ? (
                  <a href={phoneHref} className={outlineBtn}><Phone size={15} aria-hidden="true" /> Call</a>
                ) : null}
              </div>
            </div>

            {/* Progress */}
            <div className={`${card} p-5`}>
              <p className="text-sm font-black text-gray-900">Quest Progress</p>
              <div className="mt-3 flex items-center gap-4">
                <ProgressRing done={doneRequired} total={requiredTasks.length} />
                <div>
                  <p className="text-[15px] font-bold text-gray-900">Tasks Completed</p>
                  <p className="text-sm text-gray-700">
                    {!hasJoined ? "Join the Quest and complete verified tasks to build your progress."
                      : doneRequired === requiredTasks.length && requiredTasks.length > 0 ? "All required tasks verified. Quest complete! 🎉"
                      : "Only verified tasks count toward your progress."}
                  </p>
                </div>
              </div>
            </div>

            {/* Leaderboard preview */}
            <div className={`${card} p-5`}>
              <p className="text-sm font-black text-gray-900">Leaderboard Preview</p>
              {leaderboard.length === 0 ? (
                <p className="mt-2 text-sm text-gray-700">No verified completions yet.</p>
              ) : (
                <ol className="mt-3 flex flex-col gap-2.5">
                  {leaderboard.slice(0, 3).map(row => (
                    <li key={row.user_id} className="flex items-center gap-2.5">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${row.rank === 1 ? "bg-amber-100 text-amber-800" : row.rank === 2 ? "bg-gray-200 text-gray-800" : "bg-orange-100 text-orange-800"}`}>{row.rank}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{row.is_me ? "You" : row.display_name}</span>
                      <span className="text-sm font-bold text-gray-800">{row.completed_tasks}/{requiredTasks.length}</span>
                    </li>
                  ))}
                </ol>
              )}
              <button type="button" onClick={() => goTo("leaderboard")}
                className="mt-3 flex h-10 w-full items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-50 text-sm font-semibold text-blue-700 hover:bg-gray-100">
                View Full Leaderboard <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>

            {quest.end_date && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-gray-600">
                <Clock size={13} aria-hidden="true" /> Ends {fmtDate(quest.end_date)}
              </p>
            )}
          </aside>
        </div>
      </div>

      {/* Mobile sticky CTA */}
      <div className="fixed above-bottom-nav z-40 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur-sm lg:hidden">
        {joinButton}
      </div>

      {proofTask && (
        <QuestProofModal
          task={proofTask}
          questTitle={quest.title}
          businessName={businessName}
          userName={currentUserName}
          isParticipant={hasJoined}
          request={requests.get(proofTask.id)}
          completed={approvedTasks.has(proofTask.id)}
          onClose={closeProof}
          onJoin={join}
          onRequestChange={req => setRequests(prev => new Map(prev).set(proofTask.id, req))}
          onCompleted={() => { setApprovedTasks(prev => new Set(prev).add(proofTask.id)); loadProgress(); }}
        />
      )}
    </div>
  );
}
