"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, MailCheck, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeRedirect } from "@/lib/safeRedirect";
import { friendlyAuthError, isExistingUserSignup } from "@/lib/auth/authErrors";
import { AuthCard, AuthField, authSocialBtnCls, authSubmitBtnCls } from "../AuthCard";
import { GoogleIcon } from "../GoogleIcon";

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
  const [checkEmail, setCheckEmail] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (data: SignupValues) => {
    setAuthError(null);
    const supabase = createClient();
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.name },
        // Where the confirmation link comes back to. /auth/confirm exchanges
        // the token for a session; without a server route to land on, the
        // session only ever exists in a URL fragment the server cannot read.
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

    // No session means email confirmation is switched on and the link is in
    // flight. There is nothing to redirect to yet.
    if (!signUpData.session) {
      setCheckEmail(true);
      return;
    }

    // Confirmation off: signUp returned a live session, so go.
    router.push(destination);
    router.refresh();
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

  if (checkEmail) {
    return (
      <AuthCard
        title="Check your inbox"
        subtitle="We've sent a confirmation link to your email address. Click it to activate your account and get started."
        footer={
          <>
            Already confirmed?{" "}
            <Link
              href="/login"
              className="font-semibold text-secondary-fixed-dim transition-colors hover:text-white"
            >
              Log in
            </Link>
          </>
        }
      >
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
            <MailCheck size={26} className="text-secondary-fixed-dim" aria-hidden="true" />
          </div>
        </div>
      </AuthCard>
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
            className="font-semibold text-secondary-fixed-dim transition-colors hover:text-white"
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
          hint="At least 8 characters, with a letter and a number."
          disabled={busy}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="p-1 text-on-primary-container transition-colors hover:text-white"
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
          <span className="h-px flex-1 bg-white/20" />
          <span className="text-overline tracking-widest text-on-primary-container">
            or continue with
          </span>
          <span className="h-px flex-1 bg-white/20" />
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
