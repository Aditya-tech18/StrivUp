import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * Handles the OAuth redirect from Supabase (Google OAuth, magic-link, etc.).
 * Exchanges the one-time `code` query param for a session using the SSR
 * server client, then redirects the user to /feed on success or /login on
 * failure.
 *
 * The `redirectTo` passed to signInWithOAuth must be:
 *   `${window.location.origin}/auth/callback`
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` lets callers specify a post-auth destination (unused for now).
  const next = searchParams.get("next") ?? "/feed";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Redirect to /login with an error indicator so the UI can surface it.
  return NextResponse.redirect(`${origin}/login?error=oauth_callback_failed`);
}
