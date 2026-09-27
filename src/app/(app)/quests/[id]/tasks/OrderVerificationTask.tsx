"use client";
/**
 * OrderVerificationTask — participant side of the two-stage Quest order flow.
 *
 *   Ready      → order on Zomato/Swiggy, then "Post Proof" → Order code (SV-######)
 *   Waiting    → code shown; participant adds it to the order description
 *   Verified   → business confirmed the order; participant enters the Bill code
 *   Completed  → task done, progress +1
 *   Rejected / Expired → reason shown, participant can Post Proof again
 *
 * Only the bill-code step changes progress. See /how-quests-work.
 */
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Copy, ExternalLink, Loader2, Receipt, RefreshCw, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  formatCodeInput, redeemBillCode, startOrderVerification, type OrderRequest,
} from "@/lib/data/orderVerification";

export interface OrderTask {
  id: string;
  order_link_zomato?: string | null;
  order_link_swiggy?: string | null;
}

interface Props {
  task: OrderTask;
  request: OrderRequest | undefined;
  completed: boolean;
  isParticipant: boolean;
  onRequestChange: (req: OrderRequest) => void;
  onCompleted: (progress: { completed_tasks: number; total_tasks: number; quest_completed: boolean }) => void;
  onRefresh: () => Promise<void>;
}

function expiresIn(iso: string | null | undefined, now: number) {
  if (!iso) return null;
  const mins = Math.round((new Date(iso).getTime() - now) / 60000);
  if (mins <= 0) return "expired";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

export function OrderVerificationTask({ task, request, completed, isParticipant, onRequestChange, onCompleted, onRefresh }: Props) {
  const [supabase] = useState(() => createClient());
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billCode, setBillCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  // Captured once per mount; the page re-mounts/refreshes when the user returns.
  const [now] = useState(() => Date.now());
  const state: "ready" | "waiting" | "verified" | "rejected" | "expired" | "completed" =
    completed || request?.status === "completed" ? "completed"
    : !request ? "ready"
    : request.status === "rejected" ? "rejected"
    : request.status === "expired"
      || (request.status === "pending" && new Date(request.expires_at).getTime() < now)
      || (request.status === "approved" && request.bill_code_expires_at && new Date(request.bill_code_expires_at).getTime() < now)
      ? "expired"
    : request.status === "approved" ? "verified"
    : "waiting";

  const postProof = async () => {
    setBusy(true); setError(null);
    const res = await startOrderVerification(supabase, task.id);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    onRequestChange({
      id: res.request_id, sv_code: res.code, task_id: task.id, quest_id: request?.quest_id ?? null,
      status: res.status, rejection_reason: null, expires_at: res.expires_at, bill_code_expires_at: null,
      business_verified_at: null, completed_at: null, created_at: new Date().toISOString(),
    });
  };

  const submitBillCode = async () => {
    setBusy(true); setError(null);
    const res = await redeemBillCode(supabase, task.id, billCode);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setJustCompleted(true);
    onCompleted(res);
  };

  const refresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  if (!isParticipant) return null;

  return (
    <div className="p-4 flex flex-col gap-3">
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

      {state === "completed" && (
        <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <CheckCircle2 size={22} className="text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-bold text-green-900">Task Completed ✓</p>
            <p className="text-xs text-green-800">{justCompleted ? "+1 Quest progress. Nice work!" : "Verified by the business and your bill code."}</p>
          </div>
        </div>
      )}

      {(state === "ready" || state === "rejected" || state === "expired") && (
        <>
          {state === "rejected" && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2.5">
              <XCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-bold">Verification rejected</p>
                <p>Your order could not be verified for this Quest.{request?.rejection_reason ? ` Reason: ${request.rejection_reason}` : ""}</p>
              </div>
            </div>
          )}
          {state === "expired" && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-sm text-amber-900">
              <Clock size={16} className="shrink-0 mt-0.5" />
              <p><span className="font-bold">Code expired.</span> Generate a new code for your next order.</p>
            </div>
          )}

          <ol className="flex flex-col gap-2 text-sm text-gray-700">
            <li className="flex gap-2"><span className="font-black text-blue-600">1.</span>Add the eligible item to your cart on Zomato or Swiggy.</li>
            <li className="flex gap-2"><span className="font-black text-blue-600">2.</span>Before placing the order, tap Post Proof to get your verification code.</li>
          </ol>

          {(task.order_link_zomato || task.order_link_swiggy) && (
            <div className="flex gap-2">
              {task.order_link_zomato && (
                <a href={task.order_link_zomato} target="_blank" rel="noopener noreferrer"
                  className="flex-1 h-11 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-bold flex items-center justify-center gap-1.5">
                  Order on Zomato <ExternalLink size={14} />
                </a>
              )}
              {task.order_link_swiggy && (
                <a href={task.order_link_swiggy} target="_blank" rel="noopener noreferrer"
                  className="flex-1 h-11 rounded-xl border border-orange-200 bg-orange-50 text-orange-700 text-sm font-bold flex items-center justify-center gap-1.5">
                  Order on Swiggy <ExternalLink size={14} />
                </a>
              )}
            </div>
          )}

          <button type="button" onClick={postProof} disabled={busy}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
            {state === "ready" ? "Post Proof — Get Verification Code" : "Post Proof Again"}
          </button>
        </>
      )}

      {state === "waiting" && request && (
        <>
          <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 px-4 py-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Your verification code</p>
            <p className="mt-1 font-mono text-[32px] font-black tracking-widest text-gray-900">{request.sv_code}</p>
            <button type="button" onClick={() => copy(request.sv_code)}
              className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-bold text-blue-700 border border-blue-200">
              <Copy size={14} /> {copied ? "Copied" : "Copy Code"}
            </button>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Add this code to your <span className="font-semibold">Zomato/Swiggy order description</span> before placing your order.
            The business will verify it when your order arrives.
          </p>
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-700"><Clock size={15} /> Waiting for business</span>
            <span className="text-xs text-gray-600">Valid {expiresIn(request.expires_at, now)}</span>
          </div>
          <button type="button" onClick={refresh} disabled={refreshing}
            className="h-10 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 flex items-center justify-center gap-1.5">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Check status
          </button>
        </>
      )}

      {state === "verified" && (
        <>
          <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2.5">
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            <p className="text-sm font-bold text-green-900">Order Verified ✓</p>
          </div>
          <label htmlFor={`bill-${task.id}`} className="text-sm font-semibold text-gray-900">
            Enter the verification code written on your bill
          </label>
          <input id={`bill-${task.id}`} value={billCode} onChange={e => { setBillCode(formatCodeInput(e.target.value, "BV")); setError(null); }}
            onKeyDown={e => e.key === "Enter" && billCode.length >= 9 && submitBillCode()}
            placeholder="BV-000000" inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" maxLength={9}
            className="h-14 rounded-xl border border-gray-300 bg-white px-4 text-center font-mono text-2xl font-black tracking-widest text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          <p className="text-xs text-gray-600">Bill code valid for {expiresIn(request?.bill_code_expires_at, now)}.</p>
          <button type="button" onClick={submitBillCode} disabled={busy || billCode.length < 9}
            className="w-full h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Verify &amp; Complete Task
          </button>
        </>
      )}

      {state !== "completed" && (
        <Link href="/how-quests-work" className="text-center text-xs font-semibold text-blue-700 underline">
          How does order verification work?
        </Link>
      )}
    </div>
  );
}
