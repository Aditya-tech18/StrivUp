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
    <div className="flex flex-col gap-3 p-4">
      {state !== "completed" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-on-surface">Two-Code Verification</p>
          <span className="rounded-full bg-secondary/12 px-2.5 py-1 text-xs font-bold text-secondary">
            Step {state === "verified" ? 2 : 1} of 2
          </span>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-on-error-container bg-error-container border border-error-outline rounded-xl px-3 py-2">{error}</p>}

      {state === "completed" && (
        <div className="flex items-center gap-3 rounded-xl bg-success-container border border-success-outline px-4 py-3">
          <CheckCircle2 size={22} className="text-on-success-container shrink-0" />
          <div>
            <p className="text-sm font-bold text-on-success-container">Task Completed ✓</p>
            <p className="text-xs text-on-success-container">{justCompleted ? "+1 Quest progress. Nice work!" : "Verified by the business and your bill code."}</p>
          </div>
        </div>
      )}

      {(state === "ready" || state === "rejected" || state === "expired") && (
        <>
          {state === "rejected" && (
            <div className="flex items-start gap-2 rounded-xl bg-error-container border border-error-outline px-3 py-2.5">
              <XCircle size={16} className="text-on-error-container shrink-0 mt-0.5" />
              <div className="text-sm text-on-error-container">
                <p className="font-bold">Verification rejected</p>
                <p>Your order could not be verified for this Quest.{request?.rejection_reason ? ` Reason: ${request.rejection_reason}` : ""}</p>
              </div>
            </div>
          )}
          {state === "expired" && (
            <div className="flex items-start gap-2 rounded-xl bg-warning-container border border-warning-outline px-3 py-2.5 text-sm text-on-warning-container">
              <Clock size={16} className="shrink-0 mt-0.5" />
              <p><span className="font-bold">Code expired.</span> Generate a new code for your next order.</p>
            </div>
          )}

          <ol className="flex flex-col gap-2 text-sm text-on-surface-variant">
            <li className="flex gap-2"><span className="font-black text-secondary">1.</span>Add the eligible item to your cart on Zomato or Swiggy.</li>
            <li className="flex gap-2"><span className="font-black text-secondary">2.</span>Before placing the order, tap Post Proof to get your verification code.</li>
          </ol>

          {(task.order_link_zomato || task.order_link_swiggy) && (
            <div className="flex gap-2">
              {task.order_link_zomato && (
                <a href={task.order_link_zomato} target="_blank" rel="noopener noreferrer"
                  className="flex-1 h-11 rounded-xl border border-error-outline bg-error-container text-on-error-container text-sm font-bold flex items-center justify-center gap-1.5">
                  Order on Zomato <ExternalLink size={14} />
                </a>
              )}
              {task.order_link_swiggy && (
                <a href={task.order_link_swiggy} target="_blank" rel="noopener noreferrer"
                  className="flex-1 h-11 rounded-xl border border-warning-outline bg-warning-container text-on-warning-container text-sm font-bold flex items-center justify-center gap-1.5">
                  Order on Swiggy <ExternalLink size={14} />
                </a>
              )}
            </div>
          )}

          <button type="button" onClick={postProof} disabled={busy}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-on-secondary hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
            {state === "ready" ? "Post Proof — Get Verification Code" : "Post Proof Again"}
          </button>
        </>
      )}

      {state === "waiting" && request && (
        <>
          <div className="rounded-xl border border-outline-variant bg-surface-container-high p-3">
            <p className="flex items-center gap-2 text-sm font-bold text-on-surface">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-streak text-xs font-bold text-on-streak" aria-hidden="true">1</span>
              Your verification code
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-1.5">
              <p className="select-all break-all font-mono text-lg font-extrabold tracking-widest text-on-surface">{request.sv_code}</p>
              <button type="button" onClick={() => copy(request.sv_code)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-secondary hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-secondary">
                <Copy size={14} aria-hidden="true" /> {copied ? "Copied" : "Copy Code"}
              </button>
            </div>
          </div>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Add this code to your <span className="font-semibold">Zomato/Swiggy order description</span> before placing your order.
            The business will verify it when your order arrives.
          </p>
          <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-on-warning-container"><Clock size={15} /> Waiting for business</span>
            <span className="text-xs text-on-surface-variant">Valid {expiresIn(request.expires_at, now)}</span>
          </div>
          <button type="button" onClick={refresh} disabled={refreshing}
            className="h-10 rounded-xl border border-outline-variant text-sm font-semibold text-on-surface-variant flex items-center justify-center gap-1.5 tap-target">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Check status
          </button>
        </>
      )}

      {state === "verified" && (
        <>
          <div className="flex items-center gap-2 rounded-xl bg-success-container border border-success-outline px-3 py-2.5">
            <CheckCircle2 size={18} className="text-on-success-container shrink-0" />
            <p className="text-sm font-bold text-on-success-container">Order Verified ✓</p>
          </div>
          <div className="space-y-2.5 rounded-xl border border-outline-variant bg-surface-container-high p-3">
            <label htmlFor={`bill-${task.id}`} className="flex items-center gap-2 text-sm font-bold text-on-surface">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-on-secondary" aria-hidden="true">2</span>
              Enter the verification code written on your bill
            </label>
            <input id={`bill-${task.id}`} value={billCode} onChange={e => { setBillCode(formatCodeInput(e.target.value, "BV")); setError(null); }}
              onKeyDown={e => e.key === "Enter" && billCode.length >= 9 && submitBillCode()}
              placeholder="BV-000000" inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" maxLength={9}
              className="h-14 w-full rounded-xl border border-outline-variant bg-surface px-3 text-center font-mono text-xl font-extrabold tracking-widest text-on-surface placeholder:text-on-surface-variant focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30" />
            <p className="text-xs text-on-surface-variant">Bill code valid for {expiresIn(request?.bill_code_expires_at, now)}.</p>
            <button type="button" onClick={submitBillCode} disabled={busy || billCode.length < 9}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-on-secondary hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-40">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Verify &amp; Complete Task
            </button>
          </div>
        </>
      )}

      {state !== "completed" && (
        <Link href="/how-quests-work" className="text-center text-xs font-semibold text-secondary underline">
          How does order verification work?
        </Link>
      )}
    </div>
  );
}
