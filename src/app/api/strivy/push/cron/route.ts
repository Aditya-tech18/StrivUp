/**
 * GET/POST /api/strivy/push/cron: one scheduler pass over every subscribed
 * user. Requires `Authorization: Bearer $CRON_SECRET`.
 *
 * Local test (see the v5 report):
 *   curl -i -X POST http://localhost:3000/api/strivy/push/cron \
 *     -H "Authorization: Bearer $CRON_SECRET"
 * A setup problem answers 503 with { error, category } naming what's missing
 * (never a value); delivery failures answer 207/502 with counts by category.
 *
 * NOT SCHEDULED ANYWHERE YET. Nothing calls this route until a cron job is
 * set up (for example a Vercel Cron entry hitting it hourly, which sends the
 * bearer header automatically). See the Phase 4.1 report.
 */
import { isStrivyEnabled } from "@/lib/strivy/config";
import { getPushAdminClient, getPushSender } from "@/lib/strivy/push/admin";
import { isPushEnabled } from "@/lib/strivy/push/config";
import { firstPushConfigProblem } from "@/lib/strivy/push/diagnostics";
import { handleCron, withFallback } from "@/lib/strivy/push/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const deps = {
  isEnabled: () => isStrivyEnabled() && isPushEnabled(),
  cronSecret: () => process.env.CRON_SECRET,
  getAdmin: getPushAdminClient,
  getSender: getPushSender,
  configProblem: () => firstPushConfigProblem(),
};

export async function GET(request: Request) {
  return withFallback(() => handleCron(request, deps));
}

export async function POST(request: Request) {
  return withFallback(() => handleCron(request, deps));
}
