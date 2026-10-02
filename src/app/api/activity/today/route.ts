import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/activity/today?tz=Asia/Kolkata
 *
 * Today's stored step count. The in-app counter calls this on mount so it
 * resumes from where the user left off instead of restarting at zero after a
 * page reload.
 *
 * Deliberately uses the normal authenticated client, not the service role:
 * `activity_records` already has an RLS policy letting a user read their own
 * rows, so this needs no elevated key. That keeps the read working even on a
 * deployment where SUPABASE_SERVICE_ROLE_KEY has not been set yet.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const tz = request.nextUrl.searchParams.get("tz");
  const timezone = tz && tz.length > 0 && tz.length < 64 ? tz : "Asia/Kolkata";

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { data, error } = await supabase
    .from("activity_records")
    .select("steps")
    .eq("user_id", user.id)
    .eq("activity_type", "steps")
    .eq("local_date", today)
    .eq("activity_status", "VALID");

  if (error) {
    console.error("[GET /api/activity/today]", error.message);
    return NextResponse.json({ steps: 0, timezone });
  }

  /* Several sources can report the same day; resume from the largest so the
     counter never appears to lose progress. */
  const steps = (data ?? []).reduce((max, r) => Math.max(max, (r.steps as number) ?? 0), 0);

  return NextResponse.json({ steps, timezone });
}
