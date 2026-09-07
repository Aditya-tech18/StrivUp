"use client";

/**
 * /business/verification — Verify Participant screen.
 * Flow:
 *   1. Business enters SV-XXXXXX code → Search
 *   2. If found → show Verification Request details
 *   3. Business clicks Approve or Reject
 *   4. On Approve → STRIV-XXXX bill code generated → show success
 *   5. On Reject → confirm rejection
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronRight, Copy, HelpCircle, Search, Shield, Users, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";
import {
  getMyBusinessProfile,
  findVerificationBySvCode,
  approveVerificationRequest,
  rejectVerificationRequest,
  getBusinessVerifications,
  type BusinessProfile,
  type VerificationRequest,
} from "@/lib/data/business";

type Screen = "search" | "request" | "approved" | "rejected" | "error";

function formatDate(str: string) {
  return new Date(str).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function VerifyParticipantPage() {
  const router = useRouter();

  const supabase = createClient();
  const [bp, setBp] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Search state
  const [svCode, setSvCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<{ code: string; status: "found" | "invalid" | "expired"; time: string }[]>([]);

  // Request state
  const [screen, setScreen] = useState<Screen>("search");
  const [foundRequest, setFoundRequest] = useState<VerificationRequest | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [billCode, setBillCode] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Recent verifications for list
  const [recentVerifs, setRecentVerifs] = useState<VerificationRequest[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const profile = await getMyBusinessProfile(supabase);
      if (!profile?.onboarding_done) { router.replace("/business/onboarding"); return; }
      setBp(profile);
      const verifs = await getBusinessVerifications(supabase, profile.id, { limit: 10 });
      setRecentVerifs(verifs);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    if (!svCode.trim() || !bp) return;
    setSearching(true);
    setSearchError(null);
    const code = svCode.trim().toUpperCase();
    try {
      const req = await findVerificationBySvCode(supabase, code, bp.id);
      const now = new Date();
      if (!req) {
        setRecentSearches(prev => [{ code, status: "invalid", time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev.slice(0, 4)]);
        setSearchError("No verification request found with this code. Please ask the participant to check their code.");
        return;
      }
      if (req.status === "expired" || new Date(req.expires_at) < now) {
        setRecentSearches(prev => [{ code, status: "expired", time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev.slice(0, 4)]);
        setSearchError("This verification code has expired. Ask the participant to generate a new one.");
        return;
      }
      setRecentSearches(prev => [{ code, status: "found", time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev.slice(0, 4)]);
      setFoundRequest(req);
      setScreen("request");
    } finally {
      setSearching(false);
    }
  };

  const handleApprove = async () => {
    if (!foundRequest || !bp) return;
    setApproving(true);
    try {
      const { billCode: code } = await approveVerificationRequest(supabase, foundRequest.id, bp.id);
      setBillCode(code);
      setScreen("approved");
      // refresh list
      const verifs = await getBusinessVerifications(supabase, bp.id, { limit: 10 });
      setRecentVerifs(verifs);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Failed to approve");
      setScreen("search");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!foundRequest || !bp) return;
    setRejecting(true);
    try {
      await rejectVerificationRequest(supabase, foundRequest.id, bp.id, rejectionReason || undefined);
      setScreen("rejected");
      const verifs = await getBusinessVerifications(supabase, bp.id, { limit: 10 });
      setRecentVerifs(verifs);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setRejecting(false);
    }
  };

  const resetToSearch = () => {
    setSvCode("");
    setFoundRequest(null);
    setBillCode(null);
    setRejectionReason("");
    setSearchError(null);
    setScreen("search");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
      </div>
    );
  }

  /* ── SCREEN: Search ────────────────────────────────────────────────── */
  if (screen === "search") return (
    <div className="min-h-screen bg-surface pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant bg-surface-container-lowest">
        <Link href="/business/dashboard" className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Back">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="type-headline-sm text-on-surface flex-1">Verify Participant</h1>
        <Link href="/business/verification/how-it-works" className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Help">
          <HelpCircle size={22} />
        </Link>
      </div>

      <div className="px-5 py-5 flex flex-col gap-6 max-w-lg mx-auto">
        {/* Instruction card */}
        <Card bordered padding="md" className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
            <Users size={20} className="text-secondary" />
          </div>
          <p className="type-body-md text-on-surface-variant">
            Enter the verification code provided by the participant to find their STRIVUP verification request.
          </p>
        </Card>

        {/* OTP Input */}
        <div className="flex flex-col gap-3">
          <label className="type-body-md font-medium text-on-surface">Verification OTP</label>
          <div className="flex gap-2">
            <input
              value={svCode}
              onChange={e => { setSvCode(e.target.value.toUpperCase()); setSearchError(null); }}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="SV-000000"
              maxLength={9}
              className="flex-1 h-12 rounded border border-outline-variant bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant text-[length:var(--font-size-body-lg)] px-4 font-mono tracking-wider focus:outline-none focus:ring-2 focus:border-secondary focus:ring-secondary/20 transition-colors"
            />
            {svCode && (
              <button type="button" onClick={() => setSvCode("")} className="w-12 h-12 flex items-center justify-center text-on-surface-variant hover:text-on-surface border border-outline-variant rounded bg-surface-container-lowest transition-colors">
                <XCircle size={18} />
              </button>
            )}
          </div>
          {searchError && <p className="type-body-md text-error">{searchError}</p>}
          <Button variant="primary" size="lg" fullWidth onClick={handleSearch} disabled={!svCode.trim() || searching}>
            {searching ? "Searching…" : <><Search size={18} /> Search Verification →</>}
          </Button>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 text-on-surface-variant">
          <span className="text-secondary mt-0.5">ℹ</span>
          <p className="type-body-md">Ask the participant to show you the verification code generated by STRIVUP.</p>
        </div>

        {/* How verification works */}
        <Link href="/business/verification/how-it-works">
          <Card bordered padding="md" className="flex items-center gap-3 hover:bg-surface-container-high transition-colors">
            <div className="w-9 h-9 rounded-xl bg-surface-variant flex items-center justify-center shrink-0">
              <HelpCircle size={18} className="text-on-surface-variant" />
            </div>
            <div className="flex-1">
              <p className="type-body-md font-semibold text-on-surface">How does verification work?</p>
              <p className="type-body-md text-on-surface-variant">Learn the step-by-step process</p>
            </div>
            <ChevronRight size={16} className="text-on-surface-variant shrink-0" />
          </Card>
        </Link>

        {/* Recent Verifications */}
        {recentVerifs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="type-body-md font-semibold text-on-surface">Recent Verifications</h2>
              <Link href="/business/verification/history" className="type-body-md text-secondary font-semibold">View all</Link>
            </div>
            <Card bordered padding="md">
              {recentVerifs.slice(0, 4).map(req => {
                const name = ((req.participant as unknown as { full_name: string | null; avatar_url: string | null; username: string | null } | null))?.full_name ?? "Unknown";
                const challenge = ((req.challenge as unknown as { title: string } | null))?.title ?? ((req.quest as unknown as { title: string } | null))?.title ?? "—";
                const statusConf = {
                  approved: { label: "Verified", cls: "text-on-tertiary-container bg-tertiary-fixed" },
                  pending:  { label: "Pending",  cls: "text-amber-700 bg-amber-100" },
                  rejected: { label: "Rejected", cls: "text-error bg-error-container" },
                  expired:  { label: "Expired",  cls: "text-on-surface-variant bg-surface-container" },
                } as const;
                const sc = statusConf[req.status as keyof typeof statusConf] ?? statusConf.expired;
                return (
                  <div key={req.id} className="flex items-center gap-3 py-3 border-b border-outline-variant last:border-0">
                    <div className="w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                      <span className="type-body-md font-bold text-secondary">{name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="type-body-md font-semibold text-on-surface">{name}</p>
                      <p className="type-body-md text-on-surface-variant truncate">{challenge}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
                      <span className="type-body-md text-on-surface-variant">{formatTimeAgo(req.created_at)}</span>
                    </div>
                    <ChevronRight size={14} className="text-on-surface-variant shrink-0" />
                  </div>
                );
              })}
            </Card>
          </div>
        )}
      </div>
    </div>
  );

  /* ── SCREEN: Request Details ───────────────────────────────────────── */
  if (screen === "request" && foundRequest) {
    const name = (foundRequest.participant as any)?.full_name ?? "Unknown";
    const username = (foundRequest.participant as any)?.username ?? "";
    const challengeTitle = (foundRequest.challenge as any)?.title ?? (foundRequest.quest as any)?.title ?? "—";
    const bizName = bp?.business_name ?? "This Business";

    return (
      <div className="min-h-screen bg-surface pb-24">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant bg-surface-container-lowest">
          <button onClick={resetToSearch} className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Back">
            <ArrowLeft size={22} />
          </button>
          <h1 className="type-headline-sm text-on-surface flex-1">Verification Request</h1>
        </div>

        <div className="px-5 py-5 flex flex-col gap-5 max-w-lg mx-auto">
          {/* Status banner */}
          <Card padding="md" className="flex items-start gap-3 bg-amber-50 border border-amber-200">
            <Shield size={20} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="type-body-md font-semibold text-amber-800">Pending Business Approval</p>
              <p className="type-body-md text-amber-700">Verify the details below and approve if genuine.</p>
            </div>
          </Card>

          {/* Participant */}
          <div>
            <p className="type-label-caps text-on-surface-variant mb-3">Participant</p>
            <Card bordered padding="md" className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                <span className="type-headline-sm font-bold text-secondary">{name.charAt(0)}</span>
              </div>
              <div className="flex-1">
                <p className="type-body-md font-bold text-on-surface">{name}</p>
                {username && <p className="type-body-md text-on-surface-variant">@{username}</p>}
              </div>
              <ChevronRight size={16} className="text-on-surface-variant" />
            </Card>
          </div>

          {/* Activity details */}
          <div>
            <p className="type-label-caps text-on-surface-variant mb-3">Activity Details</p>
            <Card bordered padding="md" className="flex flex-col gap-0">
              {[
                { label: "Business", value: bizName, icon: "🏪" },
                { label: "Date", value: formatDate(foundRequest.created_at).split(",")[0] },
                { label: "Time", value: new Date(foundRequest.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) },
                { label: "Verification Type", value: foundRequest.verification_type.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase()) },
                { label: "Challenge", value: challengeTitle },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3 py-3 border-b border-outline-variant last:border-0">
                  <span className="type-body-md text-on-surface-variant w-32 shrink-0">{row.label}</span>
                  <span className="type-body-md text-on-surface flex-1">{row.value}</span>
                  {row.label === "Business" && <ChevronRight size={14} className="text-on-surface-variant shrink-0" />}
                </div>
              ))}
            </Card>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span className="text-amber-600 shrink-0 mt-0.5">⚠</span>
            <p className="type-body-md text-amber-700">Only approve this request if you have personally verified the participant and their activity.</p>
          </div>

          {searchError && <p className="type-body-md text-error">{searchError}</p>}
        </div>

        {/* Sticky approve/reject */}
        <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-surface border-t border-outline-variant flex gap-3">
          <Button variant="outline" size="lg" fullWidth onClick={handleReject} disabled={rejecting || approving}
            className="border-error text-error flex items-center gap-2">
            {rejecting ? "Rejecting…" : <><XCircle size={18} /> Reject</>}
          </Button>
          <Button variant="primary" size="lg" fullWidth onClick={handleApprove} disabled={approving || rejecting}
            className="bg-on-tertiary-container flex items-center gap-2" style={{ backgroundColor: "#009668" }}>
            {approving ? "Approving…" : <><CheckCircle2 size={18} /> Approve Verification</>}
          </Button>
        </div>
      </div>
    );
  }

  /* ── SCREEN: Approved ─────────────────────────────────────────────── */
  if (screen === "approved" && billCode) return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant bg-surface-container-lowest">
        <h1 className="type-headline-sm text-on-surface flex-1 text-center">Verification Approved</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-6 max-w-sm mx-auto w-full">
        {/* Success icon */}
        <div className="w-24 h-24 rounded-full bg-[#009668] flex items-center justify-center shadow-lg">
          <CheckCircle2 size={48} className="text-white" />
        </div>

        <div className="text-center">
          <h2 className="type-headline-md text-on-surface font-bold">Verification Approved!</h2>
          <p className="type-body-md text-on-surface-variant mt-1">The participant has been successfully verified.</p>
        </div>

        {/* Bill code */}
        <Card bordered padding="lg" className="w-full">
          <p className="type-body-md font-semibold text-on-surface mb-1">Bill Verification Code</p>
          <p className="type-body-md text-on-surface-variant mb-4">Write this code clearly on the participant&apos;s physical bill or receipt.</p>
          <div className="flex items-center justify-between bg-surface-container rounded-xl px-5 py-4 border border-outline-variant">
            <span className="font-mono font-black text-[28px] text-on-surface tracking-widest">{billCode}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(billCode).catch(() => {})}
              className="text-on-surface-variant hover:text-on-surface transition-colors ml-3"
              aria-label="Copy code"
            >
              <Copy size={20} />
            </button>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <span>⏱</span>
              <span className="type-body-md">Valid for 30 minutes</span>
            </div>
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <Shield size={14} />
              <span className="type-body-md">One-time use</span>
            </div>
          </div>
        </Card>

        <p className="type-body-md text-on-surface-variant text-center">
          Write this code on the participant&apos;s bill. Give the bill/receipt to the participant. They will upload it to STRIVUP.
        </p>
      </div>

      <div className="px-5 pb-8 flex flex-col gap-3">
        <Button variant="primary" size="lg" fullWidth onClick={() => router.push("/business/verification/how-it-works")}>
          View Instructions →
        </Button>
        <Button variant="outline" size="lg" fullWidth onClick={resetToSearch}>
          Done
        </Button>
      </div>
    </div>
  );

  /* ── SCREEN: Rejected ─────────────────────────────────────────────── */
  if (screen === "rejected") return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-5 gap-6">
      <div className="w-20 h-20 rounded-full bg-error-container flex items-center justify-center">
        <XCircle size={40} className="text-error" />
      </div>
      <div className="text-center">
        <h2 className="type-headline-md text-on-surface font-bold">Verification Rejected</h2>
        <p className="type-body-md text-on-surface-variant mt-1">The participant has been notified.</p>
      </div>
      <Button variant="primary" size="lg" fullWidth onClick={resetToSearch} className="max-w-sm">
        Verify Another Participant
      </Button>
      <Button variant="outline" size="lg" fullWidth onClick={() => router.push("/business/dashboard")} className="max-w-sm">
        Back to Dashboard
      </Button>
    </div>
  );

  return null;
}
