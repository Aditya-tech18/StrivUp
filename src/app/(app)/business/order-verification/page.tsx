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
  AlertCircle, ArrowLeft, Check, CheckCircle2, Clock, Copy,
  Loader2, Receipt, RefreshCw, Search, ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import { getBusinessQuests } from "@/lib/data/businessQuests";
import {
  getPendingVerifications, lookupOrderCode, verifyOrderCode,
  type OrderCodeLookup,
} from "@/lib/data/questOrderVerification";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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
  const [match, setMatch] = useState<OrderCodeLookup | null>(null);
  const [billCode, setBillCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    if (!query) { setError("Enter the STRIVUP code from the order."); return; }

    setSearching(true);
    setError(null);
    setMatch(null);
    setBillCode(null);

    const res = await lookupOrderCode(supabase, query);
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
  }, [code, supabase]);

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
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA]">
        <Loader2 size={26} className="text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-24">

      <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-5 lg:px-8 h-14 flex items-center gap-3">
          <Link
            href="/business/dashboard"
            aria-label="Back to dashboard"
            className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center shrink-0 transition-colors"
          >
            <ArrowLeft size={18} className="text-gray-600" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-900">Order Verification</h1>
            <p className="text-[11px] text-gray-400">
              Match a STRIVUP code to an incoming order
            </p>
          </div>
          <button
            onClick={() => loadQueue(questIds)}
            aria-label="Refresh queue"
            className="h-9 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw size={14} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 lg:px-8 py-6 flex flex-col gap-6">

        {/* ── Search ───────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-[17px] font-bold text-gray-900">Search order code</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            The customer adds this code to the order description on Zomato or Swiggy.
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
            <label htmlFor="order-code" className="sr-only">STRIVUP order code</label>
            <div className="flex-1 flex items-center gap-2 rounded-xl border-2 border-gray-200 focus-within:border-blue-500 bg-white px-4 h-12 transition-colors">
              <Search size={17} className="text-gray-400 shrink-0" />
              <input
                id="order-code"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSearch(); }}
                placeholder="SV____"
                maxLength={10}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 min-w-0 bg-transparent text-lg font-bold tracking-[0.15em] text-gray-900 placeholder:text-gray-300 focus:outline-none"
              />
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={searching || !code.trim()}
              className="h-12 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {searching
                ? <><Loader2 size={16} className="animate-spin" /> Searching…</>
                : "Search"}
            </button>
          </div>

          {error && (
            <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-3.5 py-3">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 leading-relaxed">{error}</p>
            </div>
          )}

          {/* ── Match ──────────────────────────────────────────────── */}
          {match && (
            <div className="mt-5 rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-gray-900">
                      {match.participant_name ?? "Participant"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {match.quest_title} · {match.task_title}
                    </p>
                  </div>
                  <span className="text-lg font-bold tracking-[0.15em] text-gray-900 shrink-0">
                    {match.order_code}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">
                  Issued {timeAgo(match.created_at)} · expires{" "}
                  {new Date(match.expires_at).toLocaleString("en-IN", {
                    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="p-5">
                {billCode ? (
                  <>
                    <div className="flex items-center gap-2.5 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
                      <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                      <p className="text-sm font-bold text-green-800">Order verified</p>
                    </div>

                    <p className="text-sm text-gray-600 leading-relaxed mt-4">
                      Write this bill verification code on the customer&apos;s bill.
                      They enter it in STRIVUP to complete the task.
                    </p>

                    <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/60 px-5 py-5 text-center">
                      <div className="flex items-center justify-center gap-2 text-blue-700">
                        <Receipt size={16} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">
                          Bill verification code
                        </span>
                      </div>
                      <p className="text-[34px] leading-none font-bold tracking-[0.18em] text-blue-700 mt-2.5 select-all">
                        {billCode}
                      </p>
                      <button
                        onClick={handleCopyBill}
                        className="mt-4 inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
                      >
                        {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy code</>}
                      </button>
                    </div>

                    <button
                      onClick={reset}
                      className="mt-4 w-full h-11 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-semibold text-gray-700 transition-colors"
                    >
                      Verify another order
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Confirm this order actually arrived before verifying. STRIVUP
                      will then generate the bill code to write on the bill.
                    </p>
                    <button
                      onClick={handleVerify}
                      disabled={verifying}
                      className="mt-4 w-full h-12 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      {verifying
                        ? <><Loader2 size={16} className="animate-spin" /> Verifying…</>
                        : <><ShieldCheck size={16} /> Verify Order</>}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Open queue ───────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold text-gray-900">Open verifications</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Codes issued to participants that are not closed yet.
              </p>
            </div>
            {queue.length > 0 && (
              <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full shrink-0">
                {queue.length}
              </span>
            )}
          </div>

          {queue.length === 0 ? (
            <p className="text-sm text-gray-400 mt-6 text-center py-10 border border-dashed border-gray-200 rounded-xl">
              Nothing waiting right now.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-100">
              {queue.map((v) => (
                <li key={v.id} className="flex items-center gap-4 py-3">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      v.status === "order_verified"
                        ? "bg-green-50 text-green-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {v.status === "order_verified"
                      ? <CheckCircle2 size={16} />
                      : <Clock size={16} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {v.participant_name ?? "Participant"}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {v.quest_title} · {v.task_title} · {timeAgo(v.created_at)}
                    </p>
                  </div>
                  <span className="text-sm font-bold tracking-wider text-gray-700 shrink-0 hidden sm:block">
                    {v.order_code}
                  </span>
                  <button
                    onClick={() => { setCode(v.order_code); void handleSearch(v.order_code); }}
                    className="h-8 px-3 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700 shrink-0 transition-colors"
                  >
                    Open
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
