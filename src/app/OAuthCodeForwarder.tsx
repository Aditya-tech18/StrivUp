"use client";

/**
 * OAuthCodeForwarder — handles a stray Supabase OAuth ?code= that lands on /.
 *
 * It happens when the Supabase project's site_url is the bare domain, so the
 * provider redirects to / rather than to /auth/callback. This forwards the code
 * on, choosing the destination from the business-intent cookie the business
 * sign-in flow sets.
 *
 * Rendered beside the gateway rather than instead of it, so the page itself
 * stays a server component and can still export metadata. With no code present
 * this renders nothing at all and the gateway behind it is what you see.
 */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function OAuthCodeForwarder() {
  const code = useSearchParams().get("code");

  useEffect(() => {
    if (!code) return;
    const isBusinessFlow = document.cookie
      .split(";")
      .some(c => c.trim().startsWith("strivup_business_intent=1"));
    const next = isBusinessFlow ? "/business" : "/feed";
    window.location.replace(
      `/auth/callback?code=${encodeURIComponent(code)}&next=${next}`
    );
  }, [code]);

  if (!code) return null;

  return (
    <div
      role="status"
      aria-label="Signing you in"
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
    </div>
  );
}
