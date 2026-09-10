"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function DeactivatedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center px-5">
      <div className="max-w-sm w-full flex flex-col items-center gap-6 text-center py-10">
        <div className="w-20 h-20 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center shadow-[0_4px_20px_rgba(245,158,11,0.15)]">
          <Clock size={36} className="text-amber-500" strokeWidth={1.5} />
        </div>

        <div className="max-w-xs">
          <h1 className="text-[22px] font-bold text-on-surface tracking-[-0.02em]">Account Deactivated</h1>
          <p className="text-[14px] text-on-surface-variant mt-2 leading-relaxed">
            Your account is currently deactivated. Your data is safe and you can reactivate anytime by signing back in.
          </p>
        </div>

        <div className="w-full bg-amber-50 border border-amber-100 rounded-2xl p-4 text-left space-y-2">
          {[
            "Your profile and progress are preserved",
            "No one can see your profile while deactivated",
            "Reactivate instantly by signing back in",
          ].map(item => (
            <div key={item} className="flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
              <p className="text-[13px] text-on-surface">{item}</p>
            </div>
          ))}
        </div>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={handleReactivate}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-secondary text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_2px_8px_rgba(29,78,216,0.25)]"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Reactivating…</> : "Reactivate Account"}
          </button>
          <button
            onClick={handleLogOut}
            className="w-full h-12 rounded-xl border border-outline-variant text-on-surface font-semibold text-[15px] hover:bg-surface-container-low transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
