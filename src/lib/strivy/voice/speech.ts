/**
 * src/lib/strivy/voice/speech.ts
 *
 * Pure helpers for STRIVY's voice mode, shared by the browser and the tests.
 * Voice is only a different way in and out of the same chat: what the person
 * says becomes an ordinary chat message, and the grounded reply that comes
 * back is what gets read aloud. There is no separate voice "brain".
 */

import { detectMessageLanguage } from "../language";

/**
 * Recogniser locales. "hi-IN" is Google's code-mixed Indian model: it hears
 * Hindi, Hinglish ("bhai meri streak kitni hai") and most Bhojpuri, and keeps
 * common English words. "en-IN" is better for all-English speech.
 */
export type VoiceLang = "en-IN" | "hi-IN";

/**
 * What the person picked. "auto" is the default and needs no choice at all:
 * Gemini detects the language itself, and the browser recogniser is pointed
 * at the language the person has actually been using (see autoListenLang).
 * The two fixed locales stay as an optional override.
 */
export type VoiceLangChoice = "auto" | VoiceLang;

export const VOICE_LANGS: readonly VoiceLangChoice[] = ["auto", "en-IN", "hi-IN"];

/** Short labels for the optional override while listening. */
export const VOICE_LANG_LABEL: Record<VoiceLangChoice, string> = {
  auto: "Auto",
  "en-IN": "EN",
  "hi-IN": "हिं",
};

/** A saved choice, or "auto" for anything else (including nothing saved). */
export function voiceLangChoice(saved: string | null | undefined): VoiceLangChoice {
  return saved === "en-IN" || saved === "hi-IN" ? saved : "auto";
}

/**
 * The recogniser locale for "auto", from the person's own recent messages
 * (newest first, typed or spoken). The first message with a clear language
 * decides: English → en-IN; Hinglish, Hindi or Bhojpuri → hi-IN. With no
 * signal yet, hi-IN, because it also copes with English while en-IN turns
 * Hindi into nonsense.
 */
export function autoListenLang(recentUserTexts: readonly (string | null | undefined)[]): VoiceLang {
  for (const text of recentUserTexts) {
    if (!text) continue;
    const lang = detectMessageLanguage(text);
    if (lang === "en") return "en-IN";
    if (lang) return "hi-IN";
  }
  return "hi-IN";
}

/**
 * The locale to listen in: the person's override when they set one, else
 * the automatic pick from what they've been saying.
 */
export function listenLang(
  saved: string | null,
  recent: string | readonly (string | null | undefined)[] | null
): VoiceLang {
  const choice = voiceLangChoice(saved);
  if (choice !== "auto") return choice;
  return autoListenLang(typeof recent === "string" ? [recent] : (recent ?? []));
}

/**
 * The hint sent with a recording for server transcription: none in auto
 * mode, so Gemini detects the language (and handles mixed speech) itself.
 */
export function transcribeHint(choice: VoiceLangChoice): VoiceLang | null {
  return choice === "auto" ? null : choice;
}

const DEVANAGARI = /[ऀ-ॿ]/;

/** The voice to read a reply in, from the reply's own script. */
export function speakLang(text: string): VoiceLang {
  return DEVANAGARI.test(text) ? "hi-IN" : "en-IN";
}

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu;

/** The most a spoken reply says. Voice replies stay short. */
export const MAX_SPOKEN_SENTENCES = 2;
export const MAX_SPOKEN_CHARS = 240;

/**
 * A reply as it should sound: no emoji, links, markdown or symbols, "0/3"
 * read as "0 of 3" (or "3 में से 0" in Hindi), and at most two sentences, so
 * a long answer is never read out as a dump. The chat still shows it all.
 */
