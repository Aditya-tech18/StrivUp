"use client";

import { Square, X } from "lucide-react";
import { VOICE_LANGS, VOICE_LANG_LABEL, type VoiceLangChoice } from "@/lib/strivy/voice/speech";
import type { VoicePhase } from "./useStrivyVoice";
import { voiceStatusText, type ListenStatus } from "./voice";

/**
 * StrivyVoiceBar — takes the composer's place while voice is on.
 *
 * Shows what's happening (listening, thinking, speaking), the words heard so
 * far, the listening language (Auto by default: no choice needed; EN and
 * हिं stay as an optional override), a Stop button that
 * sends what was heard, and End, which turns voice off. Listening also stops
 * by itself after a short silence; while that silence is being timed the bar
 * says it is still listening, so a pause doesn't feel like a cut-off. The
 * wave bars only move while listening or speaking and stand still under
 * reduced motion.
 */

export function StrivyVoiceBar({
  phase,
  conversation,
  interim,
  hearing = null,
  lang,
  onLang,
  onFinish,
  onEnd,
}: {
  phase: VoicePhase;
  conversation: boolean;
  interim: string;
  hearing?: ListenStatus | null;
  lang: VoiceLangChoice;
  onLang: (lang: VoiceLangChoice) => void;
  onFinish: () => void;
  onEnd: () => void;
}) {
  const live = (phase === "listening" && hearing !== "pausing") || phase === "speaking";
  const status = voiceStatusText(phase, hearing);
  // While the silence timer runs, the words heard get a "still listening" note.
  const pausing = phase === "listening" && hearing === "pausing";
  return (
    <div
      className="flex flex-col gap-2 border-t border-outline-variant px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:pb-3"
      role="group"
      aria-label={conversation ? "Talking to Strivy" : "Voice message"}
    >
      <div className="flex items-center gap-3">
        <div
          className="strivy-wave flex h-11 flex-1 items-center gap-3 rounded-full border border-secondary/40 bg-secondary/5 px-4"
          data-live={live}
        >
          <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="strivy-wave-bar w-[3px] rounded-full bg-secondary"
                style={{ animationDelay: `${i * 110}ms` }}
              />
            ))}
          </span>
          <p className="min-w-0 flex-1 truncate text-[14px] text-on-surface" aria-live="polite">
            {interim ? (
              <>
                {interim}
                {pausing && <span className="text-on-surface-variant"> · still listening…</span>}
              </>
            ) : (
              <span className="text-on-surface-variant">{status}</span>
            )}
          </p>
        </div>
        {phase === "listening" && (
          <button
            type="button"
            onClick={onFinish}
            aria-label="Stop and send"
            title="Stop and send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-on-secondary transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
          >
            <Square size={16} fill="currentColor" />
          </button>
        )}
        <button
          type="button"
          onClick={onEnd}
          aria-label={conversation ? "End voice chat" : "Cancel voice"}
          title={conversation ? "End" : "Cancel"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex items-center justify-between px-1 text-[12px] text-on-surface-variant">
        <span>{conversation ? "Talk to Strivy · replies are read aloud" : "Voice message"}</span>
        <span className="flex items-center gap-1" role="radiogroup" aria-label="Listening language">
          {VOICE_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              aria-label={
                l === "auto" ? "Detect language automatically" : l === "hi-IN" ? "Hindi" : "English"
              }
              title={
                l === "auto"
                  ? "Understands English, Hindi, Hinglish and Bhojpuri automatically"
                  : undefined
              }
              disabled={phase === "listening"}
              onClick={() => onLang(l)}
              className={`rounded-full px-2 py-0.5 font-semibold transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
                lang === l ? "bg-secondary text-on-secondary" : "hover:bg-surface-container"
              }`}
            >
              {VOICE_LANG_LABEL[l]}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
