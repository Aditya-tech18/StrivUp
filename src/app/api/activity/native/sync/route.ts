import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ingestNativeActivity,
  registerNativeConnection,
  type PushProvider,
} from "@/lib/activity/service";

/**
 * POST /api/activity/native/sync
 *   { provider?, timezone?, records: [{ local_date, steps }] }
 *
 * Where the in-app pedometer sends its running total.
 *
 * This is the only endpoint that accepts activity values from a client, because
 * the counter runs in the browser and there is nothing to poll. The payload is
 * therefore treated as untrusted: ingestNativeActivity() reads only
 * `local_date` and `steps`, derives every other field server-side, clamps the
 * values, keeps the day's count monotonic, and the database function then runs
 * the same fraud heuristics as every other source.
 *
 * Quest progress, task completion and reward eligibility are all recalculated
 * inside that one database call, so a push either lands completely or not at
 * all.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  let body: { timezone?: string; provider?: string; records?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const timezone =
    typeof body.timezone === "string" && body.timezone.length > 0 && body.timezone.length < 64
      ? body.timezone
      : "Asia/Kolkata";

  const allowed: PushProvider[] = ["device_sensor", "health_connect", "healthkit"];
  const provider: PushProvider = allowed.includes(body.provider as PushProvider)
    ? (body.provider as PushProvider)
    : "device_sensor";

  if (!Array.isArray(body.records)) {
    return NextResponse.json({ error: "records must be an array" }, { status: 400 });
  }

  try {
    /* First push of the day also registers the connection, so the user's
       settings page can show that in-app tracking is active. */
    await registerNativeConnection(user.id, provider, timezone);

    const result = await ingestNativeActivity(user.id, provider, body.records, timezone);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync failed";
    const status = /must be|too many/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
