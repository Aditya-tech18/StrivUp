"use client";
/**
 * OrderVerificationModal — the "Upload Proof" flow for order_verification tasks.
 *
 * Five steps, driven by the verification row's status rather than by local
 * state, so re-opening the modal lands the user wherever they actually are:
 *
 *   ask        did you order from {business}?      (no row yet)
 *   code       here is your ORDER code             (code_issued)
 *   waiting    business has not verified yet       (code_issued, code seen)
 *   bill       enter the BILL code                 (order_verified)
 *   done       task completed                      (completed)
 *
 * The BILL code is deliberately never rendered here — only the business sees
 * it, and only after it has verified the order.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowLeft, Check, CheckCircle2, ClipboardCheck,
  Copy, Loader2, Receipt, ShieldCheck, X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  completeTaskWithBillCode, issueOrderCode,
  type OrderVerification,
} from "@/lib/data/questOrderVerification";

type Step = "ask" | "not_yet" | "code" | "waiting" | "bill" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
  supabase: SupabaseClient;
  questId: string;
  taskId: string;
  taskTitle: string;
  /** Dynamic — the logged-in user's display name. */
  userName: string;
  /** Dynamic — from the business that created this Quest. */
  businessName: string;
  existing: OrderVerification | null;
  onCompleted: (row: OrderVerification) => void;
  onIssued: (row: OrderVerification) => void;
}

function stepFor(row: OrderVerification | null): Step {
  if (!row) return "ask";
  if (row.status === "completed") return "done";
  if (row.status === "order_verified") return "bill";
  if (row.status === "code_issued") return "code";
  return "ask";
}

const ORDER_STEPS = [
  "Select your eligible item",
  "Add the STRIVUP code to the order description",
  "Place your order",
  "Wait for the business to verify it",
  "The business will provide the final bill verification code",
];

