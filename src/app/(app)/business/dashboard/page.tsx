"use client";
/**
 * /business/dashboard — Main business hub matching the STRIVUP design.
 * Shows: profile header with stats, business tools grid, active campaigns, recent activity.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, Bell, BookOpen, CheckCircle2, CheckSquare, ChevronRight,
  Circle, Clock, Gift, HelpCircle, Plus, Receipt, Search, ShieldCheck, Store, Trophy,
  TrendingUp, Users, XCircle, Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUnreadCount } from "@/components/ui/AlertsContext";
import { MobileMenu } from "@/components/ui/MobileMenu";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { StringKey as TKey } from "@/lib/i18n/businessStrings";
import { getMyProfile, type Profile } from "@/lib/supabase/profile";
import { getBusinessMetrics, EMPTY_BUSINESS_METRICS, type BusinessMetrics } from "@/lib/data/businessMetrics";
import { getMyBusinessProfile, getBusinessVerifications, getVerificationInsights, type BusinessProfile, type VerificationRequest } from "@/lib/data/business";

/** The console that actually works against the live database functions. */
const VERIFY_HREF = "/business/order-verification";

/** Relative time, worded by the caller's language rather than hardcoded. */
function timeAgo(d: string, t: (k: TKey) => string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return t("time.justNow");
  if (m < 60) return `${m} ${t(m !== 1 ? "time.minutes" : "time.minute")} ${t("time.ago")}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${t(h !== 1 ? "time.hours" : "time.hour")} ${t("time.ago")}`;
  const d2 = Math.floor(h / 24);
  return `${d2} ${t(d2 !== 1 ? "time.days" : "time.day")} ${t("time.ago")}`;
}

/** 950 -> "950", 1200 -> "1.2K", 12400 -> "12.4K", 1500000 -> "1.5M" */
function compactNum(n: number) {
  const fmt = (v: number, suffix: string) => `${v.toFixed(1).replace(/\.0$/, "")}${suffix}`;
  if (n >= 1_000_000) return fmt(n / 1_000_000, "M");
  if (n >= 1_000) return fmt(n / 1_000, "K");
  return String(n);
}

