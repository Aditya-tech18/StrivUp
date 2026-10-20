/**
 * POST /api/strivy/push/dev: DEVELOPMENT ONLY.
 *
 * Returns 404 in production builds and unless STRIVY_PUSH_DEV_TOOLS=true.
 * Acts only on the signed-in user:
 *   { "action": "test" }                    one test push to your own devices
 *   { "action": "run", "window": "evening" } the real scheduler, for you only
 *   { "action": "diagnose" }                 every server-side push check, pass/fail
 */
import { createClient } from "@/lib/supabase/server";
import { isStrivyEnabled } from "@/lib/strivy/config";
import { getPushAdminClient, getPushSender } from "@/lib/strivy/push/admin";
import { arePushDevToolsEnabled, isPushEnabled } from "@/lib/strivy/push/config";
import { checkPushServer, firstPushConfigProblem } from "@/lib/strivy/push/diagnostics";
import { handleDev, withFallback } from "@/lib/strivy/push/http";

export async function POST(request: Request) {
  return withFallback(() =>
    handleDev(request, {
      isEnabled: () => isStrivyEnabled() && isPushEnabled(),
      devToolsEnabled: arePushDevToolsEnabled,
      getSupabase: createClient,
      getAdmin: getPushAdminClient,
      getSender: getPushSender,
      configProblem: () => firstPushConfigProblem(),
      serverChecks: () => checkPushServer(),
    })
  );
}
