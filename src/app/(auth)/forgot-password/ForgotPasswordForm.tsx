"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { ArrowRight, Loader2, Mail, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth/authErrors";
import { AuthCard, AuthField, authSubmitBtnCls } from "../AuthCard";

const schema = z.object({
  email: z.string().min(1, "Email is required.").email("Please enter a valid email address."),
});

type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: Values) => {
    setAuthError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      // The recovery email carries a token hash, so it has to land on
      // /auth/confirm, which exchanges it for a session and then forwards to
      // /reset-password.
      redirectTo: `${window.location.origin}/auth/confirm?type=recovery`,
    });

    if (error) {
      setAuthError(friendlyAuthError(error));
      return;
    }

    // Shown whether or not the address is registered. Confirming which emails
    // have accounts would hand anyone a membership checker.
    setSent(true);
  };

  if (sent) {
    return (
      <AuthCard
        title="Check your inbox"
        subtitle="If that address has an account, a password reset link is on its way. The link works once and expires in an hour."
      >
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
            <MailCheck size={26} className="text-secondary-fixed-dim" aria-hidden="true" />
          </div>
        </div>
        <p className="text-center text-body-md text-on-primary-container">
          Didn&apos;t get it? Check spam, or{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-semibold text-secondary-fixed-dim transition-colors hover:text-white"
          >
            try a different address
          </button>
          .
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      error={authError}
      footer={
        <>
          Remembered it?{" "}
          <Link
            href="/login"
            className="font-semibold text-secondary-fixed-dim transition-colors hover:text-white"
          >
            Back to login
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <AuthField
          id="forgot-email"
          label="Email address"
          icon={<Mail size={14} aria-hidden="true" />}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          disabled={isSubmitting}
          {...register("email")}
        />
        <button type="submit" disabled={isSubmitting} className={authSubmitBtnCls}>
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : (
            <>
              Send reset link
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
