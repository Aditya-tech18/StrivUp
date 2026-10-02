import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectProvider } from "@/lib/activity/service";
import type { ActivityProviderId } from "@/lib/activity/types";

/**
 * POST /api/activity/disconnect  { provider }
 *
 * Revokes our access by deleting the stored tokens outright (spec §22 — a
 * disconnect must actually stop us reading, not just hide a row).
 *
 * Historical activity_records are deliberately retained: a completed quest and
 * the reward it unlocked have to remain auditable. Full erasure belongs to the
 * existing account-deletion flow, not here.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  let providerId: string | undefined;
  try {
    ({ provider: providerId } = (await request.json()) as { provider?: string });
  } catch {
    /* fall through to the validation below */
  }

  if (!providerId) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 });
  }

  try {
    await disconnectProvider(user.id, providerId as ActivityProviderId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "disconnect failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