export default function OrderVerificationModal({
  open, onClose, supabase, questId, taskId, taskTitle,
  userName, businessName, existing, onCompleted, onIssued,
}: Props) {
  const [step, setStep] = useState<Step>(() => stepFor(existing));
  const [row, setRow] = useState<OrderVerification | null>(existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [billInput, setBillInput] = useState("");

  // No open/close sync effect here on purpose: the parent mounts this modal
  // per task (keyed on the task id), so every open starts from a fresh
  // initial state derived from `existing`. That already lands a user whose
  // order the business verified since last time straight on the bill step,
  // and it keeps local edits from being clobbered by a parent re-render.

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleYes = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await issueOrderCode(supabase, questId, taskId);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setRow(res.data);
    onIssued(res.data);
    setStep(res.data.status === "order_verified" ? "bill" : "code");
  }, [supabase, questId, taskId, onIssued]);

  const handleCopy = useCallback(async () => {
    if (!row?.order_code) return;
    try {
      await navigator.clipboard.writeText(row.order_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some embedded/insecure contexts — the code is
      // on screen in selectable text, so this is a non-event.
      setError("Copy blocked by your browser — select the code above instead.");
    }
  }, [row]);

  const handleBillSubmit = useCallback(async () => {
    const code = billInput.trim();
    if (!code) { setError("Enter the code written on your bill."); return; }
    setBusy(true);
    setError(null);
    const res = await completeTaskWithBillCode(supabase, questId, taskId, code);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setRow(res.data);
    onCompleted(res.data);
    setStep("done");
  }, [billInput, supabase, questId, taskId, onCompleted]);

  const title = useMemo(() => {
    switch (step) {
      case "ask":     return "Order verification";
      case "not_yet": return "No problem";
      case "code":    return "Your STRIVUP code";
      case "waiting": return "Waiting for the business";
      case "bill":    return "Final bill verification";
      case "done":    return "Task completed";
    }
  }, [step]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-gray-900/60 backdrop-blur-sm px-0 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${taskTitle} — order verification`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-gray-200 shadow-xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 rounded-t-3xl sm:rounded-t-2xl">
          {(step === "not_yet" || step === "waiting") && (
            <button
              onClick={() => setStep(step === "not_yet" ? "ask" : "code")}
              aria-label="Back"
              className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center shrink-0"
            >
              <ArrowLeft size={18} className="text-gray-500" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-gray-900 truncate">{title}</p>
            <p className="text-xs text-gray-400 truncate">{taskTitle}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center shrink-0"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-5">

          {/* ── Step: ask ─────────────────────────────────────────────── */}
          {step === "ask" && (
            <>
              <p className="text-[19px] font-bold text-gray-900 leading-snug">
                Hey {userName} <span aria-hidden="true">👋</span>
              </p>
              <p className="text-sm text-gray-600 leading-relaxed mt-2">
                Did you order from{" "}
                <span className="font-semibold text-gray-900">{businessName}</span>{" "}
                online for this Quest?
              </p>

              {error && <ErrorNote message={error} />}

              <div className="flex flex-col gap-2.5 mt-5">
                <button
                  onClick={handleYes}
                  disabled={busy}
                  className="h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  {busy
                    ? <><Loader2 size={16} className="animate-spin" /> Starting…</>
                    : "YES, I ORDERED"}
                </button>
                <button
                  onClick={() => setStep("not_yet")}
                  disabled={busy}
                  className="h-12 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-sm transition-colors"
                >
                  NO, NOT YET
                </button>
              </div>
            </>
          )}

          {/* ── Step: not yet ─────────────────────────────────────────── */}
          {step === "not_yet" && (
            <>
              <p className="text-sm text-gray-600 leading-relaxed">
                Start the verification when you are ready to order. STRIVUP will
                give you a code to add to your order description on Zomato or
                Swiggy, so{" "}
                <span className="font-semibold text-gray-900">{businessName}</span>{" "}
                can match the order to your Quest.
              </p>
              <ol className="mt-4 flex flex-col gap-2.5">
                {ORDER_STEPS.map((text, i) => (
                  <li key={text} className="flex gap-3 items-start">
                    <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-600 leading-relaxed">{text}</span>
                  </li>
                ))}
              </ol>
              <button
                onClick={() => setStep("ask")}
                className="mt-5 w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors"
              >
                Got it
              </button>
            </>
          )}

          {/* ── Step: code ────────────────────────────────────────────── */}
          {(step === "code" || step === "waiting") && row && (
            <>
              <p className="text-[17px] font-bold text-gray-900">
                Great! Let&apos;s verify your order.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Your unique STRIVUP verification code is:
              </p>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/60 px-5 py-5 text-center">
                <p className="text-[34px] leading-none font-bold tracking-[0.18em] text-blue-700 select-all">
                  {row.order_code}
                </p>
                <button
                  onClick={handleCopy}
                  className="mt-4 inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
                >
                  {copied
                    ? <><Check size={15} /> COPIED</>
                    : <><Copy size={15} /> COPY OTP</>}
                </button>
              </div>

              <p className="text-sm text-gray-600 leading-relaxed mt-4">
                Add this code to the order description / instructions on Zomato
                or Swiggy <span className="font-semibold text-gray-900">before</span>{" "}
                placing your order.
              </p>

              <ol className="mt-4 flex flex-col gap-2.5">
                {ORDER_STEPS.map((text, i) => (
                  <li key={text} className="flex gap-3 items-start">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-600 leading-relaxed">{text}</span>
                  </li>
                ))}
              </ol>

              <p className="mt-4 text-xs text-gray-400 leading-relaxed bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-3">
                Your STRIVUP order verification code is valid for this task
                attempt and is limited according to the Quest verification rules.
              </p>

              {error && <ErrorNote message={error} />}

              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  onClick={onClose}
                  className="h-11 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm transition-colors"
                >
                  Done — I&apos;ve added the code
                </button>
                <p className="text-center text-xs text-gray-400">
                  Come back here once the business has verified your order.
                </p>
              </div>
            </>
          )}

          {/* ── Step: bill ────────────────────────────────────────────── */}
          {step === "bill" && row && (
            <>
              <div className="flex items-center gap-2.5 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
                <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-green-800">Order Verified</p>
                  <p className="text-xs text-green-700">
                    Your business verification is complete.
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600 leading-relaxed mt-4">
                Enter the verification code written on your bill.
              </p>

              <label htmlFor="bill-code" className="sr-only">
                Bill verification code
              </label>
              <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-gray-200 focus-within:border-blue-500 bg-white px-4 h-14 transition-colors">
                <Receipt size={18} className="text-gray-400 shrink-0" />
                <input
                  id="bill-code"
                  value={billInput}
                  onChange={(e) => { setBillInput(e.target.value.toUpperCase()); setError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleBillSubmit(); }}
                  placeholder="SV____"
                  maxLength={10}
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 min-w-0 bg-transparent text-xl font-bold tracking-[0.18em] text-gray-900 placeholder:text-gray-300 placeholder:tracking-[0.18em] focus:outline-none"
                />
              </div>

              {error && <ErrorNote message={error} />}

              <button
                onClick={handleBillSubmit}
                disabled={busy || !billInput.trim()}
                className="mt-4 w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                {busy
                  ? <><Loader2 size={16} className="animate-spin" /> Verifying…</>
                  : <><ShieldCheck size={16} /> Verify &amp; Complete Task</>}
              </button>

              <p className="mt-3 text-xs text-gray-400 text-center leading-relaxed">
                The business writes this code on your bill after verifying your
                order in STRIVUP.
              </p>
            </>
          )}

          {/* ── Step: done ────────────────────────────────────────────── */}
          {step === "done" && (
            <div className="text-center py-3">
              <div className="w-14 h-14 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto">
                <ClipboardCheck size={26} className="text-green-600" />
              </div>
              <p className="text-[19px] font-bold text-gray-900 mt-4">
                Task Completed <span aria-hidden="true">✓</span>
              </p>
              <p className="text-sm text-gray-500 mt-1.5">
                Your Quest progress has been updated.
              </p>
              <button
                onClick={onClose}
                className="mt-6 w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors"
              >
                Back to Quest
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-3.5 py-3"
    >
      <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
      <p className="text-sm text-red-700 leading-relaxed">{message}</p>
    </div>
  );
}
