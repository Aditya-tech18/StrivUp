import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client with no session attached.
 *
 * Share previews are read with this rather than the cookie-bound server
 * client, and that is a correctness requirement, not a style choice. Open
 * Graph metadata and the generated card image are public artefacts: whatever
 * they contain is handed to WhatsApp, cached by Meta, and shown to anyone the
 * link reaches. If they were built with the viewer's session, a creator
 * opening their own private challenge would mint a preview card containing
 * private data, and that card would then be served to everyone.
 *
 * Reading as the anonymous role makes RLS the arbiter: a row the public
 * cannot select simply does not come back, so the preview falls through to
 * generic StrivUp branding without the calling code having to reason about
 * visibility at all.
 */
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
