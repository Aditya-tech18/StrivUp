"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeRedirect } from "@/lib/safeRedirect";
import { friendlyAuthError, isExistingUserSignup } from "@/lib/auth/authErrors";
import { AuthCard, AuthField, authSocialBtnCls, authSubmitBtnCls } from "../AuthCard";
import { GoogleIcon } from "../GoogleIcon";
import { OtpStep } from "../OtpStep";
import { PasswordStrength } from "@/components/ui/PasswordStrength";

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().min(1, "Email is required.").email("Please enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter.")
    .regex(/[0-9]/, "Password must contain at least one number."),
});

type SignupValues = z.infer<typeof signupSchema>;

export function SignupForm() {
  const router = useRouter();
  // Where to land after auth. Comes from ?redirectTo (set by proxy.ts when it
  // bounces a signed-out visitor) and is validated to a same-origin path.
  const destination = safeRedirect(useSearchParams().get("redirectTo"));
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Set once signUp succeeds and a code is in flight. Holds the address so the
  // verify and resend calls have it without re-reading the form.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  // Tracked with a local value fed from the field's own onChange rather than
  // react-hook-form's watch(): watch() returns a non-memoizable subscription,
  // which makes React Compiler skip optimising the whole form. This keeps the
  // form's own registration intact and just tees the value off alongside it.
  const [passwordValue, setPasswordValue] = useState("");
  const passwordField = register("password");

  const onSubmit = async (data: SignupValues) => {
    setAuthError(null);
    const supabase = createClient();
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.name },
        // Kept for the link in the same email, which still works as a fallback
        // for anyone who taps it instead of copying the code.
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(destination)}`,
      },
    });

    if (error) {
      setAuthError(friendlyAuthError(error));
      return;
    }

    // An empty `identities` array is Supabase declining to confirm that an
    // address is already registered. It is NOT the signal that confirmation is
    // pending — the previous version read it that way, which inverted the
    // whole screen: real new signups fell through to router.push() with no
    // session and were bounced straight back to /login by proxy.ts, while the
    // "check your inbox" screen only ever appeared for people who already had
    // an account.
    if (isExistingUserSignup(signUpData.user)) {
      setAuthError(
        "An account with this email already exists. Log in instead — or reset your password if you've forgotten it."
      );
      return;
    }

    // No session means confirmation is switched on and the code is in flight.
    if (!signUpData.session) {
      setPendingEmail(data.email);
      return;
    }

    // Confirmation off: signUp returned a live session, so go.
    router.push(destination);
    router.refresh();
  };

  /**
   * Exchange the emailed code for a session.
   *
   * type: "signup" is the confirmation code Supabase sends for a new account —
   * "email" would be a magic-link code for an existing one and is rejected
   * here.
   */
  const handleVerify = async (code: string) => {
    if (!pendingEmail) return;
    setVerifying(true);
    setAuthError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: code,
      type: "signup",
    });

    if (error || !data.user) {
      setVerifying(false);
      setAuthError(error ? friendlyAuthError(error) : "That code didn't work. Try again.");
      return;
    }

    // Straight into account setup rather than the feed: the account exists but
    // has nothing in it yet, and this is the one moment someone is willing to
    // fill a form.
    router.push("/profile/setup");
    router.refresh();
  };

  const handleResend = async () => {
    if (!pendingEmail) return;
    setAuthError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email: pendingEmail });
    if (error) setAuthError(friendlyAuthError(error));
  };

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    setAuthError(null);
    document.cookie = "strivup_business_intent=; path=/; max-age=0";
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });

    if (error) {
      setAuthError(friendlyAuthError(error));
      setGoogleLoading(false);
    }
  };

  const busy = isSubmitting || googleLoading;

  if (pendingEmail) {
    return (
      <OtpStep
        title="Confirm your email"
        sentTo={pendingEmail}
        busy={verifying}
        error={authError}
        onVerify={handleVerify}
        onResend={handleResend}
        onBack={() => {
          setPendingEmail(null);
          setAuthError(null);
        }}
        backLabel="Change email"
      />
    );
  }

  return (
    <AuthCard
      title="Create account"
      subtitle="Build better. Every day."
      error={authError}
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={`/login${destination !== "/feed" ? `?redirectTo=${encodeURIComponent(destination)}` : ""}`}
            className="font-semibold text-secondary transition-colors hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <AuthField
          id="signup-name"
          label="Full name"
          icon={<User size={14} aria-hidden="true" />}
          type="text"
          autoComplete="name"
          error={errors.name?.message}
          disabled={busy}
          {...register("name")}
        />

        <AuthField
          id="signup-email"
          label="Email address"
          icon={<Mail size={14} aria-hidden="true" />}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          disabled={busy}
          {...register("email")}
        />

        <AuthField
          id="signup-password"
          label="Password"
          icon={<Lock size={14} aria-hidden="true" />}
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          error={errors.password?.message}
          disabled={busy}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="p-1 text-on-surface-variant transition-colors hover:text-on-surface"
            >
              {showPassword ? (
                <EyeOff size={16} aria-hidden="true" />
              ) : (
                <Eye size={16} aria-hidden="true" />
              )}
            </button>
          }
          {...passwordField}
          onChange={(event) => {
            passwordField.onChange(event);
            setPasswordValue(event.target.value);
          }}
        />

        {/* Advisory only — the zod schema is still the one gate on submit. */}
        <PasswordStrength value={passwordValue} />

        <button id="signup-submit-btn" type="submit" disabled={busy} className={authSubmitBtnCls}>
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Creating account…
            </>
          ) : (
            <>
              Create account
              <ArrowRight
                size={18}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1"
              />
            </>
          )}
        </button>

        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-outline-variant" />
          <span className="text-overline tracking-widest text-on-surface-variant">
            or continue with
          </span>
          <span className="h-px flex-1 bg-outline-variant" />
        </div>

        {/* Google only. The phone flow is built (/phone) but unlinked while
            Supabase's phone provider is disabled — see SUPABASE_REDIRECT_SETUP.md. */}
        <button
          id="signup-google-btn"
          type="button"
          onClick={handleGoogleSignup}
          disabled={busy}
                   className={authSocialBtnCls}
        >
          {googleLoading ? (
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
          ) : (
            <GoogleIcon />
          )}
          Sign up with Google
        </button>
      </form>
    </AuthCard>
  );
}