export function speakableText(text: string): string {
  const hindi = DEVANAGARI.test(text);
  let t = text
    .replace(/https?:\/\/\S+/g, "")
    // An emoji often ends a thought ("done 👀 Ek task…"): keep the pause.
    .replace(
      /([^\s.!?।,])\s*(?:[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]+\s*)+(?=\p{L})/gu,
      (_m, prev: string) => `${prev}${hindi ? "।" : "."} `
    )
    .replace(EMOJI, "")
    .replace(/[*_`#>~|]/g, "")
    .replace(/(\d+)\s*\/\s*(\d+)/g, (_m, a: string, b: string) =>
      hindi ? `${b} में से ${a}` : `${a} of ${b}`
    )
    .replace(/[•·]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = t.split(/(?<=[.!?।])\s+/).filter((s) => /[\p{L}\p{N}]/u.test(s));
  t = sentences.slice(0, MAX_SPOKEN_SENTENCES).join(" ");
  if (t.length > MAX_SPOKEN_CHARS) {
    const cut = t.slice(0, MAX_SPOKEN_CHARS);
    t = cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim();
  }
  return t;
}

/* ── Choosing a speech-to-text provider ───────────────────────────────── */

export type SpeechToTextName = "browser" | "gemini";

/** What the server allows. Never a key: only whether Gemini is set up. */
export interface VoiceServerConfig {
  /** Server-side Gemini transcription is configured and allowed. */
  gemini: boolean;
  /** "auto" (Gemini when set up, else the browser), "browser" or "gemini". */
  prefer: "auto" | "browser" | "gemini";
}

export const DEFAULT_VOICE_CONFIG: VoiceServerConfig = { gemini: false, prefer: "auto" };

/**
 * Which recogniser to use on this device, or null when voice input can't work
 * here (the mic button then explains that typing still works).
 *
 *  - browser: the Web Speech API. Free, no key; Chrome, Edge and Safari.
 *             Listens in one locale at a time (see autoListenLang).
 *  - gemini:  record with MediaRecorder and transcribe on the server with the
 *             Gemini API. Only when the server has GEMINI_API_KEY. It detects
 *             the spoken language by itself, including mixed Hindi-English,
 *             so "auto" prefers it whenever it is set up.
 */
export function pickSpeechToText(
  device: { speechRecognition: boolean; mediaRecorder: boolean },
  server: VoiceServerConfig
): SpeechToTextName | null {
  const browser = device.speechRecognition;
  const gemini = server.gemini && device.mediaRecorder;
  if (server.prefer === "gemini") return gemini ? "gemini" : browser ? "browser" : null;
  if (server.prefer === "browser") return browser ? "browser" : null;
  // auto: true multilingual detection first, the browser as the free fallback.
  return gemini ? "gemini" : browser ? "browser" : null;
}

/* ── Errors ───────────────────────────────────────────────────────────── */

export type VoiceErrorKind =
  | "denied" // mic permission refused
  | "no-mic" // no microphone found
  | "unsupported" // no way to recognise speech here
  | "no-speech" // heard nothing
  | "network" // the recogniser or server couldn't be reached
  | "failed"; // anything else

export class VoiceError extends Error {
  readonly kind: VoiceErrorKind;
  constructor(kind: VoiceErrorKind) {
    super(kind);
    this.kind = kind;
    this.name = "VoiceError";
  }
}

/** Web Speech API error codes, mapped to what the panel can explain. */
export function recognitionErrorKind(code: string | undefined): VoiceErrorKind {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "denied";
    case "audio-capture":
      return "no-mic";
    case "no-speech":
    case "aborted":
      return "no-speech";
    case "network":
      return "network";
    case "language-not-supported":
      return "unsupported";
    default:
      return "failed";
  }
}

/** getUserMedia errors, mapped the same way. */
export function mediaErrorKind(name: string | undefined): VoiceErrorKind {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
    case "NotReadableError":
      return "no-mic";
    default:
      return "failed";
  }
}

/** What the panel says for each problem. Typing always keeps working. */
export const VOICE_ERROR_TEXT: Record<VoiceErrorKind, string> = {
  denied:
    "Mic access is blocked, so I can't hear you. Allow the mic in your browser settings, or just type 👇",
  "no-mic": "I can't find a microphone on this device. Typing works fine 👇",
  unsupported: "Voice isn't supported in this browser. Try Chrome, Edge or Safari, or just type 👇",
  "no-speech": "Didn't catch anything 👂 Tap the mic and try again.",
  network: "Couldn't reach the speech service. Check your connection, or type instead.",
  failed: "Voice hit a snag 😅 Try again, or type instead.",
};
