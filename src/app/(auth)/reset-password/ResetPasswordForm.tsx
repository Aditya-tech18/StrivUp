"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth/authErrors";
import { AuthCard, AuthField, authSubmitBtnCls } from "../AuthCard";
import { PasswordStrength } from "@/components/ui/PasswordStrength";
import {
  establishSessionFromEmailLink,
  readUrlCredentials,
} from "@/lib/auth/emailLinkSession";

/**
 * Setting a password after following an emailed link.
 *
 * Two modes, one screen, because the form is identical either way:
 *
 *   "reset"  someone forgot their password and followed a recovery link.
 *   "create" a new account confirming its email and choosing its first
 *            password. Signup no longer asks for one up front.
 *
 * CHANGED: this used to assume /auth/confirm had already exchanged the link
 * for a session and so only called getUser(). That assumption only holds when
 * the Supabase email template points at /auth/confirm with a token_hash. With
 * the default {{ .ConfirmationURL }} template the session arrives in the URL
 * *fragment* instead, which the server never sees, so /auth/confirm called the
 * link invalid and bounced people to /login?error=invalid_link — a valid link,
 * refused. establishSessionFromEmailLink handles every shape a link can
 * arrive in, so this screen works whatever the template is set to.
 */

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[a-zA-Z]/, "Password must contain at least one letter.")
      .regex(/[0-9]/, "Password must contain at least one number."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match.",
    path: ["confirm"],
  });

type Values = z.infer<typeof schema>;

type SessionState = "checking" | "ready" | "missing";

export type PasswordFormMode = "reset" | "create";

const COPY = {
  reset: {
    title: "Set a new password",
    subtitle: "Pick something you'll remember — you'll use it every time you log in.",
    expiredTitle: "This link has expired",
    expiredBody:
      "Reset links work once and last an hour. Request a fresh one and you'll be straight back in.",
    expiredHref: "/forgot-password",
    expiredCta: "Send a new link",
    submit: "Save password",
    /* Straight into the app: this account already exists and has somewhere to
       go back to. */
    destination: "/feed",
  },
  create: {
    title: "Set your password",
    subtitle: "Choose a password for your new account. You'll use it to log in from now on.",
    expiredTitle: "This link has expired",
    expiredBody:
      "Confirmation links work once and last an hour. Sign up again and we'll send a fresh one.",
    expiredHref: "/signup",
    expiredCta: "Back to sign up",
    submit: "Create password",
    /* A brand new account has nothing in it yet, and this is the one moment
       someone is willing to fill in a profile. */
    destination: "/profile/setup",
  },
} as const;

export function ResetPasswordForm({ mode = "reset" }: { mode?: PasswordFormMode }) {
  const copy = COPY[mode];
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [show, setShow] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  // Tracked with a local value fed from the field's own onChange rather than
  // react-hook-form's watch(): watch() returns a non-memoizable subscription,
  // which makes React Compiler skip optimising the whole form. This keeps the
  // form's own registration intact and just tees the value off alongside it.
  const [passwordValue, setPasswordValue] = useState("");
  const passwordField = register("password");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      /* Read the URL before the client exists. supabase-js starts eating the
         fragment the moment it is constructed, and both of us reaching for
         the same single-use token is what made this screen fail at random. */
      const creds = readUrlCredentials();
      const supabase = createClient();
      const result = await establishSessionFromEmailLink(supabase, creds);
      if (cancelled) return;
      setSessionState(result.ok ? "ready" : "missing");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (data: Values) => {
    setAuthError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: data.password });

    if (error) {
      setAuthError(friendlyAuthError(error));
      return;
    }

    setDone(true);
    // The link's session is a real session, so there is nothing left to do
    // but send them on.
    router.push(copy.destination);
    router.refresh();
  };

  if (sessionState === "checking") {
    return (
      <AuthCard title="One moment">
        <div className="flex justify-center py-4">
          <Loader2 size={22} className="animate-spin text-secondary" aria-hidden="true" />
        </div>
      </AuthCard>
    );
  }

  if (sessionState === "missing") {
    return (
      <AuthCard
        title={copy.expiredTitle}
        subtitle={copy.expiredBody}
        footer={
          <Link
            href={copy.expiredHref}
            className="font-semibold text-secondary transition-colors hover:underline"
          >
            {copy.expiredCta}
          </Link>
        }
      >
        <></>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={copy.title}
      subtitle={copy.subtitle}
      error={authError}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <AuthField
          id="new-password"
          label="New password"
          icon={<Lock size={14} aria-hidden="true" />}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          error={errors.password?.message}
          disabled={isSubmitting || done}
          trailing={
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:text-on-surface"
            >
              {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
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

        <AuthField
          id="confirm-password"
          label="Confirm password"
          icon={<Lock size={14} aria-hidden="true" />}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          error={errors.confirm?.message}
          disabled={isSubmitting || done}
          {...register("confirm")}
        />

        <button type="submit" disabled={isSubmitting || done} className={authSubmitBtnCls}>
          {isSubmitting || done ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            <>
              {copy.submit}
              <ArrowRight
                size={18}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1"
              />
            </>
          )}
        </button>
      </form>
    </AuthCard>
  );
}
