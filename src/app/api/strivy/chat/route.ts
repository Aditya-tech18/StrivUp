/**
 * POST /api/strivy/chat — STRIVY's only server endpoint.
 *
 * Flow (src/lib/strivy/pipeline.ts): auth → validate → intent → context →
 * grounded draft → OpenRouter FREE model (only with OPENROUTER_API_KEY set;
 * free-only enforced in openrouter.ts) → grounding check → JSON. If the model
 * is off, rate-limited, down or slow, the grounded draft is the answer.
 *
 * Security notes:
 *  - src/proxy.ts does not gate /api/*, so the handler checks the user and
 *    the deactivation flag itself, with getUser() (server-validated), never
 *    getSession().
 *  - The Supabase client carries the user's own session, so RLS applies. No
 *    service-role key is used anywhere in STRIVY.
 *  - The user id always comes from the session, never from the request body.
 *  - Nothing is written to the database, and message text is not logged.
 *  - The model only ever gets the minimal, id-free facts for this intent
 *    (none at all for small talk). OPENROUTER_API_KEY stays on the server.
 */
import { createClient } from "@/lib/supabase/server";
import { isStrivyEnabled } from "@/lib/strivy/config";
import { getStrivyModelProvider } from "@/lib/strivy/model";
import { handleStrivyChatRequest, isStrivyDebugEnabled } from "@/lib/strivy/pipeline";

export async function POST(request: Request) {
  return handleStrivyChatRequest(request, {
    isEnabled: isStrivyEnabled,
    getSupabase: createClient,
    getProvider: () => getStrivyModelProvider(),
    debug: isStrivyDebugEnabled,
  });
}
