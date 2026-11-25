"use client";
/**
 * /business/order-verification — the counter-side console.
 *
 * A STRIVUP order code arrives written in the order description on Zomato or
 * Swiggy. Staff search it here, confirm the order is real, and STRIVUP hands
 * back a BILL code to write on the printed bill. The participant then types
 * that bill code into their Quest to close the task.
 *
 * Verifying twice is safe: the same bill code comes back, so a second lookup
 * mid-shift never invalidates a code already written on a bill.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle, ArrowLeft, CalendarDays, Check, CheckCircle2, Clock, Copy,
  Loader2, Receipt, RefreshCw, Search, ShieldCheck, Trophy, User, XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { getMyBusinessProfile } from "@/lib/data/business";
import { getBusinessQuests } from "@/lib/data/businessQuests";
import {
  getPendingVerifications, lookupOrderDetail, rejectOrderCode, verifyOrderCode,
  type OrderCodeDetail, type OrderCodeLookup,
} from "@/lib/data/questOrderVerification";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Loose match for the live filter.
 *
 * Staff read a code off a phone screen or a printed slip and often type only
 * the digits they can make out, so the comparison drops the SV- prefix and
 * every separator from both sides and asks whether what they typed appears
 * anywhere in the code. Participant names match too, for the case where the
 * code is unreadable but the customer is standing there.
 */
