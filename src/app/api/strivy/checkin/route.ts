/**
 * POST /api/strivy/checkin — STRIVY's proactive check-in.
 *
 * Detects accountability moments from the signed-in user's own data (RLS,
 * no service-role key) and returns grounded check-ins for the Strivy panel.
 * Notifications are only written when STRIVY_NOTIFICATIONS_ENABLED=true and
 * the strivy_emit_notifications() function exists (migration not applied yet).
 * Takes no input; the user id always comes from the session.
 */
import { createClient } from "@/lib/supabase/server";
import { isStrivyEnabled } from "@/lib/strivy/config";
import { getStrivyNotifier } from "@/lib/strivy/notifier";
import { handleStrivyCheckinRequest } from "@/lib/strivy/pipeline";

export async function POST(request: Request) {
  return handleStrivyCheckinRequest(request, {
    isEnabled: isStrivyEnabled,
    getSupabase: createClient,
    getNotifier: getStrivyNotifier,
  });
}
