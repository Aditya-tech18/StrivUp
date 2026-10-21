/**
 * GET /api/strivy/llm — text model (OpenRouter free router) health for the
 * signed-in user. Detailed in development, a bare ok/not-ok in production.
 * See src/lib/strivy/health.ts.
 */
import { createClient } from "@/lib/supabase/server";
import { isStrivyEnabled } from "@/lib/strivy/config";
import { getStrivyModelProvider } from "@/lib/strivy/model";
import { handleLlmHealthRequest } from "@/lib/strivy/health";

export async function GET() {
  return handleLlmHealthRequest({
    isEnabled: isStrivyEnabled,
    getSupabase: createClient,
    getProvider: () => getStrivyModelProvider(),
    detailed: () => process.env.NODE_ENV !== "production",
  });
}
