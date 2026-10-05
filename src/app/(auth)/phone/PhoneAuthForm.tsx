"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeRedirect } from "@/lib/safeRedirect";
import { friendlyAuthError } from "@/lib/auth/authErrors";
import { OTP_LENGTH, formatE164, toE164 } from "@/lib/auth/phone";
import { AuthCard, AuthField, authSubmitBtnCls } from "../AuthCard";

/**
 * Phone sign-in, in two steps: number → six-digit code.
 *
 * One flow for both signing up and signing in, which is how phone auth works
 * everywhere — the person does not know or care whether the number is already
 * registered, and Supabase creates the account on first verify. That also
 * means we never confirm whether a number has an account, so this cannot be
 * used to probe for members.
 *
 * The verified number is written to profile_private, never to profiles: phone
 * is PII and the public table has no business holding it.
 */

/** Supabase's default SMS OTP lifetime. Matches the dashboard default. */
const RESEND_COOLDOWN_SECONDS = 60;

export function PhoneAuthForm() {
  const router = useRouter();
  const destination = safeRedirect(useSearchParams().get("redirectTo"));

  const [step, setStep] = useState<"number" | "code">("number");
  const [phoneInput, setPhoneInput] = useState("");
  const [e164, setE164] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const codeInputRef = useRef<HTMLInputElement>(null);

  // Tick the resend cooldown down to zero. Derived from a timer rather than
  // recomputed in render, and cleared on unmount.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Move focus to the code field when it appears, so the keyboard is already
  // open when the SMS lands.
  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  async function sendCode(target: string) {
    setBusy(true);
    setAuthError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ phone: target });

    setBusy(false);

    if (error) {
      setAuthError(friendlyAuthError(error));
      return false;
    }

    setCooldown(RESEND_COOLDOWN_SECONDS);
    return true;
  }

  const handleSubmitNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    const normalised = toE164(phoneInput);
    if (!normalised) {
      setFieldError("Enter a valid mobile number, e.g. 98765 43210.");
      return;
    }

    setE164(normalised);
    if (await sendCode(normalised)) setStep("code");
  };

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    if (!e164) return;
    if (code.length !== OTP_LENGTH) {
      setFieldError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      return;
    }

    setBusy(true);
    setAuthError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      phone: e164,
      token: code,
      type: "sms",
    });

    if (error || !data.user) {
      setBusy(false);
      setAuthError(error ? friendlyAuthError(error) : "That code didn't work. Try again.");
      setCode("");
      return;
    }

    // Record the verified number where PII belongs. Best-effort: a person who
    // just proved they own the number should not be blocked from the app
    // because a secondary write failed, so the error is reported but not
    // fatal.
    const { error: privateError } = await supabase
      .from("profile_private")
      .upsert(
        { id: data.user.id, phone: e164, phone_verified: true, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
    if (privateError) console.error("profile_private phone write failed", privateError);

    // A number-only signup has no name yet, so send first-timers to setup
    // rather than dropping them into a feed as "Anonymous".
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", data.user.id)
      .maybeSingle();

    const needsName = !profile?.full_name;
    router.push(needsName ? "/profile/setup" : destination);
    router.refresh();
  };

  /* ── Step 2: code ──────────────────────────────────────────────────────── */
  if (step === "code") {
    return (
      <AuthCard
        title="Enter your code"
        subtitle={`We sent a ${OTP_LENGTH}-digit code to ${formatE164(e164 ?? "")}.`}
        error={authError}
      >
        <form onSubmit={handleSubmitCode} noValidate className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="otp-code" className="text-body-md font-medium text-on-primary">
              Verification code
            </label>
            <input
              ref={codeInputRef}
              id="otp-code"
              // Numeric keypad on mobile, and the browser/OS can autofill the
              // code straight from the SMS.
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
                "h-12 w-full rounded-xl border bg-white/5 px-3",
                "text-center text-headline-md tracking-[0.5em] text-on-primary",
                "placeholder:tracking-[0.5em] placeholder:text-white/30",
                "transition-colors duration-150 focus:outline-none focus:ring-2",
                fieldError
                  ? "border-error-outline focus:border-error-outline focus:ring-error/30"
                  : "border-white/25 focus:border-secondary-fixed-dim focus:ring-secondary/30",
                "disabled:opacity-50",
              ].join(" ")}
            />
            {fieldError ? (
              <p id="otp-code-error" role="alert" className="text-body-md text-error-outline">
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
              onClick={() => {
                setStep("number");
                setCode("");
                setAuthError(null);
                setFieldError(null);
              }}
              className="flex items-center gap-1 text-body-md text-secondary-fixed-dim transition-colors hover:text-white"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Change number
            </button>

            <button
              type="button"
              disabled={cooldown > 0 || busy}
              onClick={() => e164 && sendCode(e164)}
              className="text-body-md text-secondary-fixed-dim transition-colors hover:text-white disabled:text-on-primary-container disabled:hover:text-on-primary-container"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      </AuthCard>
    );
  }

  /* ── Step 1: number ───────────────────────────────────────────────────── */
  return (
    <AuthCard
      title="Continue with mobile"
      subtitle="We'll text you a code. No password to remember."
      error={authError}
      footer={
        <>
          Prefer email?{" "}
          <Link
            href="/login"
            className="font-semibold text-secondary-fixed-dim transition-colors hover:text-white"
          >
            Log in another way
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmitNumber} noValidate className="space-y-6">
        <AuthField
          id="phone-number"
          label="Mobile number"
          icon={<Smartphone size={14} aria-hidden="true" />}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phoneInput}
          onChange={(ev) => setPhoneInput(ev.target.value)}
          error={fieldError ?? undefined}
          hint="Indian numbers don't need +91. For anywhere else, include your country code."
          disabled={busy}
        />
        <button type="submit" disabled={busy} className={authSubmitBtnCls}>
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Sending code…
            </>
          ) : (
            <>
              Send me a code
              <ArrowRight
                size={18}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1"
              />
            </>
          )}
        </button>
        <p className="text-center text-label-sm text-on-primary-container">
          Signing in with a new number creates your StrivUp account.
        </p>
      </form>
    </AuthCard>
  );
}
