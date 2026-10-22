"use client";

/**
 * useStrivyVoice — the panel's voice controller.
 *
 * Two ways to use it:
 *  - Tap the mic: listen once, put the transcript through the normal chat
 *    (`send`), done. Replies are not read aloud.
 *  - "Talk to Strivy": a conversation. Listen → send → read the reply aloud
 *    → listen again, until the person taps End (or something fails).
 *
 * Listening ends by itself about 2 s after the person stops talking (or with
 * the Stop button), then the transcript is sent.
 *
 * Every transcript goes through the same `send` as typed text, so voice uses
 * the same grounded /api/strivy/chat pipeline. If voice can't work here
 * (no support, mic blocked), it says why and typing keeps working.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  VOICE_ERROR_TEXT,
  VoiceError,
  listenLang,
  pickSpeechToText,
  transcribeHint,
  voiceLangChoice,
  type VoiceLangChoice,
  type VoiceServerConfig,
} from "@/lib/strivy/voice/speech";
import {
  browserTextToSpeech,
  createSpeechToText,
  deviceVoiceSupport,
  loadVoiceConfig,
  loadVoiceLang,
  requestMic,
  saveVoiceLang,
  type ListenStatus,
  type Listening,
  type TextToSpeech,
} from "./voice";

export type VoicePhase = "off" | "starting" | "listening" | "thinking" | "speaking";

export function useStrivyVoice({
  send,
  recentUserTexts,
  onBusyChange,
}: {
  /** Sends a message through the normal chat; resolves with Strivy's reply text, if any. */
  send: (text: string) => Promise<string | null>;
  /**
   * The person's recent messages, newest first. In "auto" mode the browser
   * recogniser listens in the language these are in (see autoListenLang).
   */
  recentUserTexts: string[];
  /** Told when the mic opens and closes (companion popups stay away meanwhile). */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<VoicePhase>("off");
  const [conversation, setConversation] = useState(false);
  const [interim, setInterim] = useState("");
  /** What the mic is hearing right now: waiting, speaking, pausing, transcribing. */
  const [hearing, setHearing] = useState<ListenStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "auto" unless the person picked an override: no language to choose.
  const [lang, setLangState] = useState<VoiceLangChoice>(() => voiceLangChoice(loadVoiceLang()));
  // Show the mic only where some way of hearing could work.
  const [available] = useState(() => {
    const d = deviceVoiceSupport();
    return d.speechRecognition || d.mediaRecorder;
  });

  const listening = useRef<Listening | null>(null);
  const tts = useRef<TextToSpeech | null>(null);
  const server = useRef<VoiceServerConfig | null>(null);
  const active = useRef(false);
  const conversationRef = useRef(false);
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  // Read at the start of every listen, so a conversation adapts as it goes:
  // each transcript joins the history before the next turn listens.
  const recentRef = useRef(recentUserTexts);
  useEffect(() => {
    recentRef.current = recentUserTexts;
  }, [recentUserTexts]);
  const busyRef = useRef(onBusyChange);
  useEffect(() => {
    busyRef.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    busyRef.current?.(phase !== "off");
  }, [phase]);

  const stopAll = useCallback(() => {
    active.current = false;
    conversationRef.current = false;
    listening.current?.cancel();
    listening.current = null;
    tts.current?.cancel();
    setConversation(false);
    setInterim("");
    setHearing(null);
    setPhase("off");
  }, []);

  // Closing the panel ends voice: the mic is never left open.
  useEffect(() => stopAll, [stopAll]);

  const fail = useCallback(
    (err: unknown) => {
      const kind = err instanceof VoiceError ? err.kind : "failed";
      // Silence in conversation mode just ends it quietly.
      setError(kind === "no-speech" && conversationRef.current ? null : VOICE_ERROR_TEXT[kind]);
      stopAll();
    },
    [stopAll]
  );

  // The panel's send() closes over its current messages, so the loop below
  // always calls the latest one rather than the one from when voice started.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  /** Listen → send → (in conversation mode) speak, repeated until stopped. */
  const runVoice = useCallback(async (): Promise<void> => {
    server.current ??= await loadVoiceConfig();
    const stt = createSpeechToText(pickSpeechToText(deviceVoiceSupport(), server.current));
    if (!stt) throw new VoiceError("unsupported");

    while (active.current) {
      setPhase("listening");
      setInterim("");
      setHearing("waiting");
      const session = stt.listen({
        lang: listenLang(langRef.current, recentRef.current),
        hint: transcribeHint(langRef.current),
        onInterim: setInterim,
        onStatus: (status) => {
          setHearing(status);
          // The recording is done; the speech service is writing it down.
          if (status === "transcribing") setPhase("thinking");
        },
      });
      listening.current = session;
      const text = await session.result;
      listening.current = null;
      if (!active.current) return;

      setInterim("");
      setHearing(null);
      setPhase("thinking");
      const reply = await sendRef.current(text);
      if (!active.current) return;
      if (!conversationRef.current || !reply) break;

      tts.current ??= browserTextToSpeech();
      if (tts.current.available) {
        setPhase("speaking");
        await tts.current.speak(reply);
      }
    }
    if (active.current) stopAll();
  }, [stopAll]);

  const start = useCallback(
    async (asConversation: boolean) => {
      if (active.current) return;
      setError(null);
      active.current = true;
      conversationRef.current = asConversation;
      setConversation(asConversation);
      setPhase("starting");
      try {
        // Ask for the mic first, so a refusal gets a clear message.
        await requestMic();
        await runVoice();
      } catch (err) {
        fail(err);
      }
    },
    [runVoice, fail]
  );

  /** Stop listening now and send what was heard. */
  const finish = useCallback(() => listening.current?.stop(), []);

  const setLang = useCallback((next: VoiceLangChoice) => {
    setLangState(next);
    saveVoiceLang(next);
  }, []);

  return {
    available,
    phase,
    conversation,
    interim,
    hearing,
    error,
    lang,
    setLang,
    clearError: () => setError(null),
    /** Tap the mic: one message. */
    dictate: () => void start(false),
    /** 🎙 Talk to Strivy: keep talking until End. */
    talk: () => void start(true),
    finish,
    end: stopAll,
  };
}
