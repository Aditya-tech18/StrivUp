/**
 * src/lib/strivy/voice/silence.ts
 *
 * End-of-speech detection for voice input: the recording stops by itself
 * once the person has spoken and then stayed quiet for about 2 seconds.
 *
 * It is not a fixed recording length. The rules:
 *  - Nothing stops before speech has been heard (the person may take a
 *    moment to start), except a long stretch with no speech at all, which
 *    ends the turn as "didn't catch anything" instead of keeping the mic open.
 *  - After speech, quiet starts a 2 s silence timer. Any speech before it runs
 *    out cancels it, so a normal pause mid-sentence ("Bhai meri… quest kya
 *    hai?") doesn't cut the person off.
 *  - When the timer runs out, the recording stops and what was heard is sent.
 *
 * Pure logic with the time passed in, so it is tested without a browser. The
 * browser wiring (microphone level from an AnalyserNode, or speech-recogniser
 * events) is in src/components/features/strivy/voice.ts.
 */

/** Quiet after speech that ends the recording. */
export const SILENCE_STOP_MS = 2000;
/** With no speech at all, the mic closes after this long. */
export const NO_SPEECH_STOP_MS = 8000;
/** Loudness must last this long to count as speech, so a click or a tap on the desk doesn't. */
export const MIN_SPEECH_MS = 120;
/** How often the microphone level is sampled. */
export const LEVEL_POLL_MS = 50;

/**
 * What the recorder is hearing, for the voice bar:
 *  waiting  listening, no speech yet
 *  speaking speech is coming in
 *  pausing  quiet after speech: the 2 s silence timer is running
 */
export type HearingState = "waiting" | "speaking" | "pausing";

export interface EndOfSpeechStep {
  state: HearingState;
  /** Why to stop now, or null to keep listening. */
  stop: "silence" | "no-speech" | null;
  /** While pausing, how long until the recording stops. */
  stopsInMs: number | null;
}

export interface EndOfSpeechOptions {
  silenceMs?: number;
  noSpeechMs?: number;
  /** 0 when every "voiced" observation is already speech (recogniser results). */
  minSpeechMs?: number;
}

/**
 * Feed it observations ("voiced or not, at this time") and it says what the
 * person is doing and when to stop.
 */
export function createEndOfSpeechTimer(options: EndOfSpeechOptions = {}) {
  const silenceMs = options.silenceMs ?? SILENCE_STOP_MS;
  const noSpeechMs = options.noSpeechMs ?? NO_SPEECH_STOP_MS;
  const minSpeechMs = options.minSpeechMs ?? MIN_SPEECH_MS;

  let startedAt: number | null = null;
  let voicedSince: number | null = null;
  let heardSpeech = false;
  let quietSince: number | null = null;

  return {
    observe(voiced: boolean, now: number): EndOfSpeechStep {
      startedAt ??= now;
      if (voiced) {
        voicedSince ??= now;
        if (now - voicedSince >= minSpeechMs) {
          heardSpeech = true;
          // Speech resumed: the silence timer is cancelled.
          quietSince = null;
        }
      } else {
        voicedSince = null;
        if (heardSpeech) quietSince ??= now;
      }

      if (!heardSpeech) {
        return {
          state: "waiting",
          stop: now - startedAt >= noSpeechMs ? "no-speech" : null,
          stopsInMs: null,
        };
      }
      if (quietSince === null) return { state: "speaking", stop: null, stopsInMs: null };
      const left = silenceMs - (now - quietSince);
      return { state: "pausing", stop: left <= 0 ? "silence" : null, stopsInMs: Math.max(0, left) };
    },
  };
}

/** Below this RMS level (on a -1…1 signal) nothing counts as speech, however quiet the room. */
export const MIN_SPEECH_LEVEL = 0.012;
/** Speech must be this many times louder than the room's background. */
const SPEECH_OVER_FLOOR = 2.5;
/** Once speaking, the level may dip to this share of the threshold before it counts as quiet. */
const RELEASE = 0.6;

/**
 * Turns microphone loudness into voiced / not voiced. The threshold follows
 * the room: the background level ("floor") drops at once to any quieter
 * reading and creeps up slowly, so a fan or traffic raises it while a
 * person talking doesn't. Hysteresis keeps a word's softer ending from
 * flickering to "quiet".
 */
export function createVoiceActivity(minLevel = MIN_SPEECH_LEVEL) {
  let floor: number | null = null;
  let voiced = false;
  let sawSignal = false;
  return {
    /** RMS level of the latest audio frame, 0 to 1. */
    level(rms: number): boolean {
      if (rms > 0) sawSignal = true;
      if (floor === null || rms < floor) floor = rms;
      else floor += (rms - floor) * 0.01;
      const threshold = Math.max(minLevel, floor * SPEECH_OVER_FLOOR);
      voiced = voiced ? rms >= threshold * RELEASE : rms >= threshold;
      return voiced;
    },
    /** false while every frame was exactly 0, i.e. the analyser isn't getting audio. */
    get sawSignal() {
      return sawSignal;
    },
  };
}

/** Root-mean-square loudness of one frame of samples. */
export function rmsLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}
