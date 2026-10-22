/**
 * GET /api/strivy/voice — which voice options this server offers (whether
 * Gemini transcription is set up, and the preferred provider). Booleans only:
 * the Gemini key is never sent to the browser. See src/lib/strivy/voice/.
 */
import { createClient } from "@/lib/supabase/server";
import { isStrivyEnabled } from "@/lib/strivy/config";
import { handleVoiceConfigRequest } from "@/lib/strivy/voice/server";

export async function GET() {
  return handleVoiceConfigRequest({ isEnabled: isStrivyEnabled, getSupabase: createClient });
}
