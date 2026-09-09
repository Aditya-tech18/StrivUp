"use client";
/**
 * /business — Smart router.
 * No profile → onboarding
 * Incomplete → onboarding (resumes)
 * Done → dashboard
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";

export default function BusinessEntryPage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const bp = await getMyBusinessProfile(supabase);

      if (!bp || !bp.onboarding_done) {
        // Create starter row if none exists
        if (!bp) {
          await supabase.from("business_profiles").upsert({
            id: user.id,
            onboarding_step: 1,
            onboarding_done: false,
            verification_status: "draft",
          }, { onConflict: "id", ignoreDuplicates: true });
          await supabase.from("profiles").update({ account_type: "business" }).eq("id", user.id);
        }
        router.replace("/business/onboarding");
      } else {
        router.replace("/business/dashboard");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F9FC] gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      <p className="text-sm text-gray-500">Loading your business…</p>
    </div>
  );
}
