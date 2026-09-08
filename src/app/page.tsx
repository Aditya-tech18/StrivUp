/**
 * Root page — /
 *
 * When Supabase's site_url is set to localhost:3000, Google OAuth redirects
 * to localhost:3000/?code=XXXX instead of /auth/callback.
 *
 * This page catches that ?code= and forwards it to /auth/callback,
 * preserving the business intent via cookie.
 *
 * For users with no code, redirects to /login.
 */
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Flame } from "lucide-react";
import { Suspense } from "react";

function RootRedirecter() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  useEffect(() => {
    if (code) {
      // Detect business intent from cookie set before OAuth started
      const isBusinessFlow =
        document.cookie.split(";").some(c => c.trim().startsWith("strivup_business_intent=1"));
      const next = isBusinessFlow ? "/business" : "/feed";
      // Hard-replace to /auth/callback with the code — this hits the server route
      window.location.replace(
        `/auth/callback?code=${encodeURIComponent(code)}&next=${next}`
      );
    } else {
      // No OAuth code → go to the auth gateway
      window.location.replace("/login");
    }
  }, [code]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-surface">
      <div className="w-14 h-14 rounded-xl bg-primary-container flex items-center justify-center animate-pulse">
        <Flame size={28} className="text-on-primary" />
      </div>
      <p className="text-sm text-on-surface-variant">
        {code ? "Completing sign-in…" : "Redirecting…"}
      </p>
    </div>
  );
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
      <RootRedirecter />
    </Suspense>
  );
}
