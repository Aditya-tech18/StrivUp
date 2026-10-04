import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. SERVER ONLY — never import this into a client
 * component, and never expose the key to the browser.
 *
 * It exists for exactly two jobs in the activity system:
 *   1. reading and writing activity_connection_secrets, which has RLS on and
 *      no policies, so no other role can touch it;
 *   2. calling ingest_activity_records(), whose EXECUTE grant is revoked from
 *      `authenticated` precisely so a browser cannot assert a step count.
 *
 * Everything a user is allowed to read goes through the normal anon client
 * under RLS instead. Reach for this only when neither of the above applies.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    /* This surfaces in the UI when someone taps "Stop & save", so it has to
       say what to actually do rather than name an internal variable. */
    throw new Error(
      "Step saving isn't configured on this server yet. Add SUPABASE_SERVICE_ROLE_KEY " +
        "to .env.local (Supabase dashboard → Settings → API → service_role) and restart."
    );
  }
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
