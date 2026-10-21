/**
 * src/lib/strivy/voice/server.ts
 *
 * The server half of STRIVY's voice mode.
 *
 *   GET  /api/strivy/voice             which voice options this server has
 *   POST /api/strivy/voice/transcribe  audio → text, with Gemini (optional)
 *
 * Gemini is used for VOICE ONLY: it turns a short recording into text, and
 * that text then goes through the normal chat pipeline like anything typed.
 * The chat itself never calls Gemini. Without GEMINI_API_KEY, voice still
 * works in browsers with the Web Speech API, and text chat is unaffected.
 *
 * The key is read here, on the server, from the environment. It is never
 * sent to the browser, never put in a response and never logged.
 *
 * Configuration (server-only):
 *   GEMINI_API_KEY=                   optional; enables server transcription
 *   STRIVY_VOICE_PROVIDER=auto        auto | browser | gemini
 *   GEMINI_VOICE_MODEL=               optional; default gemini-3.5-flash-lite
 */
import { detectMessageLanguage } from "../language";
import { stripInternalMetadata } from "../sanitize";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizeStrivyRequest } from "../pipeline";
import { createRateLimiter, type RateLimiter } from "../ratelimit";
import type { VoiceServerConfig } from "./speech";

export const DEFAULT_GEMINI_VOICE_MODEL = "gemini-3.5-flash-lite";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** About a minute of compressed speech. Longer clips are refused, not trimmed. */
export const MAX_AUDIO_BYTES = 2_000_000;
const TRANSCRIBE_TIMEOUT_MS = 15_000;
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac|mp3)(;.*)?$/i;

export interface VoiceEnv {
  config: VoiceServerConfig;
  /** Present only when Gemini transcription is enabled. Server memory only. */
  gemini: { apiKey: string; model: string } | null;
}

/** Reads the voice settings. The key never leaves this object. */
export function voiceEnv(env: Record<string, string | undefined> = process.env): VoiceEnv {
  const raw = env.STRIVY_VOICE_PROVIDER?.trim().toLowerCase();
  const prefer = raw === "browser" || raw === "gemini" ? raw : "auto";
  const apiKey = env.GEMINI_API_KEY?.trim() ?? "";
  const model = env.GEMINI_VOICE_MODEL?.trim() || DEFAULT_GEMINI_VOICE_MODEL;
  const usable = Boolean(apiKey) && prefer !== "browser" && /^[\w.-]{1,80}$/.test(model);
  return {
    config: { gemini: usable, prefer },
    gemini: usable ? { apiKey, model } : null,
  };
}

/* ── Gemini transcription ─────────────────────────────────────────────── */

export class TranscriptionError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "TranscriptionError";
  }
}

/**
 * Automatic multilingual transcription: no language is chosen in advance.
 * Gemini detects the spoken language (or mix) itself and writes it the way
 * an Indian user would type it, which is what the chat pipeline reads best.
 */
export const TRANSCRIBE_PROMPT = [
  "Transcribe this short voice message to a chat assistant, exactly as spoken.",
  "Detect the spoken language automatically; do not assume English.",
  "The speaker may use English, Hindi, Hinglish (Hindi and English mixed in one sentence), Bhojpuri, or another Indian language such as Bengali, Marathi, Gujarati, Punjabi, Urdu, Tamil, Telugu, Kannada, Malayalam or Odia, and may switch language mid-sentence.",
  "Write English in Roman letters. Write Hindi or Bhojpuri in Devanagari when spoken purely that way; write Hinglish (Hindi mixed with English words) in Roman letters as people type it, e.g. 'bhai meri streak kitni hai'.",
  "Write any other Indian language in its own script.",
  "Keep app words like streak, quest, challenge, proof and reward as spoken; never translate.",
  "Return only the transcript text: no quotes, labels, language names, translation or commentary. If nothing is said, return an empty string.",
].join(" ");

/**
 * Sends one recording to Gemini's generateContent endpoint and returns the
 * transcript. The key goes in a header, never in the URL.
 */
