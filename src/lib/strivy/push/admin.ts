/**
 * src/lib/strivy/push/admin.ts
 *
 * The service-role Supabase client the push scheduler needs to work across
 * users. Server only: it is imported by route handlers and nothing else, and
 * SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix, so Next never ships it
 * to a browser. Every query made with it filters by the user being processed.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { vapidFromEnv, webPushSender, type PushSender } from "./sender";

export function getPushAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getPushSender(): PushSender | null {
  const vapid = vapidFromEnv();
  return vapid ? webPushSender(vapid) : null;
}
