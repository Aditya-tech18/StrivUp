/**
 * GET /api/strivy/push/history: the signed-in user's own STRIVY notifications
 * from the last 7 days, for the list under the bell. Read-only, with the
 * user's own session (RLS); no service-role key.
 */
import { createClient } from "@/lib/supabase/server";
import { isStrivyEnabled } from "@/lib/strivy/config";
import { isPushEnabled } from "@/lib/strivy/push/config";
import { handleHistory, withFallback } from "@/lib/strivy/push/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withFallback(() =>
    handleHistory(request, {
      isEnabled: () => isStrivyEnabled() && isPushEnabled(),
      getSupabase: createClient,
    })
  );
}