function StatusBadge({ status }: { status: BusinessProfile["verification_status"] }) {
  const { t } = useLocale();
  const map = {
    verified:     { Icon: CheckCircle2,  label: "status.verified"    as TKey, cls: "text-on-success-container bg-success-container border-success-outline" },
    submitted:    { Icon: Clock,         label: "status.underReview" as TKey, cls: "text-secondary bg-secondary-fixed border-secondary-fixed-dim" },
    under_review: { Icon: Clock,         label: "status.underReview" as TKey, cls: "text-secondary bg-secondary-fixed border-secondary-fixed-dim" },
    needs_more_info: { Icon: HelpCircle, label: "status.needsInfo"   as TKey, cls: "text-on-secondary-fixed bg-secondary-fixed border-secondary-fixed-dim" },
    incomplete:   { Icon: Circle,        label: "status.notVerified" as TKey, cls: "text-on-surface-variant bg-surface-container-low border-outline-variant" },
    draft:        { Icon: Circle,        label: "status.notVerified" as TKey, cls: "text-on-surface-variant bg-surface-container-low border-outline-variant" },
    rejected:     { Icon: XCircle,       label: "status.rejected"    as TKey, cls: "text-on-error-container bg-error-container border-error-outline" },
    suspended:    { Icon: XCircle,       label: "status.suspended"   as TKey, cls: "text-on-error-container bg-error-container border-error-outline" },
  };
  const c = map[status] ?? map.draft;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-body-sm font-semibold ${c.cls}`}>
      <c.Icon size={13} aria-hidden="true" /> {t(c.label)}
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
  /* The signed-in person, not the business: the top-right corner shows who is
     driving the console, which is a user even while they are in business mode. */
  const [me, setMe] = useState<Profile | null>(null);
  /* The four headline tiles. business_profiles carries total_customers and
     friends, but nothing maintains them, so every business reads 0 there.
     These are counted from live rows instead. */
  const [metrics, setMetrics] = useState<BusinessMetrics>(EMPTY_BUSINESS_METRICS);
  const { t } = useLocale();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const profile = await getMyBusinessProfile(supabase);
      if (!profile) { router.replace("/business/onboarding"); return; }
      if (!profile.onboarding_done) { router.replace("/business/onboarding"); return; }
      setBp(profile);

      const [v, ins, myProfile] = await Promise.all([
        getBusinessVerifications(supabase, profile.id, { limit: 3 }),
        getVerificationInsights(supabase, profile.id),
        getMyProfile(),
      ]);
      setVerifs(v);
      setInsights(ins);
      setMe(myProfile);

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

      setMetrics(await getBusinessMetrics(supabase, profile.id, allQuests.map((q: { id: string }) => q.id)));
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

  const name = bp.business_name || t("biz.yourBusiness");
  const city = [bp.city, bp.state].filter(Boolean).join(", ");

  /*
   * CHANGED: this used to be two lists in two visual styles — four big cards
   * with a title, a sentence and their own button, then five small icon
   * links under a rule. Nine destinations, drawn two different ways, in a
   * column already carrying a stats row and an activity feed. That is the
   * clutter.
   *
   * One list now, one tile, ordered by how often a counter actually touches
   * it. The pending count still rides its own tile, because a number nobody
   * can see is not a queue.
   */
  const TOOL_TILES: {
    icon: React.ReactNode; bg: string; label: string; href: string; badge?: number;
  }[] = [
    { icon: <ShieldCheck size={19} className="text-secondary" />,       bg: "bg-secondary-fixed",     label: t("tools.verification"), href: VERIFY_HREF },
    { icon: <Clock size={19} className="text-warning" />,               bg: "bg-warning-container",   label: t("tools.pending"),      href: VERIFY_HREF, badge: insights.pending },
    { icon: <CheckSquare size={19} className="text-warning" />,         bg: "bg-warning-container",   label: t("tools.proofs"),       href: "/business/proof-verification" },
    { icon: <Users size={19} className="text-chart-3" />,               bg: "bg-chart-3/10",          label: t("stat.participants"),  href: "/business/participants" },
    { icon: <TrendingUp size={19} className="text-success" />,          bg: "bg-success-container",   label: t("tools.analytics"),    href: "/business/analytics" },
    { icon: <Gift size={19} className="text-warning" />,                bg: "bg-warning-container",   label: t("tools.rewards"),      href: "/business/rewards" },
    { icon: <Zap size={19} className="text-secondary" />,               bg: "bg-secondary-fixed",     label: t("tools.promote"),      href: "/business/promote" },
    { icon: <BookOpen size={19} className="text-on-surface-variant" />, bg: "bg-surface-container-low", label: t("tools.history"),    href: "/business/verification/history" },
    { icon: <HelpCircle size={19} className="text-chart-3" />,          bg: "bg-chart-3/10",          label: t("tools.how"),          href: "/business/verification/how-it-works" },
  ];

  return (
    <div className="min-h-screen bg-surface pb-28">
      {/* ── Top Nav ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b border-outline-variant bg-surface-container-lowest">
        {/* Left is the hamburger, which in business mode holds exactly one
            thing: Switch to User Mode. Right is the signed-in PERSON, not the
            business — the business already identifies itself in the profile
            card below, and what the corner answers is "whose account is
            this?". The business logo therefore moved out of this row. */}
        <div className="mx-auto grid measure-wide grid-cols-[auto_1fr_auto] items-center gap-2 px-5 py-4 lg:px-8">
        <div className="flex items-center">
          <MobileMenu />
          {/* md+ has the sidebar, so the hamburger hides there and the slot
              would otherwise collapse and shove the wordmark left. */}
          <span className="hidden h-11 w-2 md:block" aria-hidden="true" />
        </div>
        <span className="text-center font-black text-on-surface text-body-lg tracking-tight">STRIVUP</span>
        <div className="flex items-center justify-end gap-1.5">
          <Link href="/search" aria-label={t("nav.search")}
            className="flex w-9 h-9 rounded-xl bg-surface-container items-center justify-center tap-target">
            <Search size={16} className="text-on-surface-variant" />
          </Link>
          <Link href="/alerts" aria-label={unreadCount > 0 ? `${t("nav.alerts")}, ${unreadCount}` : t("nav.alerts")}
            className="relative w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center">
            <Bell size={16} className="text-on-surface-variant" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-error ring-2 ring-surface-container-lowest" />
            )}
          </Link>
          <Link href="/profile" aria-label={t("nav.yourProfile")}
            className="flex items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
            <UserAvatar src={me?.avatar_url} name={me?.full_name ?? me?.username} size={32}
              className="border border-outline-variant" />
          </Link>
          </div>
        </div>

        {/* The language choice gets its own full-width row rather than a
            fifth control squeezed into the one above. On a 360px phone the
            header row has no room left, and a toggle nobody can find is not
            a toggle. */}
        <div className="mx-auto flex measure-wide items-center justify-end border-t border-outline-variant px-5 py-2 lg:px-8">
          <LanguageToggle />
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
              <AlertTriangle size={15} aria-hidden="true" /> {t("reject.title")}
            </p>
            <p className="text-sm text-on-error-container">{bp.rejection_reason || t("reject.fallback")}</p>
            <button onClick={() => router.push("/business/onboarding")}
              className="mt-2 px-4 py-1.5 rounded-xl border border-error-outline text-on-error-container text-sm font-semibold tap-target">
              {t("reject.resubmit")}
            </button>
          </div>
        )}

        {/* ── Profile Header ───────────────────────────────────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-5 py-5 elev-1 surface-raised">
          {/* Same squeeze the quest task list had: logo 64px, a shrink-0 Edit
              Profile button around 110px and three gaps left about 80px of a
              360px row for a 20px-black business name. Stacks below sm. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 items-start gap-4">
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
                  <VerifiedBadge type="business" size={20} title={t("biz.verified")} />
                )}
              </div>
              {bp.business_username && <p className="text-sm text-on-surface-variant">@{bp.business_username}</p>}
              {(bp.category || city) && (
                <p className="text-sm text-on-surface-variant truncate">{[bp.category, city].filter(Boolean).join(" · ")}</p>
              )}
            </div>
          </div>

            {/* Edit Profile, and directly under it the one action a counter
                actually opens this dashboard to perform. It points at
                /business/order-verification: the other console reads a table
                that no database function writes any more, so it can never
                find a code. */}
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
              <button onClick={() => router.push("/business/settings")}
                className="flex h-11 w-full shrink-0 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest text-body-md font-semibold text-on-surface-variant elev-1 surface-raised hover:bg-surface-container-low sm:w-auto sm:px-4">
                {t("biz.editProfile")}
              </button>
              <button onClick={() => router.push(VERIFY_HREF)}
                className="flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-secondary text-body-md font-bold text-white elev-brand transition-opacity hover:opacity-90 sm:w-auto sm:px-4">
                <ShieldCheck size={16} aria-hidden="true" /> {t("biz.verifyParticipants")}
              </button>
            </div>
          </div>

          {/* ── Stats row ────────────────────────────────────────────── */}
          {/* gap-px over a tinted track draws the hairlines, so they land correctly
              whether this is two columns or four. The old border-l on every
              tile but the first only worked while it was a single row. */}
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-outline-variant bg-outline-variant sm:grid-cols-4">
            {([
              /* Customers: both sides of the OTP handshake done AND at least
                 one approved task in that same quest. Orders replaces Rating,
                 which had no source of ratings behind it. */
              { label: "stat.customers",    value: compactNum(metrics.customers) },
              { label: "stat.challenges",   value: compactNum(metrics.challenges) },
              { label: "stat.participants", value: compactNum(metrics.participants) },
              { label: "stat.orders",       value: compactNum(metrics.orders), icon: metrics.orders > 0 },
            ] as { label: TKey; value: string; icon?: boolean }[]).map((s) => (
              <div key={s.label} className="flex flex-col items-center bg-surface-container-low py-3">
                <span className="flex items-center gap-1 text-headline-sm font-black text-on-surface">
                  {s.value}
                  {s.icon && <Receipt size={13} className="text-secondary" aria-hidden="true" />}
                </span>
                <span className="text-label-sm text-on-surface-variant font-medium mt-0.5 text-center leading-tight px-1">{t(s.label)}</span>
              </div>
            ))}
          </div>

          {/* Verification status → blue tick request */}
          <Link href="/business/verify-business"
            className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-outline-variant min-h-11 hover:opacity-80">
            <span className="text-sm text-on-surface-variant">{t("biz.businessVerification")}</span>
            <span className="flex items-center gap-2">
              <StatusBadge status={bp.verification_status} />
              {["draft", "incomplete", "rejected", "needs_more_info"].includes(bp.verification_status) && (
                <span className="text-sm font-semibold text-secondary">{t("biz.verifyNow")}</span>
              )}
            </span>
          </Link>
        </div>

        {/* ── Quick Actions ─────────────────────────────────────────── */}
        {/* Quests on the first row, challenges on the second, each with its
            own create-and-browse pair so the two campaign types read as
            siblings rather than one being buried inside the other. */}
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <button onClick={() => router.push("/business/quests/new")}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-secondary hover:opacity-90 text-white font-bold text-sm transition-all elev-brand">
            <Plus size={18} /> {t("action.createQuest")}
          </button>
          <button onClick={() => router.push("/business/quests")}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface-variant font-semibold text-sm hover:bg-surface-container-low transition-all elev-1 surface-raised">
            {t("action.myQuests")}
          </button>
          <button onClick={() => router.push("/business/challenges/new")}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-secondary hover:opacity-90 text-white font-bold text-sm transition-all elev-brand">
            <Plus size={18} /> {t("action.createChallenge")}
          </button>
          <button onClick={() => router.push("/business/challenges")}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface-variant font-semibold text-sm hover:bg-surface-container-low transition-all elev-1 surface-raised">
            {t("action.myChallenges")}
          </button>
        </div>

        {/* ── Active Quests ─────────────────────────────────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-5 py-5 elev-1 surface-raised">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body-lg font-black text-on-surface">{t("camp.heading")}</h2>
            <Link href="/business/quests" className="text-sm text-secondary font-semibold">{t("camp.viewAll")}</Link>
          </div>
          {activeQuests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <TrendingUp size={32} className="text-on-surface-variant" />
              <p className="text-sm font-semibold text-on-surface-variant">{t("camp.emptyTitle")}</p>
              <p className="text-xs text-on-surface-variant">{t("camp.emptyBody")}</p>
              <button onClick={() => router.push("/business/quests/new")}
                className="h-9 px-5 rounded-xl bg-secondary text-white text-sm font-bold flex items-center gap-2 tap-target">
                <Plus size={16} /> {t("action.createQuest")}
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
                        <span className="w-1.5 h-1.5 rounded-full bg-success" /> {t("camp.active")}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-on-surface">{quest.participant_count}</p>
                      <p className="text-label-sm text-on-surface-variant">{t("camp.participants")}</p>
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

        {/* ── Tools ────────────────────────────────────────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-5 py-5 elev-1 surface-raised">
          <h2 className="text-body-lg font-black text-on-surface">{t("tools.heading")}</h2>
          <p className="mt-0.5 mb-4 text-sm text-on-surface-variant">{t("tools.sub")}</p>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3">
            {TOOL_TILES.map((tool) => (
              <Link
                key={tool.href + tool.label}
                href={tool.href}
                className="flex flex-col items-center gap-1.5 rounded-xl py-2.5 transition-colors hover:bg-surface-container-low tap-target"
              >
                <span className={`relative flex h-10 w-10 items-center justify-center rounded-xl ${tool.bg}`}>
                  {tool.icon}
                  {tool.badge ? (
                    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-warning px-1 text-label-sm font-bold leading-none text-white">
                      {tool.badge > 99 ? "99+" : tool.badge}
                    </span>
                  ) : null}
                </span>
                <span className="text-center text-label-sm font-medium leading-tight text-on-surface-variant">
                  {tool.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Quest numbers ────────────────────────────────────────────
            A slim strip, not four more cards. Participants is gone from
            here: the profile card above already states it, and the same
            number twice on one screen is how two numbers end up
            disagreeing. */}
        <div className="flex items-stretch gap-px overflow-hidden rounded-2xl border border-outline-variant bg-outline-variant elev-1">
          {[
            { label: t("stat.totalQuests"),  value: questStats.total,          color: "text-on-surface" },
            { label: t("stat.active"),       value: questStats.active,         color: "text-on-success-container" },
            { label: t("stat.pendingProof"), value: questStats.pending_proofs, color: questStats.pending_proofs > 0 ? "text-on-warning-container" : "text-on-surface-variant" },
          ].map((s2) => (
            <div key={s2.label} className="flex flex-1 flex-col items-center bg-surface-container-lowest py-3">
              <span className={`text-headline-sm font-black ${s2.color}`}>{s2.value}</span>
              <span className="mt-0.5 px-1 text-center text-label-sm font-medium leading-tight text-on-surface-variant">
                {s2.label}
              </span>
            </div>
          ))}
        </div>

        {/* ── Recent Activity ───────────────────────────────────────────── */}
        {verifs.length > 0 && (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-5 py-5 elev-1 surface-raised">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body-lg font-black text-on-surface">{t("recent.heading")}</h2>
              <Link href="/business/verification/history" className="text-sm text-secondary font-semibold">{t("tools.viewAll")}</Link>
            </div>
            <div className="flex flex-col gap-0">
              {verifs.map(req => {
                const participant = req.participant as { full_name: string | null; avatar_url: string | null } | undefined;
                const pName = participant?.full_name ?? t("recent.unknown");
                const actionLabel = req.status === "approved" ? t("recent.completed") : t("recent.requested");
                const statusCfg = {
                  approved: { label: t("status.verified"), cls: "text-on-success-container bg-success-container" },
                  pending:  { label: t("recent.pending"),  cls: "text-on-warning-container bg-warning-container" },
                  rejected: { label: t("status.rejected"), cls: "text-on-error-container bg-error-container" },
                  expired:  { label: t("recent.expired"),  cls: "text-on-surface-variant bg-surface-container-low" },
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
                      <p className="text-xs text-on-surface-variant">{timeAgo(req.created_at, t)}</p>
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
