"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Loader2 } from "lucide-react";
import { deactivateMyAccount } from "@/lib/supabase/profile";

export default function DeactivatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      <div className="sticky top-0 z-30 flex items-center gap-3 px-5 py-4 bg-white border-b border-outline-variant">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={20} />
        </button>
        <h1 className="type-headline-sm text-on-surface font-bold">Deactivate Account</h1>
      </div>

      <div className="max-w-lg mx-auto px-5 py-10 flex flex-col items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
          <Clock size={36} className="text-amber-500" />
        </div>

        <div className="text-center">
          <h2 className="text-[22px] font-bold text-on-surface">Deactivate your account?</h2>
          <p className="type-body-md text-on-surface-variant mt-2 leading-relaxed">
            Your profile will temporarily become unavailable while your account is deactivated. You can reactivate it anytime by logging back in.
          </p>
        </div>

        {error && (
          <div className="w-full px-4 py-3 rounded-xl bg-error-container border border-error/20">
            <p className="type-body-md text-error text-center">{error}</p>
          </div>
        )}

        {/* What happens */}
        <div className="w-full bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2.5">
          {[
            "Your data will be preserved",
            "Your profile won't be visible to others",
            "You can reactivate anytime by logging back in",
          ].map(item => (
            <div key={item} className="flex items-start gap-2.5">
              <span className="text-amber-500 font-bold mt-0.5">•</span>
              <p className="type-body-md text-on-surface">{item}</p>
            </div>
          ))}
        </div>

        <div className="w-full flex flex-col gap-3">
          <button onClick={handleDeactivate} disabled={loading}
            className="w-full h-12 rounded-xl bg-secondary text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Deactivating…</> : "Deactivate Account"}
          </button>
          <button onClick={() => router.back()}
            className="w-full h-12 rounded-xl border border-outline-variant text-on-surface font-semibold text-[15px] hover:bg-surface-container transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
