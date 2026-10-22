import { type NextRequest, NextResponse } from "next/server";
import { syncAllConnectedUsers } from "@/lib/activity/service";
import { settleChallengeStakes } from "@/lib/data/stakes";

/**
 * GET /api/activity/cron
 *
 * THIS IS THE "BACKGROUND PEDOMETER".
 *
 * A browser cannot count steps while the app is closed — DeviceMotion stops
 * firing the moment the page is hidden, and there is no web API for HealthKit
 * or Health Connect. What actually happens is:
 *
 *   the phone's motion coprocessor counts continuously, all day, in the
 *   background, with no app running at all
 *        -> the provider (Fitbit / Strava) stores that total
 *        -> this job pulls it on a schedule
 *        -> quest progress advances and tasks complete
 *
 * So progress moves forward while the user is nowhere near the app. That is
 * background tracking in the only form a web deployment can honestly offer.
 *
 * Schedule it in vercel.json — see that file for the exact cron expression
 * (every two hours).
 *
 * Protected by CRON_SECRET. Vercel Cron sends it as a Bearer token
 * automatically; any other caller gets a 401.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    /* Two days of overlap: providers revise a day's total after the fact when
       a watch syncs late. Ingestion is idempotent, so re-reading costs nothing
       and is strictly safer than trusting the first number we saw. */
    const result = await syncAllConnectedUsers(2);

    /* Stake settlement rides the same daily job.
     *
     * It runs AFTER the activity sync on purpose: a step-counted challenge
     * can be satisfied by a provider total that only arrives in this very
     * run, and charging someone for a day the sync was about to complete
     * would be a forfeit the app itself caused.
     *
     * 03:00 UTC is 08:30 IST, so the day being settled closed eight and a
     * half hours earlier. Idempotent per (challenge, date), so a cron retry
     * cannot double-charge.
     */
    const stakes = await settleChallengeStakes();

    return NextResponse.json({ ok: true, ...result, stakes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "cron sync failed";
    console.error("[activity cron]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
