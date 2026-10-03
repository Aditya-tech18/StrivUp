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
  AlertCircle, ArrowLeft, Check, CheckCircle2, ClipboardCheck, Clock,
  Copy, Loader2, Receipt, ShieldCheck, X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  completeTaskWithBillCode, issueOrderCode,
  type OrderVerification,
} from "@/lib/data/questOrderVerification";

type Step = "ask" | "not_yet" | "codes" | "done";

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
  // Both an issued code and a verified order land on the same screen: the two
  // OTP sections are always shown together, with the second one locked until
  // the business has verified.
  if (row.status === "order_verified" || row.status === "code_issued") return "codes";
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
    setStep("codes");
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
      case "codes":   return "Order verification";
      case "done":    return "Task completed";
    }
  }, [step]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-primary/60 backdrop-blur-sm px-0 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${taskTitle} — order verification`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl border border-outline-variant elev-5 max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-surface-container-lowest border-b border-outline-variant px-5 py-4 flex items-center gap-3 rounded-t-3xl sm:rounded-t-2xl">
          {step === "not_yet" && (
            <button
              onClick={() => setStep("ask")}
              aria-label="Back"
              className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center shrink-0"
            >
              <ArrowLeft size={18} className="text-on-surface-variant" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-body-lg font-bold text-on-surface truncate">{title}</p>
            <p className="text-xs text-on-surface-variant truncate">{taskTitle}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center shrink-0"
          >
            <X size={18} className="text-on-surface-variant" />
          </button>
        </div>

        <div className="px-5 py-5">

          {/* ── Step: ask ─────────────────────────────────────────────── */}
          {step === "ask" && (
            <>
              <p className="text-headline-md font-bold text-on-surface leading-snug">
                Hey {userName} <span aria-hidden="true">👋</span>
              </p>
              <p className="text-sm text-on-surface-variant leading-relaxed mt-2">
                Did you order from{" "}
                <span className="font-semibold text-on-surface">{businessName}</span>{" "}
                online for this Quest?
              </p>

              {error && <ErrorNote message={error} />}

              <div className="flex flex-col gap-2.5 mt-5">
                <button
                  onClick={handleYes}
                  disabled={busy}
                  className="h-12 rounded-xl bg-secondary hover:opacity-90 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  {busy
                    ? <><Loader2 size={16} className="animate-spin" /> Starting…</>
                    : "YES, I ORDERED"}
                </button>
                <button
                  onClick={() => setStep("not_yet")}
                  disabled={busy}
                  className="h-12 rounded-xl border border-outline-variant hover:bg-surface-container-low text-on-surface-variant font-bold text-sm transition-colors"
                >
                  NO, NOT YET
                </button>
              </div>
            </>
          )}

          {/* ── Step: not yet ─────────────────────────────────────────── */}
          {step === "not_yet" && (
            <>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Start the verification when you are ready to order. STRIVUP will
                give you a code to add to your order description on Zomato or
                Swiggy, so{" "}
                <span className="font-semibold text-on-surface">{businessName}</span>{" "}
                can match the order to your Quest.
              </p>
              <ol className="mt-4 flex flex-col gap-2.5">
                {ORDER_STEPS.map((text, i) => (
                  <li key={text} className="flex gap-3 items-start">
                    <span className="w-5 h-5 rounded-full bg-surface-container text-on-surface-variant text-label-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-on-surface-variant leading-relaxed">{text}</span>
                  </li>
                ))}
              </ol>
              <button
                onClick={() => setStep("ask")}
                className="mt-5 w-full h-11 rounded-xl bg-secondary hover:opacity-90 text-white font-bold text-sm transition-colors"
              >
                Got it
              </button>
            </>
          )}

          {/* ── Step: codes ───────────────────────────────────────────── */}
          {/* Both OTP sections live on one screen. Section 2 is visible from
              the start but locked until the business verifies, so the whole
              two code journey is legible at a glance instead of appearing one
              step at a time. */}
          {step === "codes" && row && (
            <>
              {(() => {
                const verified = row.status === "order_verified";
                return (
                  <>
                    {/* ── Section 1: the code STRIVUP generated ─────────── */}
                    <section aria-labelledby="otp-1-heading">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-secondary text-white text-label-sm font-bold flex items-center justify-center shrink-0">
                          1
                        </span>
                        <h3 id="otp-1-heading" className="text-sm font-bold text-on-surface">
                          Your STRIVUP order code
                        </h3>
                        <span className="ml-auto text-label-sm font-bold px-2 py-0.5 rounded-full border border-success-outline bg-success-container text-on-success-container">
                          Generated
                        </span>
                      </div>

                      <div className="mt-2.5 rounded-2xl border border-secondary-fixed-dim bg-secondary-fixed/60 px-5 py-5 text-center">
                        <p className="text-display-mobile leading-none font-bold tracking-[0.18em] text-secondary select-all">
                          {row.order_code}
                        </p>
                        <button
                          onClick={handleCopy}
                          className="mt-4 inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-secondary hover:opacity-90 text-white text-sm font-bold transition-colors"
                        >
                          {copied
                            ? <><Check size={15} /> COPIED</>
                            : <><Copy size={15} /> COPY OTP</>}
                        </button>
                      </div>

                      <p className="text-sm text-on-surface-variant leading-relaxed mt-3">
                        Add this code to the order description on Zomato or Swiggy{" "}
                        <span className="font-semibold text-on-surface">before</span> placing
                        your order.
                      </p>
                    </section>

                    {/* ── Section 2: the code the business writes on the bill ─ */}
                    <section aria-labelledby="otp-2-heading" className="mt-6 pt-5 border-t border-outline-variant">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full text-label-sm font-bold flex items-center justify-center shrink-0 ${
                          verified ? "bg-secondary text-white" : "bg-surface-container-highest text-on-surface-variant"}`}>
                          2
                        </span>
                        <h3 id="otp-2-heading" className={`text-sm font-bold ${
                          verified ? "text-on-surface" : "text-on-surface-variant"}`}>
                          Bill verification code
                        </h3>
                        <span className={`ml-auto inline-flex items-center gap-1 text-label-sm font-bold px-2 py-0.5 rounded-full border ${
                          verified
                            ? "border-success-outline bg-success-container text-on-success-container"
                            : "border-warning-outline bg-warning-container text-on-warning-container"}`}>
                          {verified
                            ? <><CheckCircle2 size={10} /> Order verified</>
                            : <><Clock size={10} /> Awaiting business</>}
                        </span>
                      </div>

                      <label htmlFor="bill-code" className="sr-only">
                        Bill verification code
                      </label>
                      <div className={`mt-2.5 flex items-center gap-2 rounded-xl border-2 px-4 h-14 transition-colors ${
                        verified
                          ? "border-outline-variant focus-within:border-secondary bg-surface-container-lowest"
                          : "border-outline-variant bg-surface-container-low"}`}>
                        <Receipt size={18} className="text-on-surface-variant shrink-0" />
                        <input
                          id="bill-code"
                          value={billInput}
                          disabled={!verified}
                          onChange={(e) => { setBillInput(e.target.value.toUpperCase()); setError(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") handleBillSubmit(); }}
                          placeholder={verified ? "SV____" : "Locked until verified"}
                          maxLength={10}
                          autoComplete="off"
                          spellCheck={false}
                          className="flex-1 min-w-0 bg-transparent text-xl font-bold tracking-[0.18em] text-on-surface placeholder:text-on-surface-variant placeholder:text-base placeholder:tracking-normal focus:outline-none disabled:cursor-not-allowed"
                        />
                      </div>

                      <p className="text-xs text-on-surface-variant leading-relaxed mt-2">
                        {verified
                          ? "Enter the code the business wrote on your bill."
                          : "The business writes this on your bill once it has verified your order. Come back then."}
                      </p>

                      {verified && (
                        <button
                          onClick={handleBillSubmit}
                          disabled={busy || !billInput.trim()}
                          className="mt-3 w-full h-12 rounded-xl bg-secondary hover:opacity-90 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                          {busy
                            ? <><Loader2 size={16} className="animate-spin" /> Verifying...</>
                            : <><ShieldCheck size={16} /> Verify and Complete Task</>}
                        </button>
                      )}
                    </section>

                    {error && <ErrorNote message={error} />}

                    <p className="mt-5 text-xs text-on-surface-variant leading-relaxed bg-surface-container-low border border-outline-variant rounded-xl px-3.5 py-3">
                      One code per task. This is your code for this task and it
                      stays the same every time you come back, for as long as the
                      Quest is running.
                    </p>

                    {!verified && (
                      <button
                        onClick={onClose}
                        className="mt-4 w-full h-11 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-sm transition-colors"
                      >
                        Done, I have added the code
                      </button>
                    )}
                  </>
                );
              })()}
            </>
          )}

          {/* ── Step: done ────────────────────────────────────────────── */}
          {step === "done" && (
            <div className="text-center py-3">
              <div className="w-14 h-14 rounded-full bg-success-container border border-success-outline flex items-center justify-center mx-auto">
                <ClipboardCheck size={26} className="text-on-success-container" />
              </div>
              <p className="text-headline-md font-bold text-on-surface mt-4">
                Task Completed <span aria-hidden="true">✓</span>
              </p>
              <p className="text-sm text-on-surface-variant mt-1.5">
                Your Quest progress has been updated.
              </p>
              <button
                onClick={onClose}
                className="mt-6 w-full h-12 rounded-xl bg-secondary hover:opacity-90 text-white font-bold text-sm transition-colors"
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
      className="mt-4 flex items-start gap-2.5 rounded-xl bg-error-container border border-error-outline px-3.5 py-3"
    >
      <AlertCircle size={16} className="text-error shrink-0 mt-0.5" />
      <p className="text-sm text-on-error-container leading-relaxed">{message}</p>
    </div>
  );
}
