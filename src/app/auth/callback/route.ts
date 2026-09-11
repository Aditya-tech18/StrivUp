import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * Handles OAuth redirects from Supabase (Google OAuth, magic-link, etc.).
 * Exchanges the one-time `code` for a session, then redirects based on `next`.
 *
 * Business Google OAuth passes:  redirectTo = /auth/callback?next=/business
 * User Google OAuth passes:      redirectTo = /auth/callback  (defaults to /feed)
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/feed";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // If this is a business OAuth flow, set up the business profile
      if (next.startsWith("/business")) {
        // Clear the business intent cookie
        const clearCookie = new NextResponse();
        clearCookie.cookies.set("strivup_business_intent", "", { maxAge: 0, path: "/" });

        // Mark account as business
        await supabase
          .from("profiles")
          .update({ account_type: "business", updated_at: new Date().toISOString() })
          .eq("id", data.user.id);

        // Create business_profiles row if it doesn't exist yet
        await supabase
          .from("business_profiles")
          .upsert(
            {
              id: data.user.id,
              business_name: data.user.user_metadata?.full_name ?? null,
              logo_url: data.user.user_metadata?.avatar_url ?? null,
              onboarding_step: 1,
              onboarding_done: false,
              verification_status: "draft",
            },
            { onConflict: "id", ignoreDuplicates: true }
          );

        // Check if onboarding already completed → go straight to dashboard
        const { data: bp } = await supabase
          .from("business_profiles")
          .select("onboarding_done")
          .eq("id", data.user.id)
          .maybeSingle();

        const destination = bp?.onboarding_done ? "/business/dashboard" : "/business/onboarding";
        const response = NextResponse.redirect(`${origin}${destination}`);
        response.cookies.set("strivup_business_intent", "", { maxAge: 0, path: "/" });
        return response;
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Determine error redirect based on intent
  const errorDest = next.startsWith("/business")
    ? "/business-login?error=oauth_failed"
    : "/login?error=oauth_callback_failed";

  return NextResponse.redirect(`${origin}${errorDest}`);
}
