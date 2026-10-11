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

/**
 * Setting a new password after following a recovery link.
 *
 * /auth/confirm has already turned the link's token into a real session by the
 * time anyone gets here, so this screen's only job is updateUser(). If there
 * is no session the link was expired or reused, and saying so is more useful
 * than a failing form.
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

export function ResetPasswordForm() {
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
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setSessionState(user ? "ready" : "missing");
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
    // The recovery session is a real session, so there is nothing more to do
    // than send them into the app.
    router.push("/feed");
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
        title="This link has expired"
        subtitle="Reset links work once and last an hour. Request a fresh one and you'll be straight back in."
        footer={
          <Link
            href="/forgot-password"
            className="font-semibold text-secondary transition-colors hover:underline"
          >
            Send a new link
          </Link>
        }
      >
        <></>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle="Pick something you'll remember — you'll use it every time you log in."
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
              Save password
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
