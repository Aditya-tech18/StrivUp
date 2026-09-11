"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.string().min(1, "Email is required.").email("Please enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});
type FormValues = z.infer<typeof schema>;

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

const socialBtnCls = [
  "w-full flex items-center justify-center gap-3 h-12 px-4 rounded-xl border border-outline-variant",
  "bg-surface-container-lowest hover:bg-surface-container transition-colors duration-150",
  "text-[length:var(--font-size-body-lg)] font-medium text-on-surface",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

function pwdCls(hasErr: boolean) {
  return [
    "w-full h-12 px-4 pr-11 rounded-xl border bg-surface-container-lowest",
    "text-on-surface placeholder:text-on-surface-variant text-[length:var(--font-size-body-lg)] leading-6",
    "transition-colors focus:outline-none focus:ring-2",
    hasErr ? "border-error focus:ring-error/20" : "border-outline-variant focus:border-secondary focus:ring-secondary/20",
  ].join(" ");
}

export function BusinessLoginForm() {
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  /** After successful auth, smartly route based on business profile state */
  async function routeAfterAuth(userId: string) {
    const supabase = createClient();

    // Ensure account_type = business on profiles
    await supabase.from("profiles").update({ account_type: "business" }).eq("id", userId);

    // Check business_profiles
    const { data: bp } = await supabase
      .from("business_profiles")
      .select("id, onboarding_done, verification_status")
      .eq("id", userId)
      .maybeSingle();

    if (!bp) {
      // Case A: No business profile → create starter row + go to onboarding
      await supabase.from("business_profiles").insert({
        id: userId,
        onboarding_step: 1,
        onboarding_done: false,
        verification_status: "draft",
      });
      router.push("/business/onboarding");
    } else if (!bp.onboarding_done) {
      // Case B: Incomplete onboarding → resume
      router.push("/business/onboarding");
    } else {
      // Case C/D/E: Onboarding done → dashboard (handles all verification states)
      router.push("/business/dashboard");
    }
    router.refresh();
  }

  const onSubmit = async (data: FormValues) => {
    setAuthError(null);
    const supabase = createClient();
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) { setAuthError(error.message); return; }
    await routeAfterAuth(signInData.user.id);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setAuthError(null);
    document.cookie = "strivup_business_intent=1; path=/; max-age=300; SameSite=Lax";
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/business` },
    });
    if (error) { setAuthError(error.message); setGoogleLoading(false); }
  };

  const busy = isSubmitting || googleLoading;

  return (
    <div className="w-full max-w-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center">
          <Building2 size={28} className="text-secondary" />
        </div>
        <div>
          <p className="text-[11px] font-black tracking-[0.2em] text-secondary uppercase mb-1">STRIVUP BUSINESS</p>
          <h1 className="type-headline-md text-on-surface font-black">Welcome Back</h1>
          <p className="type-body-md text-on-surface-variant mt-1">
            Sign in to manage your campaigns and verifications.
          </p>
        </div>
      </div>

      {authError && (
        <div role="alert" className="rounded-xl border border-error/30 bg-error-container px-4 py-3 type-body-md text-error">
          {authError}
        </div>
      )}

      {/* Google */}
      <button type="button" onClick={handleGoogleLogin} disabled={busy} className={socialBtnCls}>
        {googleLoading ? <Loader2 size={20} className="animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </button>

      <div className="flex items-center gap-3">
        <hr className="flex-1 border-outline-variant" />
        <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-widest">or</span>
        <hr className="flex-1 border-outline-variant" />
      </div>

      {/* Email + password */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          id="biz-login-email"
          label="Business Email"
          type="email"
          autoComplete="email"
          placeholder="hello@yourbusiness.com"
          error={errors.email?.message}
          disabled={busy}
          {...register("email")}
        />

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="biz-login-pwd" className="type-body-md font-medium text-on-surface">Password</label>
            <Link href="/forgot-password" className="type-body-md text-secondary hover:underline">Forgot?</Link>
          </div>
          <div className="relative">
            <input
              id="biz-login-pwd"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Min. 8 characters"
              disabled={busy}
              className={`${pwdCls(!!errors.password)} disabled:opacity-50`}
              {...register("password")}
            />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              aria-label={showPwd ? "Hide password" : "Show password"}>
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <p className="type-body-md text-error">{errors.password.message}</p>}
        </div>

        <Button type="submit" variant="primary" fullWidth disabled={busy} size="lg">
          {isSubmitting ? <><Loader2 size={16} className="animate-spin mr-2" />Signing in…</> : "Login to Business Account"}
        </Button>
      </form>

      <div className="space-y-2 text-center">
        <p className="type-body-md text-on-surface-variant">
          New business?{" "}
          <Link href="/business-signup" className="text-secondary font-semibold hover:underline">Create account</Link>
        </p>
        <p className="type-body-md text-on-surface-variant">
          Not a business?{" "}
          <Link href="/login" className="text-secondary font-semibold hover:underline">User login</Link>
        </p>
      </div>
    </div>
  );
}
