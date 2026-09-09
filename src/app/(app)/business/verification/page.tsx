"use client";
/**
 * /business/verification — Verify Participant screen.
 * Screens: search → request details → approved (bill code) → rejected
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronRight, Copy, HelpCircle, Search, Shield, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getMyBusinessProfile, findVerificationBySvCode,
  approveVerificationRequest, rejectVerificationRequest,
  getBusinessVerifications, type BusinessProfile, type VerificationRequest,
} from "@/lib/data/business";
import { Suspense } from "react";

type Screen = "search" | "request" | "approved" | "rejected";

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
  const [recentVerifs, setRecentVerifs] = useState<VerificationRequest[]>([]);
  const [recentSearches, setRecentSearches] = useState<{code:string;status:"found"|"invalid"|"expired";time:string}[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const profile = await getMyBusinessProfile(supabase);
      if (!profile?.onboarding_done) { router.replace("/business/onboarding"); return; }
      setBp(profile);
      const v = await getBusinessVerifications(supabase, profile.id, { limit: 4 });
      setRecentVerifs(v);
      // Pre-fill from filter param
      const filter = searchParams.get("filter");
      if (filter === "pending") { /* could auto-filter list */ }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    if (!svCode.trim() || !bp) return;
    setSearching(true); setSearchErr(null);
    const code = svCode.trim().toUpperCase();
    const now = new Date();
    const req = await findVerificationBySvCode(supabase, code, bp.id);
    const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    if (!req) {
      setRecentSearches(p => [{ code, status: "invalid", time: timeStr }, ...p.slice(0,4)]);
      setSearchErr("No verification request found with this code. Ask the participant to check their code.");
    } else if (new Date(req.expires_at) < now || req.status === "expired") {
      setRecentSearches(p => [{ code, status: "expired", time: timeStr }, ...p.slice(0,4)]);
      setSearchErr("This verification code has expired. Ask the participant to generate a new one.");
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
      const { billCode: code } = await approveVerificationRequest(supabase, foundReq.id, bp.id);
      setBillCode(code);
      setScreen("approved");
      const v = await getBusinessVerifications(supabase, bp.id, { limit: 4 });
      setRecentVerifs(v);
    } catch { setSearchErr("Failed to approve."); }
    finally { setApproving(false); }
  };

  const handleReject = async () => {
    if (!foundReq || !bp) return;
    setRejecting(true);
    try {
      await rejectVerificationRequest(supabase, foundReq.id, bp.id);
      setScreen("rejected");
      const v = await getBusinessVerifications(supabase, bp.id, { limit: 4 });
      setRecentVerifs(v);
    } catch { setSearchErr("Failed to reject."); }
    finally { setRejecting(false); }
  };

  const reset = () => { setSvCode(""); setFoundReq(null); setBillCode(null); setSearchErr(null); setScreen("search"); };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  const statusCfg = {
    approved: { label: "Verified",  cls: "text-green-700 bg-green-50 border-green-200" },
    pending:  { label: "Pending",   cls: "text-amber-700 bg-amber-50 border-amber-200" },
    rejected: { label: "Rejected",  cls: "text-red-700 bg-red-50 border-red-200" },
    expired:  { label: "Expired",   cls: "text-gray-500 bg-gray-100 border-gray-200" },
  } as const;

  /* ── SEARCH SCREEN ────────────────────────────────────────────────────── */
  if (screen === "search") return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28">
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 sticky top-0 z-30">
        <Link href="/business/dashboard"><ArrowLeft size={22} className="text-gray-600" /></Link>
        <h1 className="text-[17px] font-black text-gray-900 flex-1">Verify Participant</h1>
        <Link href="/business/verification/how-it-works"><HelpCircle size={22} className="text-gray-400" /></Link>
      </div>

      <div className="px-5 py-5 max-w-lg mx-auto flex flex-col gap-5">
        {/* Instruction card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><circle cx="18" cy="7" r="3"/><path d="M21 10c0 2-1 3-3 3"/></svg>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">Enter the verification code provided by the participant to find their STRIVUP verification request.</p>
        </div>

        {/* OTP Input */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-700">Verification OTP</label>
          <div className="flex gap-2">
            <input
              value={svCode}
              onChange={e => { setSvCode(e.target.value.toUpperCase()); setSearchErr(null); }}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="SV-000000"
              maxLength={9}
              className="flex-1 h-12 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-300 px-4 font-mono tracking-wider text-lg focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-100"
            />
            {svCode && (
              <button type="button" onClick={() => setSvCode("")}
                className="w-12 h-12 flex items-center justify-center text-gray-400 border border-gray-200 rounded-xl bg-white">
                <XCircle size={18} />
              </button>
            )}
          </div>
          {searchErr && <p className="text-sm text-red-600">{searchErr}</p>}
          <button onClick={handleSearch} disabled={!svCode.trim() || searching}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2 transition-all">
            {searching ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Search size={18} /> Search Verification →</>}
          </button>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 text-gray-500">
          <span className="text-blue-500 mt-0.5 shrink-0">ℹ</span>
          <p className="text-sm">Ask the participant to show you the verification code generated by STRIVUP.</p>
        </div>

        {/* How verification works */}
        <Link href="/business/verification/how-it-works">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <HelpCircle size={18} className="text-gray-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">How does verification work?</p>
              <p className="text-xs text-gray-400">Learn the step-by-step process</p>
            </div>
            <ChevronRight size={16} className="text-gray-300" />
          </div>
        </Link>

        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">Recent Searches</h3>
              <button className="text-sm text-blue-600 font-semibold">View all</button>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
              {recentSearches.map((s, i) => {
                const sCfg = { found: { label: "Found", cls: "text-green-700 bg-green-50" }, invalid: { label: "Invalid", cls: "text-red-600 bg-red-50" }, expired: { label: "Expired", cls: "text-amber-700 bg-amber-50" } } as const;
                const c = sCfg[s.status];
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Search size={16} className="text-gray-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-mono font-semibold text-gray-900">{s.code}</p>
                      <p className="text-xs text-gray-400">Today, {s.time}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${c.cls}`}>{c.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Verifications */}
        {recentVerifs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">Recent Verifications</h3>
              <Link href="/business/verification/history" className="text-sm text-blue-600 font-semibold">View all</Link>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
              {recentVerifs.map(req => {
                const participant = req.participant as { full_name: string | null } | undefined;
                const pName = participant?.full_name ?? "Unknown";
                const challenge = (req.challenge as { title: string } | null)?.title ?? (req.quest as { title: string } | null)?.title ?? "—";
                const sc = statusCfg[req.status as keyof typeof statusCfg] ?? statusCfg.expired;
                return (
                  <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 text-sm font-bold text-blue-600">{pName.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{pName}</p>
                      <p className="text-xs text-gray-400 truncate">{challenge}</p>
                      <p className="text-xs text-gray-400">{timeAgo(req.created_at)}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${sc.cls} shrink-0`}>{sc.label}</span>
                    <ChevronRight size={14} className="text-gray-300 shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* ── REQUEST DETAILS ──────────────────────────────────────────────────── */
  if (screen === "request" && foundReq) {
    const participant = foundReq.participant as { full_name: string | null; avatar_url: string | null; username: string | null } | undefined;
    const pName = participant?.full_name ?? "Unknown";
    const pUsername = participant?.username ?? "";
    const challengeTitle = (foundReq.challenge as { title: string } | null)?.title ?? (foundReq.quest as { title: string } | null)?.title ?? "—";
    return (
      <div className="min-h-screen bg-[#F8F9FC] pb-32">
        <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 sticky top-0 z-30">
          <button onClick={reset}><ArrowLeft size={22} className="text-gray-600" /></button>
          <h1 className="text-[17px] font-black text-gray-900 flex-1">Verification Request</h1>
          <button className="text-gray-400">⋮</button>
        </div>

        <div className="px-5 py-5 max-w-lg mx-auto flex flex-col gap-4">
          {/* Status banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <div>
              <p className="text-sm font-bold text-amber-800">Pending Business Approval</p>
              <p className="text-xs text-amber-700 mt-0.5">Verify the details below and approve if genuine.</p>
            </div>
          </div>

          {/* Participant */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Participant</p>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0 text-lg font-black text-blue-600">{pName.charAt(0)}</div>
              <div className="flex-1">
                <p className="text-[15px] font-bold text-gray-900">{pName}</p>
                {pUsername && <p className="text-sm text-gray-500">@{pUsername}</p>}
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </div>
          </div>

          {/* Activity Details */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Activity Details</p>
            <div className="bg-white rounded-2xl border border-gray-100 px-4 divide-y divide-gray-50">
              {[
                { label: "Business", value: bp?.business_name ?? "This Business" },
                { label: "Date",     value: new Date(foundReq.created_at).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) },
                { label: "Time",     value: new Date(foundReq.created_at).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" }) },
                { label: "Verification Type", value: foundReq.verification_type.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase()) },
                { label: "Challenge", value: challengeTitle },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-4 py-3">
                  <span className="text-sm text-gray-400 w-32 shrink-0">{row.label}</span>
                  <span className="text-sm text-gray-800 font-medium flex-1">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-start gap-2">
            <span className="text-amber-600 shrink-0 mt-0.5">⚠</span>
            <p className="text-sm text-amber-700">Only approve this request if you have personally verified the participant and their activity.</p>
          </div>

          {searchErr && <p className="text-sm text-red-600">{searchErr}</p>}
        </div>

        {/* Sticky buttons */}
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3">
          <button onClick={handleReject} disabled={rejecting || approving}
            className="flex-1 h-12 rounded-xl border-2 border-red-500 text-red-600 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40">
            {rejecting ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <><XCircle size={18} /> Reject</>}
          </button>
          <button onClick={handleApprove} disabled={approving || rejecting}
            className="flex-1 h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40">
            {approving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><CheckCircle2 size={18} /> Approve Verification</>}
          </button>
        </div>
      </div>
    );
  }

  /* ── APPROVED ─────────────────────────────────────────────────────────── */
  if (screen === "approved" && billCode) return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col">
      <div className="flex items-center justify-center px-5 py-4 bg-white border-b border-gray-100">
        <h1 className="text-[17px] font-black text-gray-900">Verification Approved</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-6 max-w-sm mx-auto w-full">
        {/* Big green check */}
        <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-200">
          <CheckCircle2 size={48} className="text-white" />
        </div>

        <div className="text-center">
          <h2 className="text-[22px] font-black text-gray-900">Verification Approved!</h2>
          <p className="text-sm text-gray-500 mt-1">The participant has been successfully verified.</p>
        </div>

        {/* Bill code card */}
        <div className="w-full bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-bold text-gray-900 mb-1">Bill Verification Code</p>
          <p className="text-xs text-gray-500 mb-4">Write this code clearly on the participant&apos;s physical bill or receipt.</p>
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-4 border border-gray-100">
            <span className="font-mono font-black text-[28px] text-gray-900 tracking-widest">{billCode}</span>
            <button type="button" onClick={() => navigator.clipboard.writeText(billCode).catch(()=>{})}
              className="text-gray-400 hover:text-gray-600 ml-3" aria-label="Copy">
              <Copy size={20} />
            </button>
          </div>
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-1.5 text-gray-500">
              <span className="text-base">⏱</span>
              <span className="text-xs">Valid for 30 minutes</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500">
              <Shield size={14} />
              <span className="text-xs">One-time use</span>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <p className="text-xs text-blue-700 text-center leading-relaxed">
            ✏️ Write this code on the participant&apos;s bill. Give the bill/receipt to them. They will upload it to STRIVUP.
          </p>
        </div>
      </div>

      <div className="px-5 pb-8 flex flex-col gap-3 max-w-sm mx-auto w-full">
        <button onClick={() => router.push("/business/verification/how-it-works")}
          className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold text-sm">
          View Instructions →
        </button>
        <button onClick={reset} className="w-full h-12 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm">
          Done
        </button>
      </div>
    </div>
  );

  /* ── REJECTED ─────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col items-center justify-center px-5 gap-6 max-w-sm mx-auto">
      <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
        <XCircle size={40} className="text-red-500" />
      </div>
      <div className="text-center">
        <h2 className="text-[22px] font-black text-gray-900">Verification Rejected</h2>
        <p className="text-sm text-gray-500 mt-1">The participant has been notified.</p>
      </div>
      <button onClick={reset} className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold">Verify Another Participant</button>
      <button onClick={() => router.push("/business/dashboard")} className="w-full h-12 rounded-xl border border-gray-200 text-gray-700 font-semibold">Back to Dashboard</button>
    </div>
  );
}

export default function VerifyParticipantPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}><VerifyContent /></Suspense>;
}
