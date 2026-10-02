import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider, redirectUriFor } from "@/lib/activity/providers";
import { randomBytes } from "crypto";

/**
 * GET /api/activity/connect/[provider]
 *
 * Starts the OAuth handshake for one provider. We only ever request the
 * scopes the provider needs for activity — nothing else (spec §7, §22).
 *
 * CSRF: a random `state` is set as an httpOnly cookie and echoed by the
 * provider on the callback. A callback whose state does not match the cookie
 * is rejected, so an attacker cannot bind their fitness account to someone
 * else's STRIVUP profile.
 *
 * Next 16: `params` is a Promise and must be awaited.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?redirectTo=/settings/activity`, request.nextUrl.origin)
    );
  }

  const provider = getProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: `unknown provider: ${providerId}` }, { status: 404 });
  }
  if (!provider.isConfigured()) {
    return NextResponse.redirect(
      new URL(`/settings/activity?error=not_configured&provider=${providerId}`, request.nextUrl.origin)
    );
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = redirectUriFor(providerId, request.nextUrl.origin);

  const response = NextResponse.redirect(provider.buildAuthUrl(state, redirectUri));

  response.cookies.set(`strivup_activity_state_${providerId}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes is plenty for a consent screen
  });

  return response;
}
