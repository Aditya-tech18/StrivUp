import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider, redirectUriFor } from "@/lib/activity/providers";
import { saveConnection, syncUserActivity } from "@/lib/activity/service";
import type { ActivityProviderId } from "@/lib/activity/types";

/**
 * GET /api/activity/callback/[provider]
 *
 * OAuth redirect target. Verifies state, exchanges the code for tokens, stores
 * them service-role-side, and does one immediate backfill so the user sees real
 * numbers the moment they land back in the app rather than an empty card.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;
  const origin = request.nextUrl.origin;
  const settings = (q: string) => NextResponse.redirect(new URL(`/settings/activity?${q}`, origin));

  const provider = getProvider(providerId);
  if (!provider) return settings("error=unknown_provider");

  /* The user may have declined on the provider's consent screen. That is a
     normal outcome, not an error worth shouting about. */
  const error = request.nextUrl.searchParams.get("error");
  if (error) return settings(`error=declined&provider=${providerId}`);

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(`strivup_activity_state_${providerId}`)?.value;

  if (!code) return settings(`error=missing_code&provider=${providerId}`);
  if (!state || !expectedState || state !== expectedState) {
    return settings(`error=state_mismatch&provider=${providerId}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?redirectTo=/settings/activity", origin));

  try {
    const tokens = await provider.exchangeCode(code, redirectUriFor(providerId, origin));
    await saveConnection(user.id, providerId as ActivityProviderId, tokens);

    /* Backfill a fortnight so an in-progress quest picks up activity the user
       already walked before connecting — bounded by the quest window anyway. */
    try {
      await syncUserActivity(user.id, providerId as ActivityProviderId, 14);
    } catch (syncError) {
      /* Connection succeeded; the first sync can be retried from the UI. Do not
         fail the whole connect flow over it. */
      console.error("[activity callback] initial sync failed:", syncError);
    }

    const response = settings(`connected=${providerId}`);
    response.cookies.delete(`strivup_activity_state_${providerId}`);
    return response;
  } catch (err) {
    console.error("[activity callback]", err);
    return settings(`error=connect_failed&provider=${providerId}`);
  }
}