export async function transcribeWithGemini(
  audio: { base64: string; mimeType: string; lang?: string },
  gemini: { apiKey: string; model: string },
  fetchImpl: typeof fetch = fetch,
  timeoutMs = TRANSCRIBE_TIMEOUT_MS
): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(`${GEMINI_BASE}/${encodeURIComponent(gemini.model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": gemini.apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: audio.lang
                  ? `${TRANSCRIBE_PROMPT} The person prefers ${audio.lang}, but transcribe whatever language is actually spoken.`
                  : TRANSCRIBE_PROMPT,
              },
              { inline_data: { mime_type: audio.mimeType.split(";")[0], data: audio.base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 256 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new TranscriptionError("speech service unreachable", 502);
  }
  if (!res.ok) throw new TranscriptionError(`speech service answered ${res.status}`, 502);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new TranscriptionError("unexpected speech service reply", 502);
  }
  const parts = (data as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] } | null)
    ?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map((p) => (typeof p?.text === "string" ? p.text : ""))
        .join(" ")
        .replace(/^["“]|["”]$/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  // Only the words that were spoken: never a label or JSON wrapper.
  return stripInternalMetadata(text).slice(0, 500);
}

/* ── HTTP handlers ───────────────────────────────────────────────────── */

export interface VoiceDeps {
  isEnabled: () => boolean;
  getSupabase: () => Promise<SupabaseClient>;
  getEnv?: () => VoiceEnv;
  fetch?: typeof fetch;
  limiter?: RateLimiter;
}

/** Voice transcriptions per user per minute (each one is a paid API call). */
export const voiceLimiter = createRateLimiter(10, 60_000);

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/** GET /api/strivy/voice: what this server offers. Booleans only, never a key. */
export async function handleVoiceConfigRequest(deps: VoiceDeps): Promise<Response> {
  try {
    const auth = await authorizeStrivyRequest(deps);
    if (!auth.ok) return auth.response;
    const { config } = (deps.getEnv ?? voiceEnv)();
    return Response.json({ gemini: config.gemini, prefer: config.prefer });
  } catch (err) {
    console.error("[strivy] voice config failed", err instanceof Error ? err.name : "error");
    return error(500, "Something went sideways. Try again in a moment.");
  }
}

function toBase64(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * POST /api/strivy/voice/transcribe: the raw recording as the body
 * (Content-Type audio/webm, audio/mp4…). No `lang` (or `lang=auto`) means
 * automatic detection; `?lang=en-IN|hi-IN` is only the person's optional
 * override, sent as a soft preference. Returns { text, lang }, where lang is
 * the reply style detected from the transcript (en, hinglish, hi, bho or
 * null) — the same detection the chat uses, so the reply follows it. The text is NOT answered here: the browser sends it to
 * /api/strivy/chat like a typed message, so voice and text share one path.
 */
export async function handleVoiceTranscribeRequest(
  request: Request,
  deps: VoiceDeps
): Promise<Response> {
  try {
    const auth = await authorizeStrivyRequest(deps);
    if (!auth.ok) return auth.response;

    const env = (deps.getEnv ?? voiceEnv)();
    if (!env.gemini) return error(503, "Server voice isn't set up. Use the browser's voice input.");

    if (!(deps.limiter ?? voiceLimiter).take(auth.userId)) {
      return error(429, "Easy there 😅 Give me a few seconds.");
    }

    const type = request.headers.get("content-type") ?? "";
    if (!AUDIO_TYPES.test(type)) return error(415, "Send the recording as audio.");
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_AUDIO_BYTES) return error(413, "That recording is too long.");
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) return error(400, "The recording was empty.");
    if (bytes.byteLength > MAX_AUDIO_BYTES) return error(413, "That recording is too long.");

    const langParam = new URL(request.url).searchParams.get("lang");
    const lang = langParam === "hi-IN" || langParam === "en-IN" ? langParam : undefined;

    try {
      const text = await transcribeWithGemini(
        { base64: toBase64(bytes), mimeType: type, lang },
        env.gemini,
        deps.fetch
      );
      return Response.json({ text, lang: detectMessageLanguage(text) });
    } catch (err) {
      // Status only: never the key, the audio or the provider's error body.
      console.warn(
        "[strivy] voice transcription failed",
        err instanceof TranscriptionError ? err.message : "error"
      );
      return error(502, "Couldn't reach the speech service. Try again, or type instead.");
    }
  } catch (err) {
    console.error("[strivy] voice failed", err instanceof Error ? err.name : "error");
    return error(500, "Something went sideways. Try again in a moment.");
  }
}
