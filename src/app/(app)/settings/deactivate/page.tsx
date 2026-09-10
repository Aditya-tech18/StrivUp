"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Loader2 } from "lucide-react";
import { deactivateMyAccount } from "@/lib/supabase/profile";

export default function DeactivatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleDeactivate = async () => {
    setLoading(true); setError(null);
    try {
      await deactivateMyAccount();
      router.replace("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't deactivate. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-28">
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-5 py-3.5">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors">
            <ArrowLeft size={19} className="text-on-surface" />
          </button>
          <h1 className="text-[17px] font-bold text-on-surface tracking-[-0.01em]">Deactivate Account</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-10 flex flex-col items-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center shadow-[0_4px_20px_rgba(245,158,11,0.15)]">
          <Clock size={36} className="text-amber-500" strokeWidth={1.5} />
        </div>

        <div className="text-center max-w-xs">
          <h2 className="text-[22px] font-bold text-on-surface tracking-[-0.02em]">Deactivate your account?</h2>
          <p className="text-[14px] text-on-surface-variant mt-2 leading-relaxed">
            Your profile will be temporarily unavailable. You can reactivate anytime by signing back in.
          </p>
        </div>

        {error && (
          <div className="w-full px-4 py-3 rounded-xl bg-error-container border border-error/20">
            <p className="text-[13px] text-error text-center">{error}</p>
          </div>
        )}

        <div className="w-full bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2.5">
          {[
            "Your data and progress are preserved",
            "Your profile won't be visible to others",
            "You can reactivate anytime by logging back in",
          ].map(item => (
            <div key={item} className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <p className="text-[13px] text-on-surface">{item}</p>
            </div>
          ))}
        </div>

        <div className="w-full flex flex-col gap-3">
          <button onClick={handleDeactivate} disabled={loading}
            className="w-full h-12 rounded-xl bg-secondary text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity shadow-[0_2px_8px_rgba(29,78,216,0.25)]">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Deactivating…</> : "Deactivate Account"}
          </button>
          <button onClick={() => router.back()}
            className="w-full h-12 rounded-xl border border-outline-variant text-on-surface font-semibold text-[15px] hover:bg-surface-container-low transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
