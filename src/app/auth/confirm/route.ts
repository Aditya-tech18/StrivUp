import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeRedirect } from "@/lib/safeRedirect";
import { homeFor } from "@/lib/auth/roles";

/**
 * GET /auth/confirm — the landing point for every link we send by email.
 *
 * WHY THIS EXISTS
 * Supabase's default confirmation link points at its own /auth/v1/verify
 * endpoint, which hands the session back in the URL *fragment*. A fragment is
 * never sent to the server, so with server-side auth (@supabase/ssr) the
 * person arrives looking signed out, gets bounced by proxy.ts, and concludes
 * that signing up does not work. That is exactly the bug this fixes.
 *
 * The supported pattern is to put the token hash in the query string and
 * exchange it here. It requires the email templates in the Supabase dashboard
 * to point at this route — see SUPABASE_REDIRECT_SETUP.md. Until they do,
 * confirmation links will keep landing on the old endpoint.
 *
 * /auth/callback stays as it is: that one handles the OAuth `code` exchange,
 * which is a different grant.
 */

/** Link types we accept. Anything else is treated as a bad link. */
const ALLOWED_TYPES = new Set<string>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const nextParam = searchParams.get("next");

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  });

  if (error || !data.user) {
    // Expired and already-used links are the overwhelming majority here, so
    // the login page explains that rather than showing a raw failure.
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  // A recovery link means "let me set a new password", so it must land on the
  // reset screen regardless of what ?next said — the session it just created
  // is the only thing authorising that change.
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  const destination = nextParam
    ? safeRedirect(nextParam)
    : await homeFor(supabase, data.user.id);

  return NextResponse.redirect(`${origin}${destination}`);
}
