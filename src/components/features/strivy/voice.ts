/**
 * src/components/features/strivy/voice.ts
 *
 * STRIVY's voice providers in the browser, behind two small interfaces so the
 * panel doesn't care which one is in use:
 *
 *   SpeechToText
 *   ├── browser: the Web Speech API (SpeechRecognition), free, no key
 *   └── gemini:  MediaRecorder here, transcription on our server
 *                (/api/strivy/voice/transcribe; the Gemini key stays there)
 *   TextToSpeech
 *   └── browser: speechSynthesis
 *
 * Whatever is heard becomes an ordinary chat message and goes through the
 * same /api/strivy/chat pipeline as typing. No React here, so the logic can
 * be tested with fake browser objects.
 *
 * Both recognisers stop by themselves about 2 s after the person stops
 * talking (src/lib/strivy/voice/silence.ts); the Stop button still works.
 */
import {
  VoiceError,
  mediaErrorKind,
  recognitionErrorKind,
  speakLang,
  speakableText,
  type SpeechToTextName,
  type VoiceLang,
  type VoiceLangChoice,
  type VoiceServerConfig,
  DEFAULT_VOICE_CONFIG,
} from "@/lib/strivy/voice/speech";
import {
  LEVEL_POLL_MS,
  createEndOfSpeechTimer,
  createVoiceActivity,
  rmsLevel,
  type EndOfSpeechStep,
  type HearingState,
} from "@/lib/strivy/voice/silence";

/** What one listening session is doing, for the voice bar. */
export type ListenStatus = HearingState | "transcribing";

/** One listening session. `result` settles with the final transcript. */
export interface Listening {
  result: Promise<string>;
  /** Stop listening and use what was heard so far. */
  stop(): void;
  /** Stop and throw the audio away. */
  cancel(): void;
}

export interface ListenOptions {
  /** The browser recogniser's locale (always concrete; see autoListenLang). */
  lang: VoiceLang;
  /**
   * For server transcription: the person's override, or null for automatic
   * detection (the default), in which case no hint is sent at all.
   */
  hint?: VoiceLang | null;
  onInterim?: (text: string) => void;
  /** Waiting for speech, speaking, pausing (about to stop), transcribing. */
  onStatus?: (status: ListenStatus) => void;
}

export interface SpeechToText {
  readonly name: SpeechToTextName;
  listen(options: ListenOptions): Listening;
}

/** Timers, injectable so tests can run the silence logic on a fake clock. */
export interface VoiceClock {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

const realClock: VoiceClock = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};

export interface TextToSpeech {
  readonly available: boolean;
  /** Resolves when done speaking (or at once when nothing can be said). */
  speak(text: string): Promise<void>;
  cancel(): void;
}

/* ── Minimal typings for the browser APIs used ─────────────────────────── */

