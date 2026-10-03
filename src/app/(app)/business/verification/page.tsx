"use client";
/**
 * /business/verification — Verify Participant screen.
 * Screens: search → request details → approved (bill code) → rejected
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronRight, Clock, Copy, HelpCircle, Search, Shield, Users, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCodeInput } from "@/lib/data/orderVerification";
import {
  getMyBusinessProfile, findVerificationBySvCode,
  approveVerificationRequest, rejectVerificationRequest,
  getBusinessVerifications, getVerificationInsights, type BusinessProfile, type VerificationRequest,
} from "@/lib/data/business";
import { Suspense } from "react";

type Screen = "search" | "request" | "approved" | "rejected";
type InsightRange = "7" | "30" | "all";

const RANGE_DAYS: Record<InsightRange, number | undefined> = { "7": 7, "30": 30, all: undefined };

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [bp, setBp] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("search");
  const [svCode, setSvCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [foundReq, setFoundReq] = useState<VerificationRequest | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [billCode, setBillCode] = useState<string | null>(null);
  const [billExpiresAt, setBillExpiresAt] = useState<string | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [recentVerifs, setRecentVerifs] = useState<VerificationRequest[]>([]);
  const [insights, setInsights] = useState({ total: 0, approved: 0, pending: 0, rejected: 0 });
  const [insightRange, setInsightRange] = useState<InsightRange>("30");
  const pendingOnly = searchParams.get("filter") === "pending";
  const recentOpts = pendingOnly ? { status: "pending", limit: 20 } : { limit: 4 };
  const [recentSearches, setRecentSearches] = useState<{code:string;status:"found"|"invalid"|"expired";time:string}[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const profile = await getMyBusinessProfile(supabase);
      if (!profile?.onboarding_done) { router.replace("/business/onboarding"); return; }
      setBp(profile);
      const v = await getBusinessVerifications(supabase, profile.id, recentOpts);
      setRecentVerifs(v);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)load insights whenever the business or the selected range changes.
  useEffect(() => {
    if (!bp) return;
    let cancelled = false;
    getVerificationInsights(supabase, bp.id, RANGE_DAYS[insightRange]).then(ins => {
      if (!cancelled) setInsights(ins);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bp, insightRange]);

  const refreshAfterDecision = async (businessId: string) => {
    const [v, ins] = await Promise.all([
      getBusinessVerifications(supabase, businessId, recentOpts),
      getVerificationInsights(supabase, businessId, RANGE_DAYS[insightRange]),
    ]);
    setRecentVerifs(v);
    setInsights(ins);
  };

  const handleSearch = async () => {
    if (!svCode.trim() || !bp) return;
    setSearching(true); setSearchErr(null);
    const code = svCode.trim().toUpperCase();
    const now = new Date();
    const req = await findVerificationBySvCode(supabase, code, bp.id);
    const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    if (!req) {
      setRecentSearches(p => [{ code, status: "invalid", time: timeStr }, ...p.slice(0,4)]);
      setSearchErr("No Quest order found with this code. Check the code in the order description.");
    } else if (req.status === "approved") {
      // Already verified — show the bill code again in case it was lost.
      setRecentSearches(p => [{ code, status: "found", time: timeStr }, ...p.slice(0,4)]);
      try {
        const { billCode: bc, expiresAt } = await approveVerificationRequest(supabase, req.sv_code);
        setBillCode(bc); setBillExpiresAt(expiresAt); setScreen("approved");
      } catch (e) { setSearchErr(e instanceof Error ? e.message : "Couldn't load the bill code."); }
    } else if (req.status === "completed") {
      setSearchErr("This order is already complete — the customer has entered their bill code.");
    } else if (req.status === "rejected") {
      setSearchErr("This order was already rejected. The customer can generate a new code.");
    } else if (new Date(req.expires_at) < now || req.status === "expired") {
      setRecentSearches(p => [{ code, status: "expired", time: timeStr }, ...p.slice(0,4)]);
      setSearchErr("This code has expired. Ask the customer to tap Post Proof again for a new code.");
    } else {
      setRecentSearches(p => [{ code, status: "found", time: timeStr }, ...p.slice(0,4)]);
      setFoundReq(req);
      setScreen("request");
    }
    setSearching(false);
  };

  const handleApprove = async () => {
    if (!foundReq || !bp) return;
    setApproving(true);
    try {
      const { billCode: code, expiresAt } = await approveVerificationRequest(supabase, foundReq.sv_code);
      setBillCode(code);
      setBillExpiresAt(expiresAt);
      setScreen("approved");
      await refreshAfterDecision(bp.id);
    } catch (e) { setSearchErr(e instanceof Error ? e.message : "Couldn't verify this order. Please try again."); }
    finally { setApproving(false); }
  };

  const handleReject = async () => {
    if (!foundReq || !bp) return;
    setRejecting(true);
    try {
      await rejectVerificationRequest(supabase, foundReq.id, rejectReason);
      setScreen("rejected");
      await refreshAfterDecision(bp.id);
    } catch (e) { setSearchErr(e instanceof Error ? e.message : "Couldn't reject this order. Please try again."); }
    finally { setRejecting(false); }
  };

  const reset = () => {
    setSvCode(""); setFoundReq(null); setBillCode(null); setBillExpiresAt(null);
    setSearchErr(null); setRejectMode(false); setRejectReason(""); setScreen("search");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-surface"><div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" /></div>;

  const statusCfg = {
    approved: { label: "Verified",  cls: "text-on-success-container bg-success-container border-success-outline" },
    pending:  { label: "Pending",   cls: "text-on-warning-container bg-warning-container border-warning-outline" },
    rejected: { label: "Rejected",  cls: "text-on-error-container bg-error-container border-error-outline" },
    expired:  { label: "Expired",   cls: "text-on-surface-variant bg-surface-container border-outline-variant" },
    completed:{ label: "Completed", cls: "text-secondary bg-secondary-fixed border-secondary-fixed-dim" },
  } as const;

  /* ── SEARCH SCREEN ────────────────────────────────────────────────────── */
  if (screen === "search") return (
    <div className="min-h-screen bg-surface pb-28">
      <div className="flex items-center gap-3 px-5 py-4 bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-30">
        <Link aria-label="Back" href="/business/dashboard"><ArrowLeft size={22} className="text-on-surface-variant" /></Link>
        <h1 className="text-[17px] font-black text-on-surface flex-1">Verify Participant</h1>
        <Link aria-label="How verification works" href="/business/verification/how-it-works"><HelpCircle size={22} className="text-on-surface-variant" /></Link>
      </div>

      <div className="px-5 py-5 max-w-lg mx-auto flex flex-col gap-5">
        {/* Instruction card */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary-fixed flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><circle cx="18" cy="7" r="3"/><path d="M21 10c0 2-1 3-3 3"/></svg>
          </div>
          <p className="text-sm text-on-surface-variant leading-relaxed">Quest orders arrive with a STRIVUP code in the order description (e.g. SV-123456). Enter it here to verify the order.</p>
        </div>

        {/* OTP Input */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-on-surface-variant">Order verification code</label>
          <div className="flex gap-2">
            <input aria-label="Order verification code"
              value={svCode}
              onChange={e => { setSvCode(formatCodeInput(e.target.value, "SV")); setSearchErr(null); }}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="SV-000000"
              maxLength={9}
              className="flex-1 h-12 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant px-4 font-mono tracking-wider text-lg focus:outline-none focus:ring-2 focus:border-secondary focus:ring-blue-100"
            />
            {svCode && (
              <button aria-label="Clear code" type="button" onClick={() => setSvCode("")}
                className="w-12 h-12 flex items-center justify-center text-on-surface-variant border border-outline-variant rounded-xl bg-surface-container-lowest">
                <XCircle size={18} />
              </button>
            )}
          </div>
          {searchErr && <p role="alert" className="text-sm text-on-error-container">{searchErr}</p>}
          <button onClick={handleSearch} disabled={!svCode.trim() || searching}
            className="w-full h-12 rounded-xl bg-secondary hover:opacity-90 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2 transition-all">
            {searching ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Search size={18} /> Search Order →</>}
          </button>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 text-on-surface-variant">
          <span className="text-blue-500 mt-0.5 shrink-0">ℹ</span>
          <p className="text-sm">No code in the order note? The order can&apos;t be linked to a Quest automatically.</p>
        </div>

        {/* Verification Insights */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-on-surface">Verification Insights</h3>
            <select
              value={insightRange}
              onChange={e => setInsightRange(e.target.value as InsightRange)}
              aria-label="Insights time range"
              className="h-8 rounded-lg border border-outline-variant bg-surface-container-lowest text-xs font-semibold text-on-surface-variant px-2 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-secondary"
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Total",    value: insights.total,    cls: "text-on-surface" },
              { label: "Approved", value: insights.approved, cls: "text-on-success-container" },
              { label: "Pending",  value: insights.pending,  cls: "text-on-warning-container" },
              { label: "Rejected", value: insights.rejected, cls: "text-on-error-container" },
            ].map(t => (
              <div key={t.label} className="rounded-xl bg-surface-container-low/50 border border-outline-variant py-3 flex flex-col items-center">
                <span className={`text-lg font-black ${t.cls}`}>{t.value}</span>
                <span className="text-[10px] text-on-surface-variant font-medium mt-0.5">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* How verification works */}
        <Link href="/business/verification/how-it-works">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 flex items-center gap-3 hover:bg-surface-container-low transition-colors">
            <div className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center shrink-0">
              <HelpCircle size={18} className="text-on-surface-variant" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-on-surface">How does verification work?</p>
              <p className="text-xs text-on-surface-variant">Learn the step-by-step process</p>
            </div>
            <ChevronRight size={16} className="text-on-surface-variant" />
          </div>
        </Link>

        {/* Community CTA */}
        <Link href="/business/quests/new">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 flex items-center gap-3 hover:bg-surface-container-low transition-colors">
            <div className="w-10 h-10 rounded-xl bg-secondary-fixed flex items-center justify-center shrink-0">
              <Users size={20} className="text-secondary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-on-surface">Build a more active community</p>
              <p className="text-xs text-on-surface-variant">Create a Quest to bring more participants to your business.</p>
            </div>
            <span className="h-8 px-3 rounded-lg bg-secondary text-white text-xs font-bold flex items-center shrink-0">Create Quest</span>
          </div>
        </Link>

        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-on-surface">Recent Searches</h3>
              <button className="text-sm text-secondary font-semibold">View all</button>
            </div>
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant divide-y divide-gray-50">
              {recentSearches.map((s, i) => {
                const sCfg = { found: { label: "Found", cls: "text-on-success-container bg-success-container" }, invalid: { label: "Invalid", cls: "text-on-error-container bg-error-container" }, expired: { label: "Expired", cls: "text-on-warning-container bg-warning-container" } } as const;
                const c = sCfg[s.status];
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Search size={16} className="text-on-surface-variant shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-mono font-semibold text-on-surface">{s.code}</p>
                      <p className="text-xs text-on-surface-variant">Today, {s.time}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${c.cls}`}>{c.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Verifications */}
        {(recentVerifs.length > 0 || pendingOnly) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-on-surface">{pendingOnly ? "Pending Requests" : "Recent Verifications"}</h3>
              <Link href="/business/verification/history" className="text-sm text-secondary font-semibold">View all</Link>
            </div>
            {recentVerifs.length === 0 && (
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-4 py-6 text-center">
                <p className="text-sm text-on-surface-variant">No pending verification requests right now.</p>
              </div>
            )}
            {recentVerifs.length > 0 && <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant divide-y divide-gray-50">
              {recentVerifs.map(req => {
                const participant = req.participant as { full_name: string | null } | undefined;
                const pName = participant?.full_name ?? "Unknown";
                const challenge = (req.challenge as { title: string } | null)?.title ?? (req.quest as { title: string } | null)?.title ?? "—";
                const sc = statusCfg[req.status as keyof typeof statusCfg] ?? statusCfg.expired;
                return (
                  <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center shrink-0 text-sm font-bold text-secondary">{pName.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-on-surface">{pName}</p>
                      <p className="text-xs text-on-surface-variant truncate">{challenge}</p>
                      <p className="text-xs text-on-surface-variant">{timeAgo(req.created_at)}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${sc.cls} shrink-0`}>{sc.label}</span>
                    <ChevronRight size={14} className="text-on-surface-variant shrink-0" />
                  </div>
                );
              })}
            </div>}
          </div>
        )}
      </div>
    </div>
  );

  /* ── REQUEST DETAILS ──────────────────────────────────────────────────── */
  if (screen === "request" && foundReq) {
    const participant = foundReq.participant as { full_name: string | null; username: string | null } | undefined;
    const pName = participant?.full_name ?? participant?.username ?? "Participant";
    const questTitle = (foundReq.quest as { title: string } | null)?.title ?? (foundReq.challenge as { title: string } | null)?.title ?? "—";
    const taskTitle = (foundReq.task as { title: string } | null)?.title ?? null;
    return (
      <div className="min-h-screen bg-surface pb-40">
        <div className="flex items-center gap-3 px-5 py-4 bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-30">
          <button aria-label="Back" onClick={reset} className="w-11 h-11 -ml-2 flex items-center justify-center"><ArrowLeft size={22} className="text-on-surface-variant" /></button>
          <h1 className="text-[17px] font-black text-on-surface flex-1">Verify Quest Order</h1>
        </div>

        <div className="px-5 py-5 max-w-lg mx-auto flex flex-col gap-4">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Order code</p>
            <p className="mt-1 font-mono text-[32px] font-black tracking-widest text-on-surface">{foundReq.sv_code}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warning-container px-3 py-1 text-xs font-bold text-on-warning-container">
              <Clock size={13} /> Awaiting verification
            </span>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-4 divide-y divide-gray-50">
            {[
              { label: "Customer", value: pName },
              { label: "Quest",    value: questTitle },
              ...(taskTitle ? [{ label: "Task", value: taskTitle }] : []),
              { label: "Code created", value: new Date(foundReq.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
            ].map(row => (
              <div key={row.label} className="flex items-start gap-4 py-3">
                <span className="text-sm text-on-surface-variant w-28 shrink-0">{row.label}</span>
                <span className="text-sm text-on-surface font-semibold flex-1">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="bg-warning-container border border-warning-outline rounded-2xl px-4 py-3 flex items-start gap-2">
            <span className="text-on-warning-container shrink-0 mt-0.5" aria-hidden="true">⚠</span>
            <p className="text-sm text-on-warning-container">Verify only if this code is on a real order for an eligible item. You&apos;ll get a bill code to write on the customer&apos;s bill.</p>
          </div>

          {rejectMode && (
            <div className="bg-surface-container-lowest rounded-2xl border border-error-outline p-4 flex flex-col gap-2">
              <label htmlFor="reject-reason" className="text-sm font-bold text-on-surface">Reason for rejecting (shown to the customer)</label>
              <textarea id="reject-reason" value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2}
                placeholder="e.g. Item isn't part of this Quest"
                className="w-full resize-none rounded-xl border border-outline-variant px-3 py-2 text-base focus:border-error focus:outline-none focus:ring-2 focus:ring-error/30" />
            </div>
          )}

          {searchErr && <p role="alert" className="text-sm text-on-error-container">{searchErr}</p>}
        </div>

        {/* Reject on the left, Verify on the right — different colour and position. */}
        <div className="fixed above-bottom-nav z-40 bg-surface-container-lowest border-t border-outline-variant px-5 py-4 flex gap-3">
          {rejectMode ? (
            <>
              <button onClick={() => { setRejectMode(false); setRejectReason(""); }} disabled={rejecting}
                className="flex-1 h-12 rounded-xl border border-outline-variant text-on-surface-variant font-semibold text-sm">
                Cancel
              </button>
              <button onClick={handleReject} disabled={rejecting}
                className="flex-1 h-12 rounded-xl bg-error text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40">
                {rejecting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><XCircle size={18} /> Confirm Reject</>}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setRejectMode(true)} disabled={approving}
                className="flex-1 h-12 rounded-xl border-2 border-error text-on-error-container font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40">
                <XCircle size={18} /> Reject
              </button>
              <button onClick={handleApprove} disabled={approving}
                className="flex-[1.4] h-12 rounded-xl bg-success hover:bg-success text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40">
                {approving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><CheckCircle2 size={18} /> Verify Order</>}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── APPROVED ─────────────────────────────────────────────────────────── */
  if (screen === "approved" && billCode) return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="flex items-center justify-center px-5 py-4 bg-surface-container-lowest border-b border-outline-variant">
        <h1 className="text-[17px] font-black text-on-surface">Order Verified</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-6 max-w-sm mx-auto w-full">
        {/* Big green check */}
        <div className="w-24 h-24 rounded-full bg-success flex items-center justify-center shadow-lg shadow-green-200">
          <CheckCircle2 size={48} className="text-white" />
        </div>

        <div className="text-center">
          <h2 className="text-[22px] font-black text-on-surface">Verification Successful</h2>
          <p className="text-sm text-on-surface-variant mt-1">Now write the bill code below on the customer&apos;s bill.</p>
        </div>

        {/* Bill code card */}
        <div className="w-full bg-surface-container-lowest rounded-2xl border border-outline-variant p-5">
          <p className="text-sm font-bold text-on-surface mb-1">Bill Verification Code</p>
          <p className="text-xs text-on-surface-variant mb-4">Write or print this clearly on the customer&apos;s bill. They enter it in STRIVUP to complete their task.</p>
          <div className="flex items-center justify-between bg-surface-container-low rounded-xl px-5 py-4 border border-outline-variant">
            <span className="font-mono font-black text-[28px] text-on-surface tracking-widest">{billCode}</span>
            <button type="button" onClick={() => navigator.clipboard.writeText(billCode).catch(()=>{})}
              className="w-11 h-11 -mr-2 flex items-center justify-center text-on-surface-variant hover:text-on-surface ml-3" aria-label="Copy bill code">
              <Copy size={20} />
            </button>
          </div>
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="text-base">⏱</span>
              <span className="text-xs">
                Valid until {billExpiresAt ? new Date(billExpiresAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "24 hours from now"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <Shield size={14} />
              <span className="text-xs">One-time use</span>
            </div>
          </div>
        </div>

        <div className="bg-secondary-fixed rounded-xl p-3 border border-secondary-fixed-dim">
          <p className="text-xs text-secondary text-center leading-relaxed">
✏️ Write this code on the bill that goes with the order. The customer types it into STRIVUP — the task only completes when they do.
          </p>
        </div>
      </div>

      <div className="px-5 pb-8 flex flex-col gap-3 max-w-sm mx-auto w-full">
        <button onClick={() => router.push("/business/verification/how-it-works")}
          className="w-full h-12 rounded-xl bg-secondary text-white font-bold text-sm">
          View Instructions →
        </button>
        <button onClick={reset} className="w-full h-12 rounded-xl border border-outline-variant text-on-surface-variant font-semibold text-sm">
          Done
        </button>
      </div>
    </div>
  );

  /* ── REJECTED ─────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-5 gap-6 max-w-sm mx-auto">
      <div className="w-20 h-20 rounded-full bg-error-container flex items-center justify-center">
        <XCircle size={40} className="text-error" />
      </div>
      <div className="text-center">
        <h2 className="text-[22px] font-black text-on-surface">Order Rejected</h2>
        <p className="text-sm text-on-surface-variant mt-1">The customer has been notified{rejectReason.trim() ? " with your reason" : ""}.</p>
      </div>
      <button onClick={reset} className="w-full h-12 rounded-xl bg-secondary text-white font-bold">Verify Another Order</button>
      <button onClick={() => router.push("/business/dashboard")} className="w-full h-12 rounded-xl border border-outline-variant text-on-surface-variant font-semibold">Back to Dashboard</button>
    </div>
  );
}

export default function VerifyParticipantPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-surface"><div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" /></div>}><VerifyContent /></Suspense>;
}
