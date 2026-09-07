"use client";

/**
 * /business — Smart entry point.
 * Checks existing business profile and routes to the right place.
 * Case A: No profile → /business/onboarding
 * Case B: Incomplete onboarding → /business/onboarding (resumes)
 * Case C/D: Onboarding done → /business/dashboard
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
        router.replace("/business/onboarding");
      } else {
        router.replace("/business/dashboard");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
        <p className="type-body-md text-on-surface-variant">Loading your business…</p>
      </div>
    </div>
  );
}