interface RecognitionResultList {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface RecognitionEvent {
  resultIndex: number;
  results: RecognitionResultList;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

/** The subset of `window` voice needs; tests pass a fake. */
export interface VoiceWindow {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
  MediaRecorder?: {
    new (stream: MediaStream, options?: { mimeType?: string }): MediaRecorderLike;
    isTypeSupported?(type: string): boolean;
  };
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
  AudioContext?: new () => AudioContextLike;
  webkitAudioContext?: new () => AudioContextLike;
  navigator: { mediaDevices?: { getUserMedia?(c: MediaStreamConstraints): Promise<MediaStream> } };
}

/** The parts of AudioContext the silence detector uses. */
export interface AudioContextLike {
  state: string;
  resume?(): Promise<void>;
  close(): Promise<void>;
  createMediaStreamSource(stream: MediaStream): {
    connect(node: unknown): void;
    disconnect(): void;
  };
  createAnalyser(): {
    fftSize: number;
    getFloatTimeDomainData(array: Float32Array): void;
  };
}

interface MediaRecorderLike {
  mimeType: string;
  state: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}

function voiceWindow(): VoiceWindow | null {
  return typeof window === "undefined" ? null : (window as unknown as VoiceWindow);
}

export function deviceVoiceSupport(w: VoiceWindow | null = voiceWindow()) {
  return {
    speechRecognition: Boolean(w && (w.SpeechRecognition || w.webkitSpeechRecognition)),
    mediaRecorder: Boolean(w?.MediaRecorder && w.navigator.mediaDevices?.getUserMedia),
    speechSynthesis: Boolean(w?.speechSynthesis && w.SpeechSynthesisUtterance),
  };
}

/**
 * Asks for the microphone once, up front, so a refusal is caught clearly
 * (rather than as a vague recogniser error). The stream is closed at once
 * unless `keep` is set.
 */
export async function requestMic(
  w: VoiceWindow | null = voiceWindow(),
  keep = false
): Promise<MediaStream | null> {
  const getUserMedia = w?.navigator.mediaDevices?.getUserMedia?.bind(w.navigator.mediaDevices);
  if (!getUserMedia) return null; // The recogniser will ask for itself.
  try {
    const stream = await getUserMedia({ audio: true });
    if (!keep) stream.getTracks().forEach((t) => t.stop());
    return stream;
  } catch (err) {
    throw new VoiceError(mediaErrorKind((err as { name?: string })?.name));
  }
}

/* ── Browser speech recognition ───────────────────────────────────────── */

export function browserSpeechToText(
  w: VoiceWindow | null = voiceWindow(),
  clock: VoiceClock = realClock
): SpeechToText | null {
  const Ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
  if (!Ctor) return null;
  return {
    name: "browser",
    listen({ lang, onInterim, onStatus }) {
      const rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = true;
      // Continuous, so the recogniser's own quick cut-off doesn't end a
      // sentence at a short pause; the 2 s silence timer below ends it.
      rec.continuous = true;
      rec.maxAlternatives = 1;
      let finalText = "";
      let interim = "";
      let failure: VoiceError | null = null;
      let cancelled = false;
      // Every recogniser result is speech, so no minimum length applies.
      const silence = watchEvents(clock, onStatus, () => rec.stop());
      const result = new Promise<string>((resolve, reject) => {
        rec.onresult = (e) => {
          interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalText += r[0].transcript;
            else interim += r[0].transcript;
          }
          onInterim?.((finalText + interim).trim());
          silence.heard();
        };
        rec.onerror = (e) => {
          failure = new VoiceError(recognitionErrorKind(e.error));
        };
        rec.onend = () => {
          silence.dispose();
          const text = (finalText || interim).trim();
          if (cancelled) reject(new VoiceError("no-speech"));
          else if (text) resolve(text);
          else reject(failure ?? new VoiceError("no-speech"));
        };
      });
      try {
        rec.start();
      } catch {
        silence.dispose();
        return {
          result: Promise.reject(new VoiceError("failed")),
          stop() {},
          cancel() {},
        };
      }
      return {
        result,
        stop: () => rec.stop(),
        cancel: () => {
          cancelled = true;
          rec.abort();
        },
      };
    },
  };
}

/* ── Server transcription (Gemini, key on the server) ─────────────────── */

/** The longest a single recording runs before it's sent. */
export const MAX_RECORDING_MS = 20_000;

function recorderType(w: VoiceWindow): string | undefined {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((t) => w.MediaRecorder?.isTypeSupported?.(t));
}

export function serverSpeechToText(
  w: VoiceWindow | null = voiceWindow(),
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  clock: VoiceClock = realClock
): SpeechToText | null {
  if (!w?.MediaRecorder || !w.navigator.mediaDevices?.getUserMedia) return null;
  const Recorder = w.MediaRecorder;
  return {
    name: "gemini",
    listen({ hint = null, onInterim, onStatus }) {
      let recorder: MediaRecorderLike | null = null;
      let stopWatching = () => {};
      let heardNothing = false;
      let stream: MediaStream | null = null;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let stopRequested = false;
      const closeMic = () => stream?.getTracks().forEach((t) => t.stop());

      const result = (async () => {
        stream = await requestMic(w, true);
        if (!stream) throw new VoiceError("unsupported");
        if (cancelled) {
          closeMic();
          throw new VoiceError("no-speech");
        }
        const mimeType = recorderType(w);
        const rec = new Recorder(stream, mimeType ? { mimeType } : undefined);
        recorder = rec;
        const chunks: Blob[] = [];
        const done = new Promise<Blob>((resolve) => {
          rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
          rec.onstop = () =>
            resolve(new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" }));
        });
        rec.start();
        onInterim?.("");
        timer = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORDING_MS);
        stopWatching = watchForSilence(
          stream,
          w,
          (reason) => {
            // Nothing was said: close the mic without sending empty audio.
            if (reason === "no-speech") heardNothing = true;
            if (rec.state === "recording") rec.stop();
          },
          onStatus,
          clock
        );
        if (stopRequested) rec.stop();
        const blob = await done;
        clearTimeout(timer);
        stopWatching();
        closeMic();
        if (cancelled || heardNothing || blob.size === 0) throw new VoiceError("no-speech");
        onStatus?.("transcribing");

        let res: Response;
        try {
          const query = hint ? `?lang=${hint}` : "";
          res = await fetchImpl(`/api/strivy/voice/transcribe${query}`, {
            method: "POST",
            headers: { "Content-Type": blob.type.split(";")[0] || "audio/webm" },
            body: blob,
          });
        } catch {
          throw new VoiceError("network");
        }
        if (!res.ok) throw new VoiceError(res.status === 503 ? "unsupported" : "network");
        const data = (await res.json().catch(() => null)) as { text?: unknown } | null;
        const text = typeof data?.text === "string" ? data.text.trim() : "";
        if (!text) throw new VoiceError("no-speech");
        return text;
      })();

      return {
        result,
        stop: () => {
          stopRequested = true;
          if (recorder?.state === "recording") recorder.stop();
        },
        cancel: () => {
          cancelled = true;
          clearTimeout(timer);
          stopWatching();
          if (recorder?.state === "recording") recorder.stop();
          else closeMic();
        },
      };
    },
  };
}

/* ── Silence detection ────────────────────────────────────────────────── */

/** Reports a hearing state only when it changes. */
function statusReporter(onStatus: ((s: ListenStatus) => void) | undefined) {
  let last: HearingState | null = null;
  return (step: EndOfSpeechStep) => {
    if (step.state !== last) {
      last = step.state;
      onStatus?.(step.state);
    }
  };
}

/**
 * Silence detection driven by recogniser events (Web Speech API): each
 * result means speech; between results the clock runs. Calls `stop` once,
 * after about 2 s without a new result (or 8 s with none at all).
 */
function watchEvents(
  clock: VoiceClock,
  onStatus: ((s: ListenStatus) => void) | undefined,
  stop: () => void
) {
  const timer = createEndOfSpeechTimer({ minSpeechMs: 0 });
  const report = statusReporter(onStatus);
  let stopped = false;
  const step = (voiced: boolean) => {
    if (stopped) return;
    const s = timer.observe(voiced, clock.now());
    report(s);
    if (s.stop) {
      dispose();
      stop();
    }
  };
  const id = clock.setInterval(() => step(false), LEVEL_POLL_MS * 2);
  function dispose() {
    stopped = true;
    clock.clearInterval(id);
  }
  step(false);
  return { heard: () => step(true), dispose };
}

/**
 * Watches the microphone's loudness and calls `onStop` once the person has
 * spoken and then been quiet for about 2 s ("silence"), or has said nothing
 * for 8 s ("no-speech"). Returns a cleanup that stops the timer and closes
 * the AudioContext; it is safe to call more than once.
 *
 * Where AudioContext is missing, or the browser keeps it suspended, there is
 * no automatic stop: the Stop button and the 20 s cap still end the
 * recording, and nothing is cut off by mistake.
 */
export function watchForSilence(
  stream: MediaStream,
  w: VoiceWindow,
  onStop: (reason: "silence" | "no-speech") => void,
  onStatus?: (s: ListenStatus) => void,
  clock: VoiceClock = realClock
): () => void {
  const Ctx = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctx) return () => undefined;
  let ctx: AudioContextLike;
  let source: ReturnType<AudioContextLike["createMediaStreamSource"]>;
  let analyser: ReturnType<AudioContextLike["createAnalyser"]>;
  try {
    ctx = new Ctx();
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
  } catch {
    return () => undefined;
  }
  void ctx.resume?.().catch(() => undefined);

