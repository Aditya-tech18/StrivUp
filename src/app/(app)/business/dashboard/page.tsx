"use client";
/**
 * /business/dashboard — Main business hub matching the STRIVUP design.
 * Shows: profile header with stats, business tools grid, active campaigns, recent activity.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, Bell, BadgeCheck, BookOpen, CheckCircle2, CheckSquare, ChevronRight,
  Circle, Clock, Gift, HelpCircle, Plus, Search, ShieldCheck, Star, Store, Trophy,
  TrendingUp, Users, XCircle, Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUnreadCount } from "@/components/ui/AlertsContext";
import { getMyBusinessProfile, getBusinessVerifications, getVerificationInsights, type BusinessProfile, type VerificationRequest } from "@/lib/data/business";

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m !== 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? "s" : ""} ago`;
  return `${Math.floor(h / 24)} day${Math.floor(h/24) !== 1 ? "s" : ""} ago`;
}

/** 950 -> "950", 1200 -> "1.2K", 12400 -> "12.4K", 1500000 -> "1.5M" */
function compactNum(n: number) {
  const fmt = (v: number, suffix: string) => `${v.toFixed(1).replace(/\.0$/, "")}${suffix}`;
  if (n >= 1_000_000) return fmt(n / 1_000_000, "M");
  if (n >= 1_000) return fmt(n / 1_000, "K");
  return String(n);
}

