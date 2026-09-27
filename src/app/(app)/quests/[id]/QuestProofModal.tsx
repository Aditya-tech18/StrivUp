"use client";
/**
 * QuestProofModal — "Upload Proof" for Order Verification tasks.
 *
 * Steps (derived from the participant's latest attempt for the task):
 *   join     → not a participant yet
 *   ask      → "Hey {name}, are you ordering from {business}?"
 *   notyet   → add the item first (Zomato/Swiggy links)
 *   code     → order code (OTP 1) + how to use it; never shows the bill code
 *   bill     → business verified; enter the code written on the bill (OTP 2)
 *   done     → task completed, progress updated
 *   rejected → business rejected the order (reason), can start again
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Info, Loader2, X, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  formatCodeInput, redeemBillCode, startOrderVerification, type OrderRequest,
} from "@/lib/data/orderVerification";

type Step = "join" | "ask" | "notyet" | "code" | "bill" | "done" | "rejected";

export interface ProofModalTask {
  id: string;
  title: string;
  order_link_zomato?: string | null;
  order_link_swiggy?: string | null;
}

interface Props {
  task: ProofModalTask;
  questTitle: string;
  businessName: string;
  userName: string | null;
  isParticipant: boolean;
  request: OrderRequest | undefined;
  completed: boolean;
  onClose: () => void;
  onJoin: () => Promise<boolean>;
  onRequestChange: (req: OrderRequest) => void;
  onCompleted: () => void;
}

function initialStep(p: Pick<Props, "isParticipant" | "request" | "completed">): Step {
  if (p.completed || p.request?.status === "completed") return "done";
  if (!p.isParticipant) return "join";
  const r = p.request;
  if (!r) return "ask";
  if (r.status === "pending") return "code";
  if (r.status === "approved") return "bill";
  if (r.status === "rejected") return "rejected";
  return "ask"; // expired → start again
}

export function QuestProofModal(props: Props) {
  const { task, questTitle, businessName, userName, request, onClose } = props;
  const [supabase] = useState(() => createClient());
  const [step, setStep] = useState<Step>(() => initialStep(props));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [billCode, setBillCode] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus(); // focus the dialog itself; Tab moves into its controls
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus(); };
  }, [onClose]);

  const generate = async () => {
    setBusy(true); setError(null);
    const res = await startOrderVerification(supabase, task.id);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    props.onRequestChange({
      id: res.request_id, sv_code: res.code, task_id: task.id, quest_id: null, status: res.status,
      rejection_reason: null, expires_at: res.expires_at, bill_code_expires_at: null,
      business_verified_at: null, completed_at: null, created_at: new Date().toISOString(),
    });
    setStep(res.status === "approved" ? "bill" : "code");
  };

  const join = async () => {
    setBusy(true); setError(null);
    const ok = await props.onJoin();
    setBusy(false);
    if (ok) setStep("ask"); else setError("Couldn't join the Quest. Please try again.");
  };

  const verifyBill = async () => {
    setBusy(true); setError(null);
    const res = await redeemBillCode(supabase, task.id, billCode);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    props.onCompleted();
    setStep("done");
  };

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ }
  };

  const hasLinks = !!(task.order_link_zomato || task.order_link_swiggy);
  const orderLinks = hasLinks ? (
    <div className="flex gap-2">
      {task.order_link_zomato && (
        <a href={task.order_link_zomato} target="_blank" rel="noopener noreferrer"
          className="flex-1 h-11 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-bold flex items-center justify-center gap-1.5">
          Zomato <ExternalLink size={14} aria-hidden="true" />
        </a>
      )}
      {task.order_link_swiggy && (
        <a href={task.order_link_swiggy} target="_blank" rel="noopener noreferrer"
          className="flex-1 h-11 rounded-xl border border-orange-200 bg-orange-50 text-orange-800 text-sm font-bold flex items-center justify-center gap-1.5">
          Swiggy <ExternalLink size={14} aria-hidden="true" />
        </a>
      )}
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#0d1c32]/50" tabIndex={-1} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="proof-modal-title" tabIndex={-1}
        className="relative outline-none w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white shadow-[0_24px_64px_-12px_rgba(13,28,50,0.35)] max-h-[92dvh] overflow-y-auto [padding-bottom:max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Upload Proof</p>
            <p className="truncate text-sm font-bold text-gray-900">{task.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 pt-5">
          {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {step === "join" && (
            <>
              <h2 id="proof-modal-title" className="text-xl font-black text-gray-900">Join the Quest first</h2>
              <p className="text-sm text-gray-700">Join <span className="font-semibold">{questTitle}</span> to start this task and track your progress.</p>
              <button type="button" onClick={join} disabled={busy}
                className="h-12 rounded-xl bg-blue-600 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50">
                {busy && <Loader2 size={16} className="animate-spin" />} Join Quest
              </button>
            </>
          )}

          {step === "ask" && (
            <>
              <h2 id="proof-modal-title" className="text-xl font-black text-gray-900">Hey {userName ?? "there"} 👋</h2>
              <p className="text-[15px] text-gray-800">
                Are you ordering from <span className="font-bold">{businessName}</span> on Zomato or Swiggy for this Quest?
              </p>
              <p className="text-sm text-gray-600">We&apos;ll give you a code to add to the order before you place it.</p>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={generate} disabled={busy}
                  className="h-12 rounded-xl bg-blue-600 text-sm font-bold uppercase tracking-wide text-white flex items-center justify-center gap-2 disabled:opacity-50">
                  {busy && <Loader2 size={16} className="animate-spin" />} Yes, I&apos;m ordering
                </button>
                <button type="button" onClick={() => setStep("notyet")}
                  className="h-12 rounded-xl border border-gray-200 text-sm font-bold uppercase tracking-wide text-gray-800">
                  Not yet
                </button>
              </div>
            </>
          )}

          {step === "notyet" && (
            <>
              <h2 id="proof-modal-title" className="text-xl font-black text-gray-900">No problem</h2>
              <p className="text-sm text-gray-700">
                Add an eligible item from {businessName} to your cart, then come back and tap Upload Proof before you place the order.
              </p>
              {orderLinks}
              <button type="button" onClick={onClose} className="h-12 rounded-xl border border-gray-200 text-sm font-bold text-gray-800">Got it</button>
            </>
          )}

          {step === "code" && request && (
            <>
              <h2 id="proof-modal-title" className="text-xl font-black text-gray-900">Great! Let&apos;s verify your order.</h2>
              <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 px-4 py-4 text-center">
                <p className="text-xs font-semibold text-blue-900">Your unique STRIVUP verification code is:</p>
                <p className="mt-1 font-mono text-[34px] font-black tracking-widest text-gray-900">{request.sv_code}</p>
                <button type="button" onClick={() => copy(request.sv_code)}
                  className="mt-2 inline-flex h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-5 text-sm font-bold uppercase tracking-wide text-white">
                  <Copy size={15} /> {copied ? "Copied" : "Copy OTP"}
                </button>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                Add this code to the order description/instructions on Zomato or Swiggy before placing your order.
              </p>
              <ol className="flex flex-col gap-2">
                {["Select your eligible item", "Add the STRIVUP code to the order description", "Place your order",
                  "Wait for the business to verify it", "The business will write the final bill verification code on your bill"].map((t, i) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-gray-800">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-800">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
              {orderLinks}
              <p className="flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-700">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                This code is for this task attempt only and is limited by the Quest&apos;s verification rules. Come back to this task once your order arrives.
              </p>
              <button type="button" onClick={onClose} className="h-12 rounded-xl border border-gray-200 text-sm font-bold text-gray-800">Done</button>
            </>
          )}

          {step === "bill" && (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-3">
                <CheckCircle2 size={20} className="shrink-0 text-green-700" />
                <div>
                  <h2 id="proof-modal-title" className="text-sm font-black text-green-900">Order Verified ✓</h2>
                  <p className="text-xs text-green-900">Your business verification is complete.</p>
                </div>
              </div>
              <label htmlFor="bill-code" className="text-[15px] font-bold text-gray-900">Enter the verification code written on your bill.</label>
              <input id="bill-code" value={billCode} onChange={e => { setBillCode(formatCodeInput(e.target.value, "BV")); setError(null); }}
                onKeyDown={e => e.key === "Enter" && billCode.length >= 9 && verifyBill()}
                placeholder="BV-______" autoCapitalize="characters" autoComplete="one-time-code" maxLength={9}
                className="h-14 rounded-xl border border-gray-300 px-4 text-center font-mono text-2xl font-black tracking-widest text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
              <button type="button" onClick={verifyBill} disabled={busy || billCode.length < 9}
                className="h-12 rounded-xl bg-green-600 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Verify &amp; Complete Task
              </button>
            </>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 shadow-[0_8px_24px_-6px_rgba(22,163,74,0.5)]">
                <CheckCircle2 size={32} className="text-white" />
              </div>
              <h2 id="proof-modal-title" className="text-xl font-black text-gray-900">Task Completed ✓</h2>
              <p className="text-sm text-gray-700">Your Quest progress has been updated.</p>
              <button type="button" onClick={onClose} className="mt-2 h-12 w-full rounded-xl bg-blue-600 text-sm font-bold text-white">Continue</button>
            </div>
          )}

          {step === "rejected" && (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3">
                <XCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
                <div>
                  <h2 id="proof-modal-title" className="text-sm font-black text-red-900">Verification rejected</h2>
                  <p className="text-sm text-red-800">
                    Your order could not be verified for this Quest.{request?.rejection_reason ? ` Reason: ${request.rejection_reason}` : ""}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setStep("ask")}
                className="h-12 rounded-xl bg-blue-600 text-sm font-bold text-white">Start a new order</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