function normalise(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function matchesQuery(v: OrderCodeLookup, query: string): boolean {
  const q = normalise(query);
  if (!q) return true;
  const bare = q.startsWith("SV") ? q.slice(2) : q;
  const code = normalise(v.order_code);
  if (code.includes(q) || (bare.length > 0 && code.includes(bare))) return true;
  return (v.participant_name ?? "").toUpperCase().includes(query.trim().toUpperCase());
}

function ProfileStat({
  icon: Icon, value, label,
}: {
  icon: typeof Trophy;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl bg-surface-container-lowest border border-outline-variant px-2.5 py-2 elev-1 surface-raised">
      <div className="flex items-center gap-1.5">
        <Icon size={11} className="text-on-surface-variant shrink-0" aria-hidden="true" />
        <p className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant truncate">
          {label}
        </p>
      </div>
      <p className="text-sm font-bold text-on-surface mt-0.5 truncate">{value}</p>
    </div>
  );
}

export default function BusinessOrderVerificationPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [questIds, setQuestIds] = useState<string[]>([]);
  const [queue, setQueue] = useState<OrderCodeLookup[]>([]);

  const [code, setCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<OrderCodeDetail | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [billCode, setBillCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { t } = useLocale();

  /* Derived, not state: the filter is a view of the queue already in memory,
     so typing costs no round trip and cannot race the queue load. */
  const filtered = queue.filter((v) => matchesQuery(v, code));
  const filtering = code.trim().length > 0;

  const loadQueue = useCallback(async (ids: string[]) => {
    setQueue(await getPendingVerifications(supabase, ids));
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login?redirectTo=/business/order-verification"); return; }

      const profile = await getMyBusinessProfile(supabase);
      if (!profile?.onboarding_done) { router.replace("/business/onboarding"); return; }

      const quests = await getBusinessQuests(supabase, profile.id, { limit: 50 });
      const ids = quests.map((q) => q.id);
      setQuestIds(ids);
      await loadQueue(ids);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(async (raw?: string) => {
    const query = (raw ?? code).trim();
    if (!query) { setError(t("ov.enterCode")); return; }

    setSearching(true);
    setError(null);
    setMatch(null);
    setBillCode(null);

    const res = await lookupOrderDetail(supabase, query);
    setSearching(false);

    if (!res.ok) { setError(res.error); return; }
    if (res.data.length === 0) {
      setError(`No STRIVUP verification found for “${query.toUpperCase()}”.`);
      return;
    }

    const found = res.data[0];
    setMatch(found);
    if (found.status === "order_verified" && found.bill_code) {
      setBillCode(found.bill_code);
    }
  }, [code, supabase, t]);

  const handleVerify = useCallback(async () => {
    if (!match) return;
    setVerifying(true);
    setError(null);

    const res = await verifyOrderCode(supabase, match.order_code);
    setVerifying(false);

    if (!res.ok) { setError(res.error); return; }

    setBillCode(res.data.bill_code);
    setMatch({ ...match, status: res.data.status, bill_code: res.data.bill_code });
    void loadQueue(questIds);
  }, [match, supabase, questIds, loadQueue]);

  const handleReject = useCallback(async () => {
    if (!match) return;
    setRejecting(true);
    setError(null);

    const res = await rejectOrderCode(supabase, match.order_code, rejectReason.trim() || undefined);
    setRejecting(false);

    if (!res.ok) { setError(res.error); return; }

    setShowReject(false);
    setRejectReason("");
    setMatch({ ...match, status: res.data.status });
    void loadQueue(questIds);
  }, [match, rejectReason, supabase, questIds, loadQueue]);

  const handleCopyBill = useCallback(async () => {
    if (!billCode) return;
    try {
      await navigator.clipboard.writeText(billCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy blocked by your browser — read the code above instead.");
    }
  }, [billCode]);

  const reset = () => {
    setCode(""); setMatch(null); setBillCode(null); setError(null);
    setShowReject(false); setRejectReason("");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <Loader2 size={26} className="text-secondary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-24">

      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-14 measure-page items-center gap-2 px-4 sm:gap-3 lg:px-8">
          <Link
            href="/business/dashboard"
            aria-label={t("ov.backToDashboard")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-secondary"
          >
            <ArrowLeft size={18} className="text-on-surface-variant" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-extrabold leading-tight tracking-tight text-on-surface sm:text-lg">{t("ov.title")}</h1>
          </div>
          <LanguageToggle className="shrink-0" />
          <button
            onClick={() => loadQueue(questIds)}
            aria-label={t("ov.refresh")}
            className="h-9 px-3 rounded-xl border border-outline-variant hover:bg-surface-container-low text-xs font-semibold text-on-surface-variant flex items-center gap-1.5 transition-colors tap-target"
          >
            <RefreshCw size={14} /> <span className="hidden sm:inline">{t("ov.refresh")}</span>
          </button>
        </div>
      </header>

      <div className="mx-auto flex measure-page flex-col gap-4 px-4 py-5 sm:gap-5 lg:px-8">

        {/* ── Search ───────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/12 text-secondary">
              <Receipt size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold text-on-surface">{t("ov.searchHeading")}</h2>
              <p className="mt-0.5 text-sm text-on-surface-variant">{t("ov.searchSub")}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
            <label htmlFor="order-code" className="sr-only">{t("ov.orderCodeLabel")}</label>
            <div className="flex h-12 w-full items-center gap-2 rounded-xl border-2 border-outline-variant bg-surface px-4 transition-colors focus-within:border-secondary sm:flex-1">
              <Search size={17} className="text-on-surface-variant shrink-0" />
              <input
                id="order-code"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSearch(); }}
                placeholder={t("ov.placeholder")}
                maxLength={10}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent font-mono text-lg font-bold tracking-[0.15em] text-on-surface placeholder:text-on-surface-variant focus:outline-none"
              />
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={searching || !code.trim()}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-secondary px-6 text-sm font-bold text-on-secondary transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-40"
            >
              {searching
                ? <><Loader2 size={16} className="animate-spin" /> {t("ov.searching")}</>
                : t("ov.search")}
            </button>
          </div>

          {/* Live results. The full lookup still runs on Search or Enter and
              is what actually opens an order, because only it returns the
              participant detail and the verify action. This list is the
              shortcut to it: partial digits narrow the open queue as they are
              typed, and one tap opens the right row. Hidden once a match is
              on screen so it does not compete with it. */}
          {filtering && !match && !billCode && (
            <div className="mt-4">
              {filtered.length === 0 ? (
                <p className="rounded-xl border border-dashed border-outline-variant px-3.5 py-3 text-sm text-on-surface-variant">
                  {t("ov.noMatch")}
                </p>
              ) : (
                <>
                  <p className="mb-1.5 text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                    {filtered.length} {t("ov.matchCount")}
                  </p>
                  <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
                    {filtered.slice(0, 8).map((v) => (
                      <li key={v.id}>
                        <button
                          onClick={() => { setCode(v.order_code); void handleSearch(v.order_code); }}
                          className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-container-low"
                        >
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                              v.status === "order_verified"
                                ? "bg-success-container text-on-success-container"
                                : "bg-warning-container text-on-warning-container"
                            }`}
                          >
                            {v.status === "order_verified" ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold tracking-wider text-on-surface">
                              {v.order_code}
                            </span>
                            <span className="block truncate text-xs text-on-surface-variant">
                              {v.participant_name ?? t("ov.participant")} · {v.task_title}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-secondary">{t("ov.open")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl bg-error-container border border-error-outline px-3.5 py-3">
              <AlertCircle size={16} className="text-error shrink-0 mt-0.5" />
              <p className="text-sm text-on-error-container leading-relaxed">{error}</p>
            </div>
          )}

          {/* ── Match ──────────────────────────────────────────────── */}
          {match && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-outline-variant">
              {/* Who is asking. Public identity and their progress on THIS
                  quest only: enough to judge whether the order is genuine,
                  without handing over a profile dossier. */}
              <div className="border-b border-outline-variant bg-surface-container-high p-3 sm:p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-surface-container-lowest border border-outline-variant overflow-hidden shrink-0 flex items-center justify-center elev-1 surface-raised">
                    {match.participant_avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={match.participant_avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={20} className="text-on-surface-variant" aria-hidden="true" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-body-lg font-bold text-on-surface truncate">
                      {match.participant_name ?? t("ov.participant")}
                    </p>
                    {match.participant_username && (
                      <p className="text-xs text-on-surface-variant">@{match.participant_username}</p>
                    )}
                    <p className="mt-0.5 break-words text-xs text-on-surface-variant">
                      {match.quest_title} · {match.task_title}
                    </p>
                  </div>

                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <ProfileStat
                    icon={Trophy}
                    value={`${match.tasks_completed_here}/${match.tasks_total_here}`}
                    label={t("ov.tasksDone")}
                  />
                  <ProfileStat
                    icon={CheckCircle2}
                    value={String(match.verified_orders_here)}
                    label={t("ov.verifiedOrders")}
                  />
                  <ProfileStat
                    icon={CalendarDays}
                    value={match.joined_quest_at ? timeAgo(match.joined_quest_at) : t("ov.notJoined")}
                    label={t("ov.joinedQuest")}
                  />
                </div>

                <p className="text-label-sm text-on-surface-variant mt-2.5">
                  Code issued {timeAgo(match.created_at)} · expires{" "}
                  {new Date(match.expires_at).toLocaleString("en-IN", {
                    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="space-y-3 bg-surface p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-on-surface">{t("ov.twoCode")}</h3>
                  <span className="shrink-0 rounded-full bg-secondary/12 px-2.5 py-1 text-xs font-bold text-secondary">
                    {t(billCode ? "ov.billStep" : "ov.orderStep")}
                  </span>
                </div>
                <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-streak text-xs font-bold text-on-streak" aria-hidden="true">1</span>
                    <p className="text-sm font-bold text-on-surface">{t("ov.orderCodeLabel")}</p>
                  </div>
                  <p className="mt-2 select-all break-all rounded-lg bg-surface px-3 py-2 font-mono text-lg font-extrabold tracking-widest text-on-surface">
                    {match.order_code}
                  </p>
                </div>
                {billCode ? (
                  <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-bold text-on-secondary" aria-hidden="true">2</span>
                      <p className="text-sm font-bold text-on-surface">{t("ov.billCodeLabel")}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-streak/12 px-2 py-1 text-xs font-bold text-streak-ink">
                        <CheckCircle2 size={14} aria-hidden="true" /> {t("ov.orderVerified")}
                      </span>
                    </div>

                    <p className="text-sm text-on-surface-variant leading-relaxed mt-4">
                      Write this bill verification code on the customer&apos;s bill.
                      They enter it in STRIVUP to complete the task.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant bg-surface px-3 py-1.5">
                      <p className="select-all break-all font-mono text-xl font-extrabold tracking-[0.14em] text-on-surface">
                        {billCode}
                      </p>
                      <button
                        onClick={handleCopyBill}
                        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-secondary hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-secondary"
                      >
                        {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy code</>}
                      </button>
                    </div>

                    <button
                      onClick={reset}
                      className="mt-4 w-full h-11 rounded-xl border border-outline-variant hover:bg-surface-container-low text-sm font-semibold text-on-surface-variant transition-colors"
                    >
                      Verify another order
                    </button>
                  </div>
                ) : (
                  <>
                    {match.status === "cancelled" || match.status === "expired" ? (
                      // A closed code must not offer Verify. Showing an error
                      // banner above a live Verify button is how you end up
                      // clicking it and getting the same error again.
                      <div className="flex items-center gap-2.5 rounded-xl bg-error-container border border-error-outline px-4 py-3">
                        <XCircle size={18} className="text-error shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-on-error-container">
                            {match.status === "expired" ? t("ov.codeNoLongerValid") : t("ov.orderRejected")}
                          </p>
                          <p className="text-xs text-on-error-container">
                            {match.status === "expired"
                              ? t("ov.questEnded")
                              : t("ov.canRequestNew")}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-on-surface-variant leading-relaxed">
                          Confirm this order actually arrived before verifying. STRIVUP
                          will then generate the bill code to write on the bill.
                        </p>

                        {showReject && (
                          <div className="mt-4">
                            <label htmlFor="reject-reason" className="sr-only">
                              Reason for rejecting
                            </label>
                            <textarea
                              id="reject-reason"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              rows={2}
                              placeholder="Reason (optional), for example: no matching order received"
                              className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-3.5 py-2.5 text-sm focus:outline-none focus:border-secondary resize-none transition-colors"
                            />
                          </div>
                        )}

                        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
                          <button
                            onClick={() => (showReject ? void handleReject() : setShowReject(true))}
                            disabled={rejecting || verifying}
                            className="h-12 px-4 rounded-xl border-2 border-error-outline hover:bg-error-container disabled:opacity-40 text-on-error-container font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                          >
                            {rejecting
                              ? <Loader2 size={16} className="animate-spin" />
                              : <XCircle size={16} />}
                            {showReject ? t("ov.confirmReject") : t("ov.reject")}
                          </button>
                          <button
                            onClick={handleVerify}
                            disabled={verifying || rejecting}
                            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-bold text-on-secondary transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-40 sm:flex-1"
                          >
                            {verifying
                              ? <><Loader2 size={16} className="animate-spin" /> Verifying...</>
                              : <><ShieldCheck size={16} /> Verify Order</>}
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Open queue ───────────────────────────────────────────── */}
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-body-lg font-bold text-on-surface">{t("ov.openHeading")}</h2>
              <p className="text-sm text-on-surface-variant mt-0.5">
                {t("ov.openSub")}
              </p>
            </div>
            {queue.length > 0 && (
              <span className="shrink-0 rounded-full bg-streak/12 px-2.5 py-1 text-xs font-bold text-streak-ink">
                {queue.length}
              </span>
            )}
          </div>

          {queue.length === 0 ? (
            <p className="text-sm text-on-surface-variant mt-6 text-center py-10 border border-dashed border-outline-variant rounded-xl">
              {t("ov.nothingWaiting")}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-outline-variant">
              {queue.map((v) => (
                <li key={v.id} className="flex items-center gap-4 py-3">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      v.status === "order_verified"
                        ? "bg-success-container text-on-success-container"
                        : "bg-warning-container text-on-warning-container"
                    }`}
                  >
                    {v.status === "order_verified"
                      ? <CheckCircle2 size={16} />
                      : <Clock size={16} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">
                      {v.participant_name ?? t("ov.participant")}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {v.quest_title} · {v.task_title} · {timeAgo(v.created_at)}
                    </p>
                  </div>
                  <span className="text-sm font-bold tracking-wider text-on-surface-variant shrink-0 hidden sm:block">
                    {v.order_code}
                  </span>
                  <button
                    onClick={() => { setCode(v.order_code); void handleSearch(v.order_code); }}
                    className="h-8 px-3 rounded-xl border border-outline-variant hover:bg-surface-container-low text-xs font-semibold text-on-surface-variant shrink-0 transition-colors tap-target"
                  >
                    {t("ov.open")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
