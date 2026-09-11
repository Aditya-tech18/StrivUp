/**
 * Root page — /
 *
 * PRIMARY job: Render the STRIVUP gateway (Continue as User / Continue as Business).
 *
 * SECONDARY job: Handle stray OAuth ?code= from Supabase (when site_url = root).
 * When ?code= is present, forward to /auth/callback. Otherwise show the gateway.
 */
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { GatewayScreen } from "@/app/(auth)/GatewayScreen";

function RootHandler() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  useEffect(() => {
    if (code) {
      const isBusinessFlow =
        document.cookie.split(";").some(c => c.trim().startsWith("strivup_business_intent=1"));
      const next = isBusinessFlow ? "/business" : "/feed";
      window.location.replace(
        `/auth/callback?code=${encodeURIComponent(code)}&next=${next}`
      );
    }
    // No code → just render the gateway below
  }, [code]);

  // If handling an OAuth code, show a loading spinner
  if (code) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
      </div>
    );
  }

  // No code → show the gateway
  return <GatewayScreen />;
}

export default function RootPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-surface">
          <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
        </div>
      }
    >
      <RootHandler />
    </Suspense>
  );
}
