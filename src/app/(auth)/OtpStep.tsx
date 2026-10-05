"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { AuthCard, authSubmitBtnCls } from "./AuthCard";

/**
 * OtpStep — "we sent you a code, type it here".
 *
 * Shared by the email and phone flows, which are the same interaction with a
 * different identifier. Keeping one copy means the resend cooldown, the
 * numeric keypad hint and the autofill behaviour cannot drift apart between
 * them.
 *
 * `autoComplete="one-time-code"` is what lets iOS and Android offer the code
 * straight from the notification, so people never switch apps. It only works
 * on a single input — splitting the code into six boxes, which looks nicer in
 * a mockup, breaks it.
 */

export const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

export function OtpStep({
  title,
  /** Where the code went, already formatted for display. */
  sentTo,
  busy,
  error,
  onVerify,
  onResend,
  onBack,
  backLabel,
  /** Seconds remaining before a resend is allowed, owned by the caller. */
  initialCooldown = RESEND_COOLDOWN_SECONDS,
}: {
  title: string;
  sentTo: string;
  busy: boolean;
  error: string | null;
  onVerify: (code: string) => void | Promise<void>;
  onResend: () => void | Promise<void>;
  onBack: () => void;
  backLabel: string;
  initialCooldown?: number;
}) {
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(initialCooldown);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Focus on mount so the keyboard is already up when the message arrives.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== OTP_LENGTH) {
      setFieldError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      return;
    }
    setFieldError(null);
    void onVerify(code);
  };

  const handleResend = () => {
    setCode("");
    setFieldError(null);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    void onResend();
  };

  return (
    <AuthCard title={title} subtitle={`We sent a ${OTP_LENGTH}-digit code to ${sentTo}.`} error={error}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="otp-code" className="text-body-md font-medium text-on-surface">
            Verification code
          </label>
          <input
            ref={inputRef}
            id="otp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            value={code}
            onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            disabled={busy}
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? "otp-code-error" : undefined}
            className={[
              "h-12 w-full rounded-xl border bg-surface-container-lowest px-3",
              "text-center text-headline-md tracking-[0.5em] text-on-surface",
              "placeholder:tracking-[0.5em] placeholder:text-outline",
              "transition-colors duration-150 focus:outline-none focus:ring-2",
              fieldError
                ? "border-error focus:border-error focus:ring-error/20"
                : "border-outline-variant focus:border-secondary focus:ring-secondary/20",
              "disabled:opacity-50",
            ].join(" ")}
          />
          {fieldError ? (
            <p id="otp-code-error" role="alert" className="text-body-md text-error">
              {fieldError}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={busy} className={authSubmitBtnCls}>
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Verifying…
            </>
          ) : (
            <>
              Verify and continue
              <ArrowRight
                size={18}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1"
              />
            </>
          )}
        </button>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-body-md text-secondary transition-colors hover:underline"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {backLabel}
          </button>

          <button
            type="button"
            disabled={cooldown > 0 || busy}
            onClick={handleResend}
            className="text-body-md text-secondary transition-colors hover:underline disabled:text-on-surface-variant disabled:no-underline"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      </form>
    </AuthCard>
  );
}