function StatusBadge({ status }: { status: BusinessProfile["verification_status"] }) {
  const map = {
    verified:     { Icon: CheckCircle2,  label: "Verified",     cls: "text-on-success-container bg-success-container border-success-outline" },
    submitted:    { Icon: Clock,         label: "Under Review", cls: "text-secondary bg-secondary-fixed border-secondary-fixed-dim" },
    under_review: { Icon: Clock,         label: "Under Review", cls: "text-secondary bg-secondary-fixed border-secondary-fixed-dim" },
    needs_more_info: { Icon: HelpCircle, label: "Needs Info",   cls: "text-on-secondary-fixed bg-secondary-fixed border-secondary-fixed-dim" },
    incomplete:   { Icon: Circle,        label: "Not Verified", cls: "text-on-surface-variant bg-surface-container-low border-outline-variant" },
    draft:        { Icon: Circle,        label: "Not Verified", cls: "text-on-surface-variant bg-surface-container-low border-outline-variant" },
    rejected:     { Icon: XCircle,       label: "Rejected",     cls: "text-on-error-container bg-error-container border-error-outline" },
    suspended:    { Icon: XCircle,       label: "Suspended",    cls: "text-on-error-container bg-error-container border-error-outline" },
  };
  const c = map[status] ?? map.draft;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-body-sm font-semibold ${c.cls}`}>
      <c.Icon size={13} aria-hidden="true" /> {c.label}
    </span>
  );
}

export default function BusinessDashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { unreadCount } = useUnreadCount();
  const [loading, setLoading] = useState(true);
  const [bp, setBp] = useState<BusinessProfile | null>(null);
  const [verifs, setVerifs] = useState<VerificationRequest[]>([]);
  const [insights, setInsights] = useState({ total: 0, approved: 0, pending: 0, rejected: 0 });
  const [activeQuests, setActiveQuests] = useState<{ id: string; title: string; description: string | null; cover_url: string | null; participant_count: number }[]>([]);
  const [questStats, setQuestStats] = useState({ total: 0, active: 0, participants: 0, pending_proofs: 0 });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const profile = await getMyBusinessProfile(supabase);
      if (!profile) { router.replace("/business/onboarding"); return; }
      if (!profile.onboarding_done) { router.replace("/business/onboarding"); return; }
      setBp(profile);

      const [v, ins] = await Promise.all([
        getBusinessVerifications(supabase, profile.id, { limit: 3 }),
        getVerificationInsights(supabase, profile.id),
      ]);
      setVerifs(v);
      setInsights(ins);

      // Fetch this business's active quests
      const { data: questData } = await supabase
        .from("quests")
        .select("id,title,description,cover_url,thumbnail_url,participant_count,quest_status")
        .eq("business_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(20);

      const allQuests = questData ?? [];
      const active = allQuests.filter((q: { quest_status: string }) => q.quest_status === "active");
      setActiveQuests(active.slice(0, 3).map((q: { id: string; title: string; description: string | null; cover_url: string | null; thumbnail_url: string | null; participant_count: number }) => ({
        id: q.id, title: q.title, description: q.description, cover_url: q.cover_url ?? q.thumbnail_url, participant_count: q.participant_count
      })));

      const totalParticipants = allQuests.reduce((sum: number, q: { participant_count: number }) => sum + (q.participant_count ?? 0), 0);
      const { count: pendingProofs } = await supabase.from("quest_task_submissions")
        .select("id", { count: "exact", head: true })
        .in("quest_id", allQuests.map((q: { id: string }) => q.id))
        .eq("verification_status", "pending");

      setQuestStats({ total: allQuests.length, active: active.length, participants: totalParticipants, pending_proofs: pendingProofs ?? 0 });
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );
  if (!bp) return null;

  const name = bp.business_name || "Your Business";
  const city = [bp.city, bp.state].filter(Boolean).join(", ");

  const TOOLS = [
    {
      icon: <ShieldCheck size={22} className="text-secondary" />,
      bg: "bg-secondary-fixed",
      title: "Verification",
      desc: "Verify participant activities and business visits.",
      cta: { label: "Verify Participant →", href: "/business/verification", primary: true },
      badge: 0,
    },
    {
      icon: <BookOpen size={22} className="text-on-surface-variant" />,
      bg: "bg-surface-container-low",
      title: "Verification History",
      desc: "View all past verifications.",
      cta: { label: "View all", href: "/business/verification/history", primary: false },
      badge: 0,
    },
    {
      icon: <Clock size={22} className="text-warning" />,
      bg: "bg-warning-container",
      title: "Pending Requests",
      desc: "Verification requests waiting for your approval.",
      cta: { label: "Review now", href: "/business/verification?filter=pending", primary: false },
      badge: insights.pending,
    },
    {
      icon: <HelpCircle size={22} className="text-chart-3" />,
      bg: "bg-chart-3/10",
      title: "How Verification Works",
      desc: "Learn the step-by-step verification process.",
      cta: { label: "Learn more", href: "/business/verification/how-it-works", primary: false },
      badge: 0,
    },
  ];

  const QUICK_LINKS = [
    { icon: <CheckSquare size={18} className="text-warning" />,  bg: "bg-warning-container",  label: "Proofs",       href: "/business/proof-verification" },
    { icon: <TrendingUp size={18} className="text-success" />,   bg: "bg-success-container",  label: "Analytics",    href: "/business/analytics" },
    { icon: <Users size={18} className="text-chart-3" />,       bg: "bg-chart-3/10", label: "Participants", href: "/business/participants" },
    { icon: <Gift size={18} className="text-warning" />,        bg: "bg-warning-container", label: "Rewards",      href: "/business/rewards" },
    { icon: <Zap size={18} className="text-secondary" />,           bg: "bg-secondary-fixed",   label: "Promote",      href: "/business/promote" },
  ];

  return (
    <div className="min-h-screen bg-surface pb-28">
      {/* ── Top Nav ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto grid measure-wide grid-cols-3 items-center px-5 py-4 lg:px-8">
        <div className="flex items-center">
          <Link href="/business/profile" aria-label="Business profile">
            {bp.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={bp.logo_url} alt={bp.business_name ?? ""} className="w-8 h-8 rounded-xl object-cover border border-outline-variant" />
              : <div className="w-8 h-8 rounded-xl bg-secondary-fixed border border-outline-variant flex items-center justify-center"><Store size={16} className="text-secondary" /></div>
            }
          </Link>
        </div>
        <span className="text-center font-black text-on-surface text-body-lg tracking-tight">STRIVUP</span>
        <div className="flex items-center justify-end gap-2">
          <Link href="/search" aria-label="Search"
            className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center tap-target">
            <Search size={16} className="text-on-surface-variant" />
          </Link>
          <Link href="/alerts" aria-label={unreadCount > 0 ? `Alerts, ${unreadCount} unread` : "Alerts"}
            className="relative w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center">
            <Bell size={16} className="text-on-surface-variant" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-error ring-2 ring-surface-container-lowest" />
            )}
          </Link>
          </div>
        </div>
      </div>

      {/* The dashboard was capped at 512px on every screen, so a business owner
          on a laptop read a phone column with four stat tiles crammed into it.
          measure-wide widens it, and at lg it splits into a main column plus an
          aside: what you act on stays left, what you monitor moves right. */}
      <div className="mx-auto measure-wide px-5 py-5 lg:px-8">
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-5">

        {/* ── Rejection Banner ────────────────────────────────────────── */}
        {bp.verification_status === "rejected" && (
          <div className="bg-error-container border border-error-outline rounded-2xl px-4 py-4">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-on-error-container">
              <AlertTriangle size={15} aria-hidden="true" /> Verification Rejected
            </p>
            <p className="text-sm text-on-error-container">{bp.rejection_reason || "Your verification was rejected."}</p>
            <button onClick={() => router.push("/business/onboarding")}
              className="mt-2 px-4 py-1.5 rounded-xl border border-error-outline text-on-error-container text-sm font-semibold">
              Resubmit
            </button>
          </div>
        )}

        {/* ── Profile Header ───────────────────────────────────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-5 py-5 elev-1 surface-raised">
          <div className="flex items-start gap-4">
            {/* Logo */}
            <div className="w-16 h-16 rounded-2xl bg-surface-container overflow-hidden flex items-center justify-center shrink-0 border border-outline-variant">
              {bp.logo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={bp.logo_url} alt={name} className="w-full h-full object-cover" />
                : <Store size={28} className="text-on-surface-variant" />
              }
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-headline-md font-black text-on-surface">{name}</h1>
                {bp.verification_status === "verified" && (
                  <BadgeCheck size={18} className="text-secondary" aria-label="Verified business" />
                )}
              </div>
              {bp.business_username && <p className="text-sm text-on-surface-variant">@{bp.business_username}</p>}
              {(bp.category || city) && (
                <p className="text-sm text-on-surface-variant truncate">{[bp.category, city].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <button onClick={() => router.push("/business/settings")}
              className="px-4 py-1.5 rounded-xl border border-outline-variant text-sm font-semibold text-on-surface-variant bg-surface-container-lowest hover:bg-surface-container-low shrink-0 elev-1 surface-raised">
              Edit Profile
            </button>
          </div>

          {/* ── Stats row ────────────────────────────────────────────── */}
          {/* gap-px over a tinted track draws the hairlines, so they land correctly
              whether this is two columns or four. The old border-l on every
              tile but the first only worked while it was a single row. */}
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-outline-variant bg-outline-variant sm:grid-cols-4">
            {[
              { label: "Customers",    value: compactNum(bp.total_customers) },
              { label: "Challenges",   value: compactNum(bp.total_challenges) },
              { label: "Participants", value: compactNum(bp.total_participants) },
              { label: "Rating",       value: bp.rating > 0 ? bp.rating.toString() : "—", icon: bp.rating > 0 },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center bg-surface-container-low py-3">
                <span className="flex items-center gap-1 text-headline-sm font-black text-on-surface">
                  {s.value}
                  {s.icon && <Star size={13} className="text-warning" aria-hidden="true" />}
                </span>
                <span className="text-label-sm text-on-surface-variant font-medium mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Verification status → blue tick request */}
          <Link href="/business/verify-business"
            className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-outline-variant min-h-11 hover:opacity-80">
            <span className="text-sm text-on-surface-variant">Business Verification</span>
            <span className="flex items-center gap-2">
              <StatusBadge status={bp.verification_status} />
              {["draft", "incomplete", "rejected", "needs_more_info"].includes(bp.verification_status) && (
                <span className="text-sm font-semibold text-secondary">Verify now →</span>
              )}
            </span>
          </Link>
        </div>

        {/* ── Quick Actions ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <button onClick={() => router.push("/business/quests/new")}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-secondary hover:opacity-90 text-white font-bold text-sm transition-all elev-brand">
            <Plus size={18} /> Create Quest
          </button>
          <button onClick={() => router.push("/business/quests")}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface-variant font-semibold text-sm hover:bg-surface-container-low transition-all elev-1 surface-raised">
            My Quests →
          </button>
        </div>

        {/* ── Active Quests ─────────────────────────────────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-5 py-5 elev-1 surface-raised">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body-lg font-black text-on-surface">Your Active Campaigns</h2>
            <Link href="/business/quests" className="text-sm text-secondary font-semibold">View all</Link>
          </div>
          {activeQuests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <TrendingUp size={32} className="text-on-surface-variant" />
              <p className="text-sm font-semibold text-on-surface-variant">No active Quests yet</p>
              <p className="text-xs text-on-surface-variant">Create your first Quest to start attracting participants.</p>
              <button onClick={() => router.push("/business/quests/new")}
                className="h-9 px-5 rounded-xl bg-secondary text-white text-sm font-bold flex items-center gap-2 tap-target">
                <Plus size={16} /> Create Quest
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {activeQuests.map(quest => (
                <Link key={quest.id} href={`/quests/${quest.id}`}>
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-outline-variant hover:bg-surface-container-low transition-colors">
                    <div className="w-14 h-14 rounded-xl bg-surface-container overflow-hidden shrink-0">
                      {quest.cover_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={quest.cover_url} alt={quest.title} className="w-full h-full object-cover" />
                        : <div className="flex h-full w-full items-center justify-center bg-surface-container-high"><Trophy size={20} className="text-on-surface-variant opacity-50" aria-hidden="true" /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{quest.title}</p>
                      {quest.description && <p className="text-xs text-on-surface-variant truncate mt-0.5">{quest.description}</p>}
                      <span className="inline-flex items-center gap-1 mt-1 text-label-sm font-semibold text-on-success-container bg-success-container px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" /> Active
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-on-surface">{quest.participant_count}</p>
                      <p className="text-label-sm text-on-surface-variant">Participants</p>
                    </div>
                    <ChevronRight size={16} className="text-on-surface-variant shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        </div>

        {/* ── Aside: monitoring ──────────────────────────────────────── */}
        <div className="flex flex-col gap-5">

        {/* ── Business Tools ───────────────────────────────────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-5 py-5 elev-1 surface-raised">
          <h2 className="text-body-lg font-black text-on-surface mb-1">Business Tools</h2>
          <p className="text-sm text-on-surface-variant mb-4">Manage your challenges, verify participants and track your impact on STRIVUP.</p>
          <div className="grid grid-cols-2 gap-3">
            {TOOLS.map(tool => (
              <div key={tool.title} className="rounded-2xl border border-outline-variant p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl ${tool.bg} flex items-center justify-center`}>{tool.icon}</div>
                  {tool.badge > 0 && (
                    <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-warning text-white text-label-sm font-bold flex items-center justify-center">
                      {tool.badge > 99 ? "99+" : tool.badge}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-on-surface">{tool.title}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5 leading-snug">{tool.desc}</p>
                </div>
                {tool.cta.primary ? (
                  <Link href={tool.cta.href}>
                    <span className="w-full h-9 rounded-xl bg-secondary hover:opacity-90 text-white text-xs font-bold flex items-center justify-center transition-colors">
                      {tool.cta.label}
                    </span>
                  </Link>
                ) : (
                  <Link href={tool.cta.href} className="text-sm text-secondary font-semibold flex items-center gap-1">
                    {tool.cta.label} <ChevronRight size={14} />
                  </Link>
                )}
              </div>
            ))}
          </div>

          {/* ── More tools ───────────────────────────────────────────── */}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-outline-variant pt-4 sm:grid-cols-5 lg:grid-cols-3">
            {QUICK_LINKS.map(q => (
              <Link key={q.href} href={q.href} className="flex flex-col items-center gap-1.5 rounded-xl py-2 hover:bg-surface-container-low transition-colors">
                <div className={`w-9 h-9 rounded-xl ${q.bg} flex items-center justify-center`}>{q.icon}</div>
                <span className="text-label-sm font-medium text-on-surface-variant text-center leading-tight">{q.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Quest Stats Row ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Total Quests", value: questStats.total,         color: "text-secondary" },
            { label: "Active",       value: questStats.active,        color: "text-on-success-container" },
            { label: "Participants", value: questStats.participants,   color: "text-chart-3" },
            { label: "Pending Proof",value: questStats.pending_proofs, color: questStats.pending_proofs > 0 ? "text-on-warning-container" : "text-on-surface-variant" },
          ].map(s => (
            <div key={s.label} className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-3 flex flex-col items-center elev-1 surface-raised">
              <span className={`text-xl font-black ${s.color}`}>{s.value}</span>
              <span className="text-label-sm text-on-surface-variant font-medium mt-0.5 text-center leading-tight">{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Recent Activity ───────────────────────────────────────────── */}
        {verifs.length > 0 && (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-5 py-5 elev-1 surface-raised">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body-lg font-black text-on-surface">Recent Activity</h2>
              <Link href="/business/verification/history" className="text-sm text-secondary font-semibold">View all</Link>
            </div>
            <div className="flex flex-col gap-0">
              {verifs.map(req => {
                const participant = req.participant as { full_name: string | null; avatar_url: string | null } | undefined;
                const pName = participant?.full_name ?? "Unknown";
                const actionLabel = req.status === "approved" ? "completed a verification" : "requested verification";
                const statusCfg = {
                  approved: { label: "Verified",  cls: "text-on-success-container bg-success-container" },
                  pending:  { label: "Pending",   cls: "text-on-warning-container bg-warning-container" },
                  rejected: { label: "Rejected",  cls: "text-on-error-container bg-error-container" },
                  expired:  { label: "Expired",   cls: "text-on-surface-variant bg-surface-container-low" },
                } as const;
                const sc = statusCfg[req.status as keyof typeof statusCfg] ?? statusCfg.expired;
                return (
                  <div key={req.id} className="flex items-center gap-3 py-3 border-b border-outline-variant last:border-0">
                    <div className="w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center shrink-0 text-sm font-bold text-secondary">
                      {pName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-on-surface">
                        <span className="font-semibold">{pName}</span>{" "}{actionLabel}
                      </p>
                      <p className="text-xs text-on-surface-variant">{timeAgo(req.created_at)}</p>
                    </div>
                    <span className={`text-label-sm font-bold px-2.5 py-1 rounded-full shrink-0 ${sc.cls}`}>{sc.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
        </div>
      </div>
    </div>
  );
}
