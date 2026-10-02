import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncAllForUser, syncUserActivity } from "@/lib/activity/service";
import type { ActivityProviderId } from "@/lib/activity/types";

/**
 * POST /api/activity/sync
 *
 * User-triggered refresh ("Sync now"). The body may name a provider; with no
 * body every connected provider is synced.
 *
 * Note what this endpoint does NOT accept: step counts. The client can ask us
 * to go and read from the provider, but it can never tell us what the number
 * is (spec §42). The only writer of activity_records is
 * ingest_activity_records(), whose EXECUTE grant is revoked from
 * `authenticated`.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  let providerId: string | undefined;
  let days = 7;
  try {
    const body = (await request.json()) as { provider?: string; days?: number };
    providerId = body.provider;
    if (typeof body.days === "number") days = Math.min(Math.max(body.days, 1), 30);
  } catch {
    /* No body is fine — sync everything. */
  }

  try {
    const results = providerId
      ? [await syncUserActivity(user.id, providerId as ActivityProviderId, days)]
      : await syncAllForUser(user.id, days);

    if (results.length === 0) {
      return NextResponse.json(
        { error: "no activity provider connected", results: [] },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
