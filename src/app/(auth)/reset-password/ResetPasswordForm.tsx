"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth/authErrors";
import { AuthCard } from "../AuthCard";

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

function fieldCls(hasError: boolean) {
  return [
    "w-full h-10 px-3 pr-10 rounded-xl border bg-surface-container-lowest",
    "text-on-surface placeholder:text-on-surface-variant",
    "text-[length:var(--text-body-lg)] leading-6",
    "transition-colors duration-150 focus:outline-none focus:ring-2",
    hasError
      ? "border-error focus:ring-error/30 focus:border-error"
      : "border-outline-variant focus:border-secondary focus:ring-secondary/20",
    "disabled:opacity-50",
  ].join(" ");
}

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
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="new-password" className="text-body-md font-medium text-on-surface">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Min. 8 chars, 1 letter + 1 number"
              disabled={isSubmitting || done}
              className={fieldCls(!!errors.password)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "new-password-error" : undefined}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors hover:text-on-surface"
            >
              {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
          {errors.password ? (
            <p id="new-password-error" role="alert" className="text-body-md text-error">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirm-password" className="text-body-md font-medium text-on-surface">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Type it again"
            disabled={isSubmitting || done}
            className={fieldCls(!!errors.confirm)}
            aria-invalid={!!errors.confirm}
            aria-describedby={errors.confirm ? "confirm-password-error" : undefined}
            {...register("confirm")}
          />
          {errors.confirm ? (
            <p id="confirm-password-error" role="alert" className="text-body-md text-error">
              {errors.confirm.message}
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" fullWidth disabled={isSubmitting || done}>
          {isSubmitting || done ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Saving…
            </span>
          ) : (
            "Save password"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
