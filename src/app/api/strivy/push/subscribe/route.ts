/**
 * POST /api/strivy/push/subscribe   save this browser's push endpoint for the
 *                                   signed-in user
 * DELETE /api/strivy/push/subscribe remove it
 *
 * Needs STRIVY_ENABLED and STRIVY_PUSH_ENABLED, and the Phase 4.1 migration.
 */
import { createClient } from "@/lib/supabase/server";
import { isStrivyEnabled } from "@/lib/strivy/config";
import { isPushEnabled } from "@/lib/strivy/push/config";
import { handleSubscribe, withFallback } from "@/lib/strivy/push/http";

const deps = {
  isEnabled: () => isStrivyEnabled() && isPushEnabled(),
  getSupabase: createClient,
};

export async function POST(request: Request) {
  return withFallback(() => handleSubscribe(request, deps));
}

export async function DELETE(request: Request) {
  return withFallback(() => handleSubscribe(request, deps));
}
