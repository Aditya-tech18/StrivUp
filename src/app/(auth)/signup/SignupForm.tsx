"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, Mail, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeRedirect } from "@/lib/safeRedirect";
import { friendlyAuthError, isExistingUserSignup } from "@/lib/auth/authErrors";
import { AuthCard, AuthField, authSocialBtnCls, authSubmitBtnCls } from "../AuthCard";
import { GoogleIcon } from "../GoogleIcon";
import { OtpStep } from "../OtpStep";

/**
 * CHANGED: signup no longer asks for a password.
 *
 * The password is chosen on /set-password, after the emailed link or code has
 * proved the address belongs to the person signing up. Asking for it here
 * meant an address could be registered with a password by someone who did not
 * own it, and it was also the source of a confusing failure: an account
 * created with Google and then "signed up" again by email ends up with a
 * password nobody remembers setting, and the login screen can only say the
 * details do not match.
 */
const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().min(1, "Email is required.").email("Please enter a valid email address."),
});

/**
 * A placeholder password for the account record.
 *
 * supabase.auth.signUp requires one, but nobody is ever told this value and
 * it is replaced on /set-password before the account can be used. It is
 * generated with the platform CSPRNG rather than Math.random so that an
 * abandoned signup cannot be guessed into.
 */
function throwawayPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `Aa1!${Array.from(bytes, (b) => b.toString(36)).join("")}`;
}

type SignupValues = z.infer<typeof signupSchema>;

export function SignupForm() {
  const router = useRouter();
  // Where to land after auth. Comes from ?redirectTo (set by proxy.ts when it
  // bounces a signed-out visitor) and is validated to a same-origin path.
  const destination = safeRedirect(useSearchParams().get("redirectTo"));
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

  const onSubmit = async (data: SignupValues) => {
    setAuthError(null);
    const supabase = createClient();
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: throwawayPassword(),
      options: {
        data: { full_name: data.name },
        // CHANGED: the link now lands on /set-password rather than going
        // straight into the app, because the account has no real password
        // until that screen runs. The emailed 6-digit code reaches the same
        // screen, so both halves of the email end in the same place.
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/set-password")}`,
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

    // Confirmation off: signUp returned a live session. Still send them to
    // /set-password, because the only password on the account right now is
    // the throwaway one above.
    router.push("/set-password");
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

    // CHANGED: the code proves the address, the password is still unset, so
    // the next screen is /set-password. Profile setup follows from there.
    router.push("/set-password");
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
      subtitle="We'll email you a link to set your password."
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

        {/* CHANGED: the password field and its strength meter moved to
            /set-password. Nothing is lost: the same component, the same rules
            and the same confirm field now run there, after the email is
            proved. */}

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
