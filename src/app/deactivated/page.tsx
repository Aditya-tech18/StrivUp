"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Clock, Loader2, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function DeactivatedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Admin-imposed status (suspended / banned / deactivated by STRIVUP) can't be self-lifted.
  const [enforced, setEnforced] = useState<{ status: string; reason: string | null } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data, error } = await supabase.from("profiles")
        .select("account_status, account_status_reason").eq("id", user.id).maybeSingle();
      if (error || !data) return;
      const row = data as { account_status?: string; account_status_reason?: string | null };
      if (row.account_status && row.account_status !== "active") {
        setEnforced({ status: row.account_status, reason: row.account_status_reason ?? null });
      }
    });
  }, []);

  const handleReactivate = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Try to unset deactivation — may silently fail if column not yet added
        try {
          await supabase
            .from("profiles")
            .update({ is_deactivated: false, updated_at: new Date().toISOString() })
            .eq("id", user.id);
        } catch { /* column not yet in schema — user is still logged in so just redirect */ }
      }
      router.replace("/feed");
    } catch {
      setLoading(false);
    }
  };

  const handleLogOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (enforced) {
    const label = enforced.status === "banned" ? "Account Banned" : enforced.status === "suspended" ? "Account Suspended" : "Account Deactivated";
    const Icon = enforced.status === "banned" ? Ban : ShieldAlert;
    return (
      <div className="min-h-screen bg-surface-container-low flex items-center justify-center px-5">
        <div className="max-w-sm w-full flex flex-col items-center gap-6 text-center py-10">
          <div className="w-20 h-20 rounded-2xl bg-error-container border border-error-outline flex items-center justify-center">
            <Icon size={36} className="text-on-error-container" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-headline-md font-bold text-on-surface tracking-[-0.02em]">{label}</h1>
            <p className="text-body-md text-on-surface-variant mt-2 leading-relaxed">
              {enforced.status === "banned"
                ? "This account can no longer use STRIVUP because of a serious or repeated policy violation."
                : "STRIVUP has restricted this account while a policy issue is reviewed. Your data is preserved."}
            </p>
          </div>
          {enforced.reason && (
            <div className="w-full rounded-2xl border border-error-outline bg-error-container p-4 text-left">
              <p className="text-label-sm font-bold uppercase tracking-wider text-on-error-container">Reason</p>
              <p className="mt-1 text-body-md text-on-error-container">{enforced.reason}</p>
            </div>
          )}
          <p className="text-body-md text-on-surface-variant">
            If you think this is a mistake, email <span className="font-semibold text-on-surface">strivup.officialteam@gmail.com</span> with your username.
          </p>
          <button onClick={handleLogOut}
            className="w-full h-12 rounded-xl border border-outline-variant text-on-surface font-semibold text-body-lg hover:bg-surface-container-low transition-colors">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-5">
      <div className="max-w-sm w-full flex flex-col items-center gap-6 text-center py-10">
        <div className="w-20 h-20 rounded-2xl bg-warning-container border border-warning-outline flex items-center justify-center shadow-[0_4px_20px_rgba(245,158,11,0.15)]">
          <Clock size={36} className="text-warning" strokeWidth={1.5} />
        </div>

        <div className="max-w-xs">
          <h1 className="text-headline-md font-bold text-on-surface tracking-[-0.02em]">Account Deactivated</h1>
          <p className="text-body-md text-on-surface-variant mt-2 leading-relaxed">
            Your account is currently deactivated. Your data is safe and you can reactivate anytime by signing back in.
          </p>
        </div>

        <div className="w-full bg-warning-container border border-warning-outline rounded-2xl p-4 text-left space-y-2">
          {[
            "Your profile and progress are preserved",
            "No one can see your profile while deactivated",
            "Reactivate instantly by signing back in",
          ].map(item => (
            <div key={item} className="flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 shrink-0" />
              <p className="text-body-md text-on-surface">{item}</p>
            </div>
          ))}
        </div>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={handleReactivate}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-secondary text-white font-bold text-body-lg flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_2px_8px_rgba(29,78,216,0.25)]"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Reactivating…</> : "Reactivate Account"}
          </button>
          <button
            onClick={handleLogOut}
            className="w-full h-12 rounded-xl border border-outline-variant text-on-surface font-semibold text-body-lg hover:bg-surface-container-low transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
