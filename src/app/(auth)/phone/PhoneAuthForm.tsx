"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeRedirect } from "@/lib/safeRedirect";
import { friendlyAuthError } from "@/lib/auth/authErrors";
import { formatE164, toE164 } from "@/lib/auth/phone";
import { AuthCard, AuthField, authSubmitBtnCls } from "../AuthCard";
import { OtpStep } from "../OtpStep";

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

export function PhoneAuthForm() {
  const router = useRouter();
  const destination = safeRedirect(useSearchParams().get("redirectTo"));

  const [step, setStep] = useState<"number" | "code">("number");
  const [phoneInput, setPhoneInput] = useState("");
  const [e164, setE164] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const handleVerifyCode = async (code: string) => {
    if (!e164) return;

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
      <OtpStep
        title="Enter your code"
        sentTo={formatE164(e164 ?? "")}
        busy={busy}
        error={authError}
        onVerify={handleVerifyCode}
        onResend={() => {
          if (e164) void sendCode(e164);
        }}
        onBack={() => {
          setStep("number");
          setAuthError(null);
          setFieldError(null);
        }}
        backLabel="Change number"
      />
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
            className="font-semibold text-secondary transition-colors hover:underline"
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
        <p className="text-center text-label-sm text-on-surface-variant">
          Signing in with a new number creates your StrivUp account.
        </p>
      </form>
    </AuthCard>
  );
}
