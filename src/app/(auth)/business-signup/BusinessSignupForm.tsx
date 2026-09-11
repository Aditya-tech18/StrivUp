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
  businessName: z.string().min(2, "Business name must be at least 2 characters."),
  email: z.string().min(1, "Email is required.").email("Please enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters.")
    .regex(/[a-zA-Z]/, "Must contain at least one letter.")
    .regex(/[0-9]/, "Must contain at least one number."),
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

const socialBtnCls = "w-full flex items-center justify-center gap-3 h-12 px-4 rounded-xl border border-outline-variant bg-surface-container-lowest hover:bg-surface-container transition-colors text-[length:var(--font-size-body-lg)] font-medium text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50 disabled:cursor-not-allowed";

function pwdCls(err: boolean) {
  return `w-full h-12 px-4 pr-11 rounded-xl border bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant text-[length:var(--font-size-body-lg)] transition-colors focus:outline-none focus:ring-2 ${err ? "border-error focus:ring-error/20" : "border-outline-variant focus:border-secondary focus:ring-secondary/20"}`;
}

export function BusinessSignupForm() {
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setAuthError(null);
    const supabase = createClient();
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { full_name: data.businessName, account_type: "business" } },
    });
    if (error) { setAuthError(error.message); return; }

    // Email confirmation needed?
    if (!signUpData.session && signUpData.user?.identities?.length === 0) {
      setCheckEmail(true);
      return;
    }

    if (signUpData.user) {
      await supabase.from("profiles").update({ account_type: "business" }).eq("id", signUpData.user.id);
      await supabase.from("business_profiles").upsert({
        id: signUpData.user.id,
        business_name: data.businessName,
        onboarding_step: 1,
        onboarding_done: false,
        verification_status: "draft",
      }, { onConflict: "id", ignoreDuplicates: true });
    }
    router.push("/business/onboarding");
    router.refresh();
  };

  const handleGoogle = async () => {
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

  if (checkEmail) return (
    <div className="w-full max-w-sm text-center space-y-6 py-10">
      <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center mx-auto">
        <Building2 size={28} className="text-secondary" />
      </div>
      <div>
        <h2 className="type-headline-md text-on-surface font-black">Check your inbox</h2>
        <p className="type-body-md text-on-surface-variant mt-2">
          We sent a confirmation link to your email. Click it to activate your business account.
        </p>
      </div>
      <Link href="/business-login" className="type-body-md text-secondary font-semibold hover:underline">
        Already confirmed? Login →
      </Link>
    </div>
  );

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center">
          <Building2 size={28} className="text-secondary" />
        </div>
        <div>
          <p className="text-[11px] font-black tracking-[0.2em] text-secondary uppercase mb-1">STRIVUP BUSINESS</p>
          <h1 className="type-headline-md text-on-surface font-black">Create Business Account</h1>
          <p className="type-body-md text-on-surface-variant mt-1">Attract customers, run campaigns, grow your brand.</p>
        </div>
      </div>

      {authError && (
        <div role="alert" className="rounded-xl border border-error/30 bg-error-container px-4 py-3 type-body-md text-error">{authError}</div>
      )}

      <button type="button" onClick={handleGoogle} disabled={busy} className={socialBtnCls}>
        {googleLoading ? <Loader2 size={20} className="animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </button>

      <div className="flex items-center gap-3">
        <hr className="flex-1 border-outline-variant" />
        <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-widest">or</span>
        <hr className="flex-1 border-outline-variant" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input id="biz-name" label="Business Name" type="text" autoComplete="organization"
          placeholder="e.g. The Brew House" error={errors.businessName?.message} disabled={busy} {...register("businessName")} />
        <Input id="biz-email" label="Business Email" type="email" autoComplete="email"
          placeholder="hello@yourbusiness.com" error={errors.email?.message} disabled={busy} {...register("email")} />
        <div className="flex flex-col gap-1">
          <label htmlFor="biz-pwd" className="type-body-md font-medium text-on-surface">Password</label>
          <div className="relative">
            <input id="biz-pwd" type={showPwd ? "text" : "password"} autoComplete="new-password"
              placeholder="Min. 8 chars, 1 letter + 1 number" disabled={busy}
              className={`${pwdCls(!!errors.password)} disabled:opacity-50`} {...register("password")} />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-label="Toggle password">
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <p className="type-body-md text-error">{errors.password.message}</p>}
        </div>
        <Button type="submit" variant="primary" fullWidth disabled={busy} size="lg">
          {isSubmitting ? <><Loader2 size={16} className="animate-spin mr-2" />Creating…</> : "Create Business Account"}
        </Button>
      </form>

      <div className="space-y-2 text-center">
        <p className="type-body-md text-on-surface-variant">
          Already have a business account?{" "}
          <Link href="/business-login" className="text-secondary font-semibold hover:underline">Login</Link>
        </p>
        <p className="type-body-md text-on-surface-variant">
          Not a business?{" "}
          <Link href="/signup" className="text-secondary font-semibold hover:underline">Sign up as User</Link>
        </p>
      </div>
    </div>
  );
}