  const samples = new Float32Array(analyser.fftSize);
  const activity = createVoiceActivity();
  const timer = createEndOfSpeechTimer();
  const report = statusReporter(onStatus);
  let disposed = false;

  const id = clock.setInterval(() => {
    // A suspended context hears nothing; judging silence from it would cut
    // the person off, so wait for it to run.
    if (disposed || ctx.state !== "running") return;
    analyser.getFloatTimeDomainData(samples);
    const voiced = activity.level(rmsLevel(samples));
    const step = timer.observe(voiced, clock.now());
    report(step);
    // "No speech" only counts when the analyser is really getting audio.
    if (step.stop === "silence" || (step.stop === "no-speech" && activity.sawSignal)) {
      dispose();
      onStop(step.stop);
    }
  }, LEVEL_POLL_MS);

  function dispose() {
    if (disposed) return;
    disposed = true;
    clock.clearInterval(id);
    try {
      source.disconnect();
    } catch {
      // Already disconnected.
    }
    void ctx.close().catch(() => undefined);
  }
  return dispose;
}

/** The recogniser for this device and server, or null when voice can't work. */
export function createSpeechToText(
  name: SpeechToTextName | null,
  w: VoiceWindow | null = voiceWindow()
): SpeechToText | null {
  if (name === "browser") return browserSpeechToText(w);
  if (name === "gemini") return serverSpeechToText(w);
  return null;
}

