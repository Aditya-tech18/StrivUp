"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Flame, Loader2, Smartphone } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/* ── Zod v4 schema ────────────────────────────────────────────────────── */
const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type LoginValues = z.infer<typeof loginSchema>;

/* ── Google G SVG ───────────────────────────────────────────────────────── */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

/* ── Shared class helpers ────────────────────────────────────────────────── */
const socialBtnCls = [
  "w-full flex items-center justify-center gap-3",
  "h-11 px-4 rounded border border-outline-variant",
  "bg-surface-container-lowest hover:bg-surface-container",
  "transition-colors duration-150",
  "text-[length:var(--font-size-body-lg)] font-medium text-on-surface",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

function passwordFieldCls(hasError: boolean) {
  return [
    "w-full h-10 px-3 pr-10 rounded border bg-surface-container-lowest",
    "text-on-surface placeholder:text-on-surface-variant",
    "text-[length:var(--font-size-body-lg)] leading-6",
    "transition-colors duration-150 focus:outline-none focus:ring-2",
    hasError
      ? "border-error focus:ring-error/30 focus:border-error"
      : "border-outline-variant focus:border-secondary focus:ring-secondary/20",
  ].join(" ");
}

/* ── Component ──────────────────────────────────────────────────────────── */
export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  /* ── Email / password login ──────────────────────────────────────────── */
  const onSubmit = async (data: LoginValues) => {
    setAuthError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    router.push("/feed");
    router.refresh(); // flush Supabase session into server components
  };

  /* ── Google OAuth ────────────────────────────────────────────────────── */
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setAuthError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setAuthError(error.message);
      setGoogleLoading(false);
    }
    // On success the browser navigates away — no need to reset loading state.
  };

  const busy = isSubmitting || googleLoading;

  return (
    <div className="w-full max-w-md space-y-6 py-12">
      {/* ── Logo + brand ─────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-14 h-14 rounded-xl bg-primary-container flex items-center justify-center">
          <Flame size={28} className="text-on-primary" aria-hidden="true" />
        </div>
        <p className="type-label-caps text-secondary tracking-widest">STRIV</p>
      </div>

      {/* ── Headline ─────────────────────────────────────────────────── */}
      <div className="text-center space-y-1">
        <h1 className="type-headline-md text-on-surface">Welcome Back</h1>
        <p className="type-body-md text-on-surface-variant">
          Consistency starts with showing up.
        </p>
      </div>

      {/* ── Supabase error banner ─────────────────────────────────────── */}
      {authError && (
        <div
          role="alert"
          className="rounded border border-error/30 bg-error-container px-4 py-3 type-body-md text-error"
        >
          {authError}
        </div>
      )}

      {/* ── Social buttons ───────────────────────────────────────────── */}
      <div className="space-y-3">
        <button
          id="login-google-btn"
          type="button"
          onClick={handleGoogleLogin}
          disabled={busy}
          className={socialBtnCls}
        >
          {googleLoading ? (
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </button>
        {/* Mobile number — not in scope yet */}
        <button
          id="login-mobile-btn"
          type="button"
          disabled
          className={`${socialBtnCls} opacity-40 cursor-not-allowed`}
          title="Coming soon"
        >
          <Smartphone size={20} className="text-on-surface-variant" aria-hidden="true" />
          Continue with Mobile Number
        </button>
      </div>

      {/* ── OR divider ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <hr className="flex-1 border-outline-variant" />
        <span className="type-label-caps text-on-surface-variant">or</span>
        <hr className="flex-1 border-outline-variant" />
      </div>

      {/* ── Email + Password form ────────────────────────────────────── */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          id="login-email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          disabled={busy}
          {...register("email")}
        />

        {/* Password — custom field for show/hide + Forgot link */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between mb-0.5">
            <label
              htmlFor="login-password"
              className="type-body-md font-medium text-on-surface"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="type-body-md text-secondary hover:underline transition-colors"
            >
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Min. 8 characters"
              disabled={busy}
              className={`${passwordFieldCls(!!errors.password)} disabled:opacity-50`}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "login-password-error" : undefined}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff size={16} aria-hidden="true" />
              ) : (
                <Eye size={16} aria-hidden="true" />
              )}
            </button>
          </div>
          {errors.password && (
            <p
              id="login-password-error"
              className="type-body-md text-error"
              role="alert"
            >
              {errors.password.message}
            </p>
          )}
        </div>

        <Button
          id="login-submit-btn"
          type="submit"
          variant="primary"
          fullWidth
          disabled={busy}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Logging in…
            </span>
          ) : (
            "Login"
          )}
        </Button>
      </form>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <p className="text-center type-body-md text-on-surface-variant">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-secondary font-semibold hover:underline transition-colors"
        >
          Sign Up
        </Link>
      </p>
    </div>
  );
}
