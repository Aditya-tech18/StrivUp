"use client";
/**
 * OrderVerificationModal — the "Upload Proof" flow for order_verification tasks.
 *
 * Driven by the verification row's status rather than by local state, so
 * re-opening the modal lands the user wherever they actually are:
 *
 *   loading    issuing the order code              (no row yet)
 *   codes      both OTP sections on one screen     (code_issued, order_verified)
 *   done       task completed                      (completed)
 *   failed     the code could not be issued        (retryable)
 *
 * CHANGED: the "Did you order from {business}?" question is gone. Tapping
 * Upload Proof now issues the code and shows it straight away. Asking first
 * was a gate with nothing behind it: whichever button was tapped, the next
 * useful thing was always the code, and someone who had not ordered yet still
 * needed it before they could order. issue_quest_order_code is idempotent by
 * design ("ONE TASK, ONE OTP, ONE USER" — it returns the live code rather
 * than minting a second one), so opening the sheet repeatedly cannot create
 * duplicate rows or invalidate a code already typed into an order.
 *
 * The instructions that used to sit behind "NO, NOT YET" are not lost: they
 * are on the How it works panel, reachable from the code screen.
 *
 * The BILL code is deliberately never rendered here — only the business sees
 * it, and only after it has verified the order.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, Check, CheckCircle2, ClipboardCheck, Clock,
  Copy, Loader2, Receipt, ShieldCheck, X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  completeTaskWithBillCode, issueOrderCode,
  type OrderVerification,
} from "@/lib/data/questOrderVerification";

type Step = "loading" | "failed" | "how" | "codes" | "done";

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
  // CHANGED: no row means the code has not been issued yet, so the sheet opens
  // on a spinner and issues it, rather than on a question.
  if (!row) return "loading";
  if (row.status === "completed") return "done";
  // Both an issued code and a verified order land on the same screen: the two
  // OTP sections are always shown together, with the second one locked until
  // the business has verified.
  if (row.status === "order_verified" || row.status === "code_issued") return "codes";
  return "loading";
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
  businessName, existing, onCompleted, onIssued,
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

  /* CHANGED: issuing the code is no longer behind a "YES, I ORDERED" button.
     It runs as soon as the sheet opens without a row, and Retry calls the
     same thing. The RPC is idempotent, so a retry returns the same code. */
  const startIssue = useCallback(async () => {
    setError(null);
    setStep("loading");
    const res = await issueOrderCode(supabase, questId, taskId);
    if (!res.ok) {
      setError(res.error);
      setStep("failed");
      return;
    }
    setRow(res.data);
    onIssued(res.data);
    setStep("codes");
  }, [supabase, questId, taskId, onIssued]);

  /* Fires once per open. The ref is what keeps a parent re-render, which
     changes the identity of onIssued and so the identity of startIssue, from
     firing a second request while the first is still in flight. */
  const issueStarted = useRef(false);
  useEffect(() => {
    if (!open) { issueStarted.current = false; return; }
    if (row || issueStarted.current) return;
    issueStarted.current = true;
    void startIssue();
  }, [open, row, startIssue]);

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
    /* CHANGED: the field accepts typing before the business has verified, so
       this is the case that used to be prevented by disabling it. Answered
       here rather than by the server, which would reply "No verified order is
       waiting for a bill code" — true, but not something to read on a phone
       while standing at a counter. */
    if (row?.status !== "order_verified") {
      setError(
        `${businessName} has not confirmed your order yet. Once it does, the code on your bill will work here.`
      );
      return;
    }
    setBusy(true);
    setError(null);
    const res = await completeTaskWithBillCode(supabase, questId, taskId, code);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setRow(res.data);
    onCompleted(res.data);
    setStep("done");
  }, [billInput, row, businessName, supabase, questId, taskId, onCompleted]);

  const title = useMemo(() => {
    switch (step) {
      case "loading": return "Order verification";
      case "failed":  return "Order verification";
      case "how":     return "How this works";
      case "codes":   return "Order verification";
      case "done":    return "Task completed";
    }
  }, [step]);

  /* A bottom sheet on a phone has to behave like one: Escape dismisses it, and
     the page behind it must not scroll, or a flick on the sheet's padding
     scrolls the quest page underneath while the sheet stays put. Both are
     scoped to while it is open and both are undone on close. */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const { overflow, paddingRight } = document.body.style;
    // Replacing the scrollbar's width keeps the page behind from shifting on
    // desktop; on a phone the gutter is 0, so this is a no-op there.
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 px-3 py-3 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${taskTitle} — order verification`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* dvh, not vh: when the on-screen keyboard opens for the bill code, vh
          keeps reporting the full screen height and the sheet's actions end up
          behind the keyboard. pb-safe keeps the last button clear of the home
          indicator. overscroll-contain stops a flick at the end of the sheet
          from scrolling the quest page behind it. */}
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-y-auto overscroll-contain rounded-3xl border border-outline-variant bg-surface pb-safe elev-5">
        <div aria-hidden="true" className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-outline-variant" />
        </div>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-outline-variant bg-surface/95 px-4 py-3 backdrop-blur-sm sm:px-5">
          {step === "how" && (
            <button
              onClick={() => setStep("codes")}
              aria-label="Back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-secondary"
            >
              <ArrowLeft size={18} className="text-on-surface-variant" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold leading-tight text-on-surface">{title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-secondary"
          >
            <X size={18} className="text-on-surface-variant" />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/12 text-secondary">
              <Receipt size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="break-words text-sm font-bold text-on-surface">{taskTitle}</p>
              {businessName && <p className="mt-0.5 break-words text-xs text-on-surface-variant">{businessName}</p>}
            </div>
          </div>

          {/* ── Step: loading ────────────────────────────────────────── */}
          {/* CHANGED: this replaced the "Did you order from X?" question.
              The code is already on its way when this is on screen, so it
              says what is happening rather than asking anything. */}
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 size={28} className="animate-spin text-secondary" aria-hidden="true" />
              <p className="text-sm font-semibold text-on-surface">
                Getting your order code…
              </p>
            </div>
          )}

          {/* ── Step: failed ─────────────────────────────────────────── */}
          {/* The code can genuinely fail to issue: not joined to the Quest,
              the Quest closed, the task already complete. Saying which, and
              offering a retry, beats an empty sheet. */}
          {step === "failed" && (
            <div className="py-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <AlertCircle size={28} className="text-error" aria-hidden="true" />
                <p className="text-sm font-semibold text-on-surface">
                  Could not start verification
                </p>
                <p className="max-w-[280px] text-xs leading-relaxed text-on-surface-variant">
                  {error ?? "Something went wrong."}
                </p>
              </div>
              <button
                onClick={startIssue}
                className="mt-5 h-12 w-full rounded-xl bg-secondary text-sm font-bold text-on-secondary transition-colors hover:opacity-90"
              >
                Try again
              </button>
              <button
                onClick={() => setStep("how")}
                className="mt-2.5 h-11 w-full rounded-xl border border-outline-variant text-sm font-bold text-on-surface-variant transition-colors hover:bg-surface-container-low"
              >
                How this works
              </button>
            </div>
          )}

          {/* ── Step: how it works ───────────────────────────────────── */}
          {/* The instructions that used to sit behind "NO, NOT YET". Kept,
              and now reachable at any point from the code screen rather than
              only from a question asked once. */}
          {step === "how" && (
            <>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                STRIVUP gives you a code to add to your order description on
                Zomato or Swiggy, so{" "}
                <span className="font-semibold text-on-surface">{businessName}</span>{" "}
                can match the order to your Quest.
              </p>
              <ol className="mt-4 flex flex-col gap-2.5">
                {ORDER_STEPS.map((text, i) => (
                  <li key={text} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-container text-label-sm font-bold text-on-surface-variant">
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-on-surface-variant">{text}</span>
                  </li>
                ))}
              </ol>
              <button
                onClick={() => setStep(row ? "codes" : "loading")}
                className="mt-5 h-11 w-full rounded-xl bg-secondary text-sm font-bold text-on-secondary transition-colors hover:opacity-90"
              >
                Got it
              </button>
            </>
          )}

          {/* ── Step: codes ───────────────────────────────────────────── */}
          {/* Both OTP sections live on one screen, so the whole two code
              journey is legible at a glance instead of appearing one step at
              a time. Section 2 is typable from the start; it is the business
              confirming the order that gates completion, not the field. */}
          {step === "codes" && row && (
            <>
              {(() => {
                const verified = row.status === "order_verified";
                return (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-on-surface">Two-Code Verification</p>
                      <span className="shrink-0 rounded-full bg-secondary/12 px-2.5 py-1 text-xs font-bold text-secondary">
                        Step {verified ? 2 : 1} of 2
                      </span>
                    </div>

                    {/* ── Section 1: the code STRIVUP generated ─────────── */}
                    <section aria-labelledby="otp-1-heading" className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3.5 sm:p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-streak text-xs font-bold text-on-streak" aria-hidden="true">
                          <Check size={14} />
                        </span>
                        <h3 id="otp-1-heading" className="text-sm font-bold text-on-surface">
                          Your STRIVUP order code
                        </h3>
                        <span className="ml-auto rounded-full bg-streak/12 px-2 py-1 text-xs font-bold text-streak-ink">
                          Generated
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant bg-surface px-3 py-1.5">
                        <p className="select-all break-all font-mono text-xl font-extrabold tracking-[0.12em] text-on-surface">
                          {row.order_code}
                        </p>
                        <button
                          onClick={handleCopy}
                          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-secondary hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-secondary"
                        >
                          {copied
                            ? <><Check size={15} /> Copied</>
                            : <><Copy size={15} /> Copy code</>}
                        </button>
                      </div>

                      <p className="text-sm text-on-surface-variant leading-relaxed mt-3">
                        Add this code to the order description on Zomato or Swiggy{" "}
                        <span className="font-semibold text-on-surface">before</span> placing
                        your order.
                      </p>
                    </section>

                    {/* ── Section 2: the code the business writes on the bill ─ */}
                    <section aria-labelledby="otp-2-heading" className="mt-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3.5 sm:p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          verified ? "bg-secondary text-on-secondary" : "bg-surface-container-highest text-on-surface-variant"}`} aria-hidden="true">
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
                      {/* CHANGED: the field used to be disabled with the
                          placeholder "Locked until verified", which told
                          somebody holding a bill with a code on it that the
                          app would not take it. It is typable now and says
                          what to type.

                          Nothing is weakened by that. complete_task_with_bill_code
                          only accepts a row already at status order_verified
                          and raises before touching bill_code_attempts
                          otherwise, so an early attempt cannot burn one of the
                          eight tries. handleBillSubmit does not even send it:
                          it answers locally, which is faster and clearer than
                          a server error. */}
                      <div className="mt-3 flex h-14 items-center gap-2 rounded-xl border-2 border-outline-variant bg-surface px-4 transition-colors focus-within:border-secondary">
                        <Receipt size={18} className="shrink-0 text-on-surface-variant" />
                        <input
                          id="bill-code"
                          value={billInput}
                          onChange={(e) => { setBillInput(e.target.value.toUpperCase()); setError(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") handleBillSubmit(); }}
                          placeholder="Enter the code on your bill"
                          maxLength={10}
                          autoComplete="off"
                          spellCheck={false}
                          className="min-w-0 flex-1 bg-transparent font-mono text-xl font-bold tracking-[0.18em] text-on-surface placeholder:font-sans placeholder:text-sm placeholder:font-semibold placeholder:tracking-normal placeholder:text-on-surface-variant focus:outline-none"
                        />
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
{verified
  ? "Enter the OTP received on your bill to complete this task."
  : `${businessName} will provide the OTP on your bill. Enter it here after your order has been verified.`}
                      </p>

                      <button
                        onClick={handleBillSubmit}
                        disabled={busy || !billInput.trim()}
                        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-2 py-2 text-sm font-bold text-on-secondary transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-40"
                      >
                        {busy
                          ? <><Loader2 size={16} className="animate-spin" /> Verifying...</>
                          : <><ShieldCheck size={16} /> Verify and Complete Task</>}
                      </button>
                    </section>

                    {error && <ErrorNote message={error} />}

                    <div className="mt-3 flex gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 py-3 text-xs leading-relaxed text-on-surface-variant">
                      <ShieldCheck size={16} className="shrink-0 text-streak-ink" aria-hidden="true" />
                      Use the order code shown here for this task.
                    </div>

                    {/* CHANGED: the instructions that used to sit behind
                        "NO, NOT YET" are reachable here instead, at any
                        point, rather than only from a question asked once. */}
                    <button
                      onClick={() => setStep("how")}
                      className="mt-3 h-11 w-full rounded-xl border border-outline-variant text-sm font-bold text-on-surface-variant transition-colors hover:bg-surface-container-low"
                    >
                      How this works
                    </button>

                    {!verified && (
                      <button
                        onClick={onClose}
                        className="mt-2.5 min-h-11 w-full rounded-xl bg-surface-container-high px-3 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-highest"
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
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-streak text-on-streak">
                <ClipboardCheck size={26} aria-hidden="true" />
              </div>
              <p className="text-headline-md font-bold text-on-surface mt-4">
                Task Completed <span aria-hidden="true">✓</span>
              </p>
              <p className="text-sm text-on-surface-variant mt-1.5">
                Your Quest progress has been updated.
              </p>
              <button
                onClick={onClose}
                className="mt-6 h-12 w-full rounded-xl bg-secondary text-sm font-bold text-on-secondary transition-colors hover:opacity-90"
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