/* ── Speaking replies ─────────────────────────────────────────────────── */

/**
 * Reads a reply aloud with the browser's own voices: short (see
 * speakableText), in an Indian English or Hindi voice when the device has
 * one. When speech isn't available it quietly does nothing: the reply is on
 * screen either way.
 */
export function browserTextToSpeech(w: VoiceWindow | null = voiceWindow()): TextToSpeech {
  const synth = w?.speechSynthesis;
  const Utterance = w?.SpeechSynthesisUtterance;
  if (!synth || !Utterance) {
    return { available: false, speak: async () => undefined, cancel: () => undefined };
  }
  return {
    available: true,
    speak(text) {
      const spoken = speakableText(text);
      if (!spoken) return Promise.resolve();
      const lang = speakLang(spoken);
      return new Promise<void>((resolve) => {
        synth.cancel();
        const u = new Utterance(spoken);
        u.lang = lang;
        const voices = synth.getVoices?.() ?? [];
        const voice =
          voices.find((v) => v.lang === lang) ??
          voices.find((v) => v.lang?.startsWith(lang.slice(0, 2)));
        if (voice) u.voice = voice;
        u.rate = 1.05;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        synth.speak(u);
      });
    },
    cancel: () => synth.cancel(),
  };
}

/* ── Server voice options ─────────────────────────────────────────────── */

/** Fetches what the server offers. Anything unexpected means browser-only. */
export async function loadVoiceConfig(
  fetchImpl: typeof fetch = (...args) => fetch(...args)
): Promise<VoiceServerConfig> {
  try {
    const res = await fetchImpl("/api/strivy/voice", { cache: "no-store" });
    if (!res.ok) return DEFAULT_VOICE_CONFIG;
    const data = (await res.json()) as Partial<VoiceServerConfig> | null;
    const prefer = data?.prefer === "browser" || data?.prefer === "gemini" ? data.prefer : "auto";
    return { gemini: data?.gemini === true, prefer };
  } catch {
    return DEFAULT_VOICE_CONFIG;
  }
}

/**
 * v2: "auto" is the new default. Choices saved under v1 (when the person had
 * to pick EN or हिं) are ignored, so everyone starts on automatic detection.
 */
const LANG_KEY = "strivy:voice-lang:v2";

export function loadVoiceLang(): string | null {
  try {
    return window.localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

export function saveVoiceLang(lang: VoiceLangChoice): void {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Not critical: the choice lasts until the panel closes.
  }
}

/* ── Status text for the voice bar ────────────────────────────────────── */

/** Mirrors useStrivyVoice's VoicePhase (kept here so tests can import it without React). */
type VoicePhase = "off" | "starting" | "listening" | "thinking" | "speaking";

const STATUS: Record<Exclude<VoicePhase, "off">, string> = {
  starting: "Getting the mic ready…",
  listening: "Listening…",
  thinking: "On it…",
  speaking: "Strivy is talking…",
};

/** Finer listening states (see src/lib/strivy/voice/silence.ts). */
const HEARING: Record<ListenStatus, string> = {
  waiting: "Listening… go ahead",
  speaking: "Listening…",
  pausing: "Still listening… sends after a short pause",
  transcribing: "Got it, writing that down…",
};

/** The status line for a phase and what the mic is hearing. */
export function voiceStatusText(phase: VoicePhase, hearing: ListenStatus | null): string {
  if (phase === "off") return "";
  if (hearing === "transcribing") return HEARING.transcribing;
  if (phase === "listening" && hearing) return HEARING[hearing];
  return STATUS[phase];
}
