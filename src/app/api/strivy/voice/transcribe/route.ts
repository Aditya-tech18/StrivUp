/**
 * POST /api/strivy/voice/transcribe — a short recording in, its transcript
 * out, using Gemini on the server (voice only, optional, needs
 * GEMINI_API_KEY). The transcript is then sent to /api/strivy/chat by the
 * browser like any typed message. See src/lib/strivy/voice/server.ts.
 */
import { createClient } from "@/lib/supabase/server";
import { isStrivyEnabled } from "@/lib/strivy/config";
import { handleVoiceTranscribeRequest } from "@/lib/strivy/voice/server";

export async function POST(request: Request) {
  return handleVoiceTranscribeRequest(request, {
    isEnabled: isStrivyEnabled,
    getSupabase: createClient,
  });
}
