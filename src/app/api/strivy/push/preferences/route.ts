/**
 * GET/PUT /api/strivy/push/preferences: the signed-in user's STRIVY push
 * on/off switch. Stored in strivy_notification_preferences (own row, RLS).
 */
import { createClient } from "@/lib/supabase/server";
import { isStrivyEnabled } from "@/lib/strivy/config";
import { isPushEnabled } from "@/lib/strivy/push/config";
import { handlePreferences, withFallback } from "@/lib/strivy/push/http";

const deps = {
  isEnabled: () => isStrivyEnabled() && isPushEnabled(),
  getSupabase: createClient,
};

export async function GET(request: Request) {
  return withFallback(() => handlePreferences(request, deps));
}

export async function PUT(request: Request) {
  return withFallback(() => handlePreferences(request, deps));
}
