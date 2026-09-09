"use client";

import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function DeactivatedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleReactivate = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ is_deactivated: false, updated_at: new Date().toISOString() }).eq("id", user.id);
    }
    router.replace("/feed");
  };

  const handleLogOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center px-5">
      <div className="max-w-sm w-full flex flex-col items-center gap-6 text-center py-10">
        <div className="w-20 h-20 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
          <Clock size={36} className="text-amber-500" />
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-on-surface">Account Deactivated</h1>
          <p className="type-body-md text-on-surface-variant mt-2 leading-relaxed">
            Your account is currently deactivated. Your data is preserved and you can reactivate anytime.
          </p>
        </div>
        <div className="w-full flex flex-col gap-3">
          <button onClick={handleReactivate} disabled={loading}
            className="w-full h-12 rounded-xl bg-secondary text-white font-bold text-[15px] flex items-center justify-center disabled:opacity-50">
            {loading ? "Reactivating…" : "Reactivate Account"}
          </button>
          <button onClick={handleLogOut}
            className="w-full h-12 rounded-xl border border-outline-variant text-on-surface font-semibold text-[15px]">
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
