"use client";
/**
 * /business/dashboard — Main business hub matching the STRIVUP design.
 * Shows: profile header with stats, business tools grid, active campaigns, recent activity.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, ChevronRight, Clock, Edit2, Plus, ShieldCheck, Store, TrendingUp, Users, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile, getBusinessVerifications, getVerificationInsights, type BusinessProfile, type VerificationRequest } from "@/lib/data/business";

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m} hour${m !== 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? "s" : ""} ago`;
  return `${Math.floor(h / 24)} day${Math.floor(h/24) !== 1 ? "s" : ""} ago`;
}

function StatusBadge({ status }: { status: BusinessProfile["verification_status"] }) {
  const map = {
    verified:     { icon: "✓", label: "Verified",     cls: "text-green-700 bg-green-50 border-green-200" },
    submitted:    { icon: "⏳", label: "Under Review", cls: "text-blue-700 bg-blue-50 border-blue-200" },
    under_review: { icon: "⏳", label: "Under Review", cls: "text-blue-700 bg-blue-50 border-blue-200" },
    incomplete:   { icon: "⚠",  label: "Incomplete",  cls: "text-amber-700 bg-amber-50 border-amber-200" },
    draft:        { icon: "○",  label: "Draft",        cls: "text-gray-500 bg-gray-50 border-gray-200" },
    rejected:     { icon: "✕",  label: "Rejected",     cls: "text-red-700 bg-red-50 border-red-200" },
    suspended:    { icon: "✕",  label: "Suspended",    cls: "text-red-700 bg-red-50 border-red-200" },
  };
  const c = map[status] ?? map.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.cls}`}>
      {c.icon} {c.label}
    </span>
  );
}

export default function BusinessDashboardPage() {
  const router = useRouter();
  const supabase = createClient();
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
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
    </div>
  );
  if (!bp) return null;

  const name = bp.business_name || "Your Business";
  const city = [bp.city, bp.state].filter(Boolean).join(", ");

  const TOOLS = [
    {
      icon: <ShieldCheck size={22} className="text-blue-600" />,
      bg: "bg-blue-50",
      title: "Verification",
      desc: "Verify participant activities and business visits.",
      cta: { label: "Verify Participant →", href: "/business/verification", primary: true },
    },
    {
      icon: <BookOpen size={22} className="text-gray-500" />,
      bg: "bg-gray-50",
      title: "Verification History",
      desc: "View all past verifications.",
      cta: { label: "View all", href: "/business/verification/history", primary: false },
    },
    {
      icon: <Clock size={22} className="text-amber-500" />,
      bg: "bg-amber-50",
      title: "Proof Review",
      desc: "Approve or reject participant proof submissions.",
      cta: { label: "Review Proofs", href: "/business/proof-verification", primary: false },
    },
    {
      icon: <TrendingUp size={22} className="text-green-500" />,
      bg: "bg-green-50",
      title: "Analytics",
      desc: "Track Quest performance and participant engagement.",
      cta: { label: "View Analytics", href: "/business/analytics", primary: false },
    },
    {
      icon: <Users size={22} className="text-purple-500" />,
      bg: "bg-purple-50",
      title: "Participants",
      desc: "See who's joined your Quests.",
      cta: { label: "View All", href: "/business/participants", primary: false },
    },
    {
      icon: <BookOpen size={22} className="text-orange-500" />,
      bg: "bg-orange-50",
      title: "Rewards",
      desc: "Manage reward eligibility and fulfillment.",
      cta: { label: "Manage Rewards", href: "/business/rewards", primary: false },
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28">
      {/* ── Top Nav ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Link href="/business/profile">
            {bp.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={bp.logo_url} alt={bp.business_name ?? ""} className="w-8 h-8 rounded-xl object-cover border border-gray-200" />
              : <div className="w-8 h-8 rounded-xl bg-blue-50 border border-gray-200 flex items-center justify-center"><Store size={16} className="text-blue-600" /></div>
            }
          </Link>
          <span className="font-black text-gray-900 text-[15px] tracking-tight truncate max-w-[140px]">
            {bp.business_name ?? "STRIVUP BIZ"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/business/promote" title="Promote Quest">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <Zap size={16} className="text-blue-600" />
            </div>
          </Link>
          <Link href="/business/settings">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
              <Edit2 size={16} className="text-gray-600" />
            </div>
          </Link>
        </div>
      </div>

      <div className="px-5 py-5 max-w-lg mx-auto flex flex-col gap-5">

        {/* ── Rejection Banner ────────────────────────────────────────── */}
        {bp.verification_status === "rejected" && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4">
            <p className="text-sm font-bold text-red-700 mb-1">⚠ Verification Rejected</p>
            <p className="text-sm text-red-600">{bp.rejection_reason || "Your verification was rejected."}</p>
            <button onClick={() => router.push("/business/onboarding")}
              className="mt-2 px-4 py-1.5 rounded-lg border border-red-300 text-red-700 text-sm font-semibold">
              Resubmit
            </button>
          </div>
        )}

        {/* ── Profile Header ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
          <div className="flex items-start gap-4">
            {/* Logo */}
            <div className="w-16 h-16 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0 border border-gray-200">
              {bp.logo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={bp.logo_url} alt={name} className="w-full h-full object-cover" />
                : <Store size={28} className="text-gray-400" />
              }
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[18px] font-black text-gray-900">{name}</h1>
                {bp.verification_status === "verified" && (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-label="Verified"><circle cx="9" cy="9" r="9" fill="#3B82F6"/><path d="M5 9l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                )}
              </div>
              {bp.business_username && <p className="text-sm text-gray-500">@{bp.business_username}</p>}
              {bp.category && <p className="text-sm text-gray-500">{bp.category}</p>}
              {city && <p className="text-sm text-gray-400">{city}</p>}
            </div>
            <button onClick={() => router.push("/business/settings")}
              className="px-4 py-1.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 shrink-0">
              Edit Profile
            </button>
          </div>

          {/* ── Stats row ────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 mt-5 border border-gray-100 rounded-xl overflow-hidden">
            {[
              { label: "Customers",    value: bp.total_customers.toLocaleString() },
              { label: "Challenges",   value: bp.total_challenges.toLocaleString() },
              { label: "Participants", value: bp.total_participants.toLocaleString() },
              { label: "Rating",       value: bp.rating > 0 ? `${bp.rating}★` : "—" },
            ].map((s, i) => (
              <div key={s.label} className={`flex flex-col items-center py-3 bg-gray-50/50 ${i > 0 ? "border-l border-gray-100" : ""}`}>
                <span className="text-lg font-black text-gray-900">{s.value}</span>
                <span className="text-[10px] text-gray-400 font-medium mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Verification status */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-500">Business Verification</span>
            <StatusBadge status={bp.verification_status} />
          </div>
        </div>

        {/* ── Quick Actions ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => router.push("/business/quests/new")}
            className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-sm shadow-blue-200">
            <Plus size={18} /> Create Quest
          </button>
          <button onClick={() => router.push("/business/quests")}
            className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-white border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-all">
            My Quests →
          </button>
        </div>

        {/* ── Business Tools ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
          <h2 className="text-[17px] font-black text-gray-900 mb-1">Business Tools</h2>
          <p className="text-sm text-gray-500 mb-4">Manage your challenges, verify participants and track your impact on STRIVUP.</p>
          <div className="grid grid-cols-2 gap-3">
            {TOOLS.map(tool => (
              <div key={tool.title} className="rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
                <div className={`w-10 h-10 rounded-xl ${tool.bg} flex items-center justify-center`}>{tool.icon}</div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{tool.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{tool.desc}</p>
                </div>
                {tool.cta.primary ? (
                  <Link href={tool.cta.href}>
                    <button className="w-full h-9 rounded-xl bg-blue-600 text-white text-xs font-bold">
                      {tool.cta.label}
                    </button>
                  </Link>
                ) : (
                  <Link href={tool.cta.href} className="text-sm text-blue-600 font-semibold flex items-center gap-1">
                    {tool.cta.label} <ChevronRight size={14} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Quest Stats Row ───────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total Quests", value: questStats.total,         color: "text-blue-600" },
            { label: "Active",       value: questStats.active,        color: "text-green-600" },
            { label: "Participants", value: questStats.participants,   color: "text-purple-600" },
            { label: "Pending Proof",value: questStats.pending_proofs, color: questStats.pending_proofs > 0 ? "text-amber-600" : "text-gray-400" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-3 flex flex-col items-center">
              <span className={`text-xl font-black ${s.color}`}>{s.value}</span>
              <span className="text-[9px] text-gray-400 font-medium mt-0.5 text-center leading-tight">{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Active Quests ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[17px] font-black text-gray-900">Your Active Campaigns</h2>
            <Link href="/business/quests" className="text-sm text-blue-600 font-semibold">View all</Link>
          </div>
          {activeQuests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <TrendingUp size={32} className="text-gray-300" />
              <p className="text-sm font-semibold text-gray-700">No active Quests yet</p>
              <p className="text-xs text-gray-400">Create your first Quest to start attracting participants.</p>
              <button onClick={() => router.push("/business/quests/new")}
                className="h-9 px-5 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center gap-2">
                <Plus size={16} /> Create Quest
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {activeQuests.map(quest => (
                <Link key={quest.id} href={`/quests/${quest.id}`}>
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                      {quest.cover_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={quest.cover_url} alt={quest.title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-2xl">🏆</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{quest.title}</p>
                      {quest.description && <p className="text-xs text-gray-400 truncate mt-0.5">{quest.description}</p>}
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-gray-900">{quest.participant_count}</p>
                      <p className="text-[10px] text-gray-400">Participants</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Recent Activity ───────────────────────────────────────────── */}
        {verifs.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-black text-gray-900">Recent Activity</h2>
              <Link href="/business/verification/history" className="text-sm text-blue-600 font-semibold">View all</Link>
            </div>
            <div className="flex flex-col gap-0">
              {verifs.map(req => {
                const participant = req.participant as { full_name: string | null; avatar_url: string | null } | undefined;
                const pName = participant?.full_name ?? "Unknown";
                const actionLabel = req.status === "approved" ? "completed a verification" : "requested verification";
                const statusCfg = {
                  approved: { label: "Verified",  cls: "text-green-700 bg-green-50" },
                  pending:  { label: "Pending",   cls: "text-amber-700 bg-amber-50" },
                  rejected: { label: "Rejected",  cls: "text-red-700 bg-red-50" },
                  expired:  { label: "Expired",   cls: "text-gray-500 bg-gray-50" },
                } as const;
                const sc = statusCfg[req.status as keyof typeof statusCfg] ?? statusCfg.expired;
                return (
                  <div key={req.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 text-sm font-bold text-blue-600">
                      {pName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">
                        <span className="font-semibold">{pName}</span>{" "}{actionLabel}
                      </p>
                      <p className="text-xs text-gray-400">{timeAgo(req.created_at)}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${sc.cls}`}>{sc.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
