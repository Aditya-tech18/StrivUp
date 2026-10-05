"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeRedirect } from "@/lib/safeRedirect";
import { friendlyAuthError } from "@/lib/auth/authErrors";
import { AuthCard, AuthField, authSocialBtnCls, authSubmitBtnCls } from "../AuthCard";
import { GoogleIcon } from "../GoogleIcon";
import { OtpStep } from "../OtpStep";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * Failures that happen on a *different* route — the OAuth and email-link
 * callbacks — can only report themselves by bouncing here with ?error=<code>.
 * Without this map they arrived as a silent redirect and the person saw a
 * login page that gave no reason for being there.
 */
const REDIRECT_ERRORS: Record<string, string> = {
  invalid_link: "That link isn't valid. Request a new one.",
  link_expired:
    "That link has expired or was already used. Links work once and last an hour — request a fresh one.",
  oauth_callback_failed: "Google sign-in didn't complete. Please try again.",
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Where to land after auth. Comes from ?redirectTo (set by proxy.ts when it
  // bounces a signed-out visitor) and is validated to a same-origin path.
  const destination = safeRedirect(searchParams.get("redirectTo"));
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Set when an unconfirmed account tries to log in and we send it a code.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Read straight from the URL rather than copied into state, so it needs no
  // effect and clears itself the moment anything else goes wrong.
  const redirectError = REDIRECT_ERRORS[searchParams.get("error") ?? ""] ?? null;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginValues) => {
    setAuthError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      // An account that was created but never confirmed cannot sign in and
      // cannot fix itself from this screen. Send a fresh code and drop the
      // person straight into the verify step instead of leaving them stuck.
      if (error.code === "email_not_confirmed") {
        const { error: resendError } = await supabase.auth.resend({
          type: "signup",
          email: data.email,
        });
        if (resendError) {
          setAuthError(friendlyAuthError(resendError));
          return;
        }
        setPendingEmail(data.email);
        return;
      }

      setAuthError(friendlyAuthError(error));
      return;
    }

    router.push(destination);
    router.refresh(); // flush Supabase session into server components
  };

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

    // Confirmed accounts that already have a name go where they were headed;
    // anyone who never finished setup gets sent to finish it.
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", data.user.id)
      .maybeSingle();

    router.push(profile?.full_name ? destination : "/profile/setup");
    router.refresh();
  };

  const handleResend = async () => {
    if (!pendingEmail) return;
    setAuthError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email: pendingEmail });
    if (error) setAuthError(friendlyAuthError(error));
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setAuthError(null);
    // Clear any stale business intent cookie so root page routes correctly.
    document.cookie = "strivup_business_intent=; path=/; max-age=0";
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Forward the destination through OAuth so /auth/callback can deliver
        // the person to the page they originally asked for.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });

    if (error) {
      setAuthError(friendlyAuthError(error));
      setGoogleLoading(false);
    }
    // On success the browser navigates away — no need to reset loading state.
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
        backLabel="Back to login"
      />
    );
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Consistency starts with showing up."
      error={authError ?? redirectError}
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            href={`/signup${destination !== "/feed" ? `?redirectTo=${encodeURIComponent(destination)}` : ""}`}
            className="font-semibold text-secondary transition-colors hover:underline"
          >
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <AuthField
          id="login-email"
          label="Email address"
          icon={<Mail size={14} aria-hidden="true" />}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          disabled={busy}
          {...register("email")}
        />

        <AuthField
          id="login-password"
          label="Password"
          icon={<Lock size={14} aria-hidden="true" />}
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
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
          {...register("password")}
        />

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-body-md text-on-surface-variant transition-colors hover:text-on-surface"
          >
            Forgot password?
          </Link>
        </div>

        <button id="login-submit-btn" type="submit" disabled={busy} data-magnetic className={authSubmitBtnCls}>
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Logging in…
            </>
          ) : (
            <>
              Sign in
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

        {/* Google is the only alternative method offered. The phone flow is
            built (/phone) but unlinked: Supabase's phone provider is disabled,
            so every attempt failed. Restore this button once SMS is live. */}
        <button
          id="login-google-btn"
          type="button"
          onClick={handleGoogleLogin}
          disabled={busy}
          data-magnetic
          className={authSocialBtnCls}
        >
          {googleLoading ? (
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
          ) : (
            <GoogleIcon />
          )}
          Sign in with Google
        </button>
      </form>
    </AuthCard>
  );
}
