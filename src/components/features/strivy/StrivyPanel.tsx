"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowUp, AudioLines, Bell, Mic, Moon, RotateCcw, SquarePen, Sun, X } from "lucide-react";
import { STARTER_PROMPTS } from "@/lib/strivy/config";
import {
  MAX_CHARS,
  REQUEST_TIMEOUT_MS,
  loadTheme,
  newId,
  responseToMessage,
  saveTheme,
  toHistory,
  type StrivyChatMessage,
  type StrivyTheme,
} from "./chat";
import { StrivyAvatar, StrivyMessage, UserMessage } from "./StrivyMessage";
import { StrivyPushPrompt, StrivyPushSettings } from "./StrivyPushSettings";
import {
  lastSeenAt,
  loadPushHistory,
  pushSupport,
  rememberChatLanguage,
  shouldOfferPush,
  unreadCount,
} from "./push";
import { detectMessageLanguage } from "@/lib/strivy/language";
import { isSeriousMessage } from "@/lib/strivy/companion/serious";
import { emitStrivyEvent, setCompanionBusy } from "./companion";
import { useStrivyVoice } from "./useStrivyVoice";
import { StrivyVoiceBar } from "./StrivyVoiceBar";

/**
 * StrivyPanel — the STRIVY chat surface.
 *
 * Phone: a bottom sheet covering most of the screen, over a dimmed backdrop.
 * Desktop (md+): a floating panel anchored bottom-right, no backdrop, so the
 * page stays usable beside it.
 *
 * The conversation lives in the launcher's state (passed in), so closing and
 * reopening the panel keeps it for the rest of the visit. Nothing is stored in
 * the database.
 *
 * Failed requests show an error bubble; a Retry button appears when retrying
 * could help (timeouts, network and server errors), not for sign-in problems.
 *
 * The ☀️/🌙 toggle themes this panel only (the rest of the app stays as it
 * is). It re-points the panel's colour tokens (see .strivy-panel in
 * globals.css) and is remembered on this device.
 */

/** After this long, "One sec 👀" becomes "Still on it…". */
const SLOW_LABEL_MS = 1200;

/**
 * Development only: logs how long a reply took to come back and to reach the
 * screen, in the browser console. Call the returned function once the reply
 * is set.
 */
function startReplyTiming(): () => void {
  if (process.env.NODE_ENV === "production") return () => undefined;
  const sentAt = performance.now();
  return () => {
    const received = performance.now();
    requestAnimationFrame(() =>
      console.debug(
        `[strivy] reply: api ${Math.round(received - sentAt)}ms, on screen ${Math.round(performance.now() - sentAt)}ms`
      )
    );
  };
}

export default function StrivyPanel({
  messages,
  setMessages,
  onClose,
  closing = false,
}: {
  messages: StrivyChatMessage[];
  setMessages: (update: (prev: StrivyChatMessage[]) => StrivyChatMessage[]) => void;
  onClose: () => void;
  /** True while the closing animation plays. */
  closing?: boolean;
}) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  // The panel is client-only (ssr: false), so storage can be read up front
  // and the saved theme shows from the first frame.
  const [theme, setTheme] = useState<StrivyTheme>(loadTheme);
  const [showPush, setShowPush] = useState(false);
  // Only offered when this browser can do push and the server has a VAPID key.
  const [canPush] = useState(() => pushSupport() === "supported");
  // The one-time "keep you accountable?" card (never before a first answer).
  const [offerPush, setOfferPush] = useState(false);
  // Unread STRIVY notifications since the bell was last opened on this device.
  const [unread, setUnread] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Escape closes; focus the input when the panel opens. On phones the sheet
  // covers the page, so Tab cycles inside it instead of wandering behind it.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || window.matchMedia("(min-width: 768px)").matches) return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled])"
        )
      );
      if (items.length === 0) return;
      const first = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending, slow]);

  useEffect(() => {
    if (!canPush || typeof Notification === "undefined" || Notification.permission !== "granted")
      return;
    let cancelled = false;
    void loadPushHistory().then((items) => {
      if (!cancelled && items) setUnread(unreadCount(items, lastSeenAt()));
    });
    return () => {
      cancelled = true;
    };
  }, [canPush]);

  const answered = messages.some((m) => m.role === "strivy");
  useEffect(() => {
    if (!canPush || !answered) return;
    let cancelled = false;
    void shouldOfferPush().then((yes) => !cancelled && setOfferPush(yes));
    return () => {
      cancelled = true;
    };
  }, [canPush, answered]);

  useEffect(() => {
    if (!sending) return;
    const timer = setTimeout(() => setSlow(true), SLOW_LABEL_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [sending]);

  /**
   * Sends a message. With `retryOf`, resends after a failed attempt: the error
   * bubble is replaced and the user's message isn't added again.
   */
  async function send(text: string, retryOf?: string): Promise<string | null> {
    const message = text.trim().slice(0, MAX_CHARS);
    if (!message || sending) return null;

    const base = retryOf ? messages.filter((m) => m.id !== retryOf) : messages;
    const history = toHistory(retryOf ? base.slice(0, -1) : base);
    setMessages(() => (retryOf ? base : [...base, { id: newId(), role: "user", text: message }]));
    setInput("");
    setSending(true);
    // Companion popups follow the person's language and go quiet after a
    // serious or low message (no jokes then).
    emitStrivyEvent({ type: "USER_LANGUAGE", lang: detectMessageLanguage(message) });
    if (isSeriousMessage(message)) emitStrivyEvent({ type: "SERIOUS_MESSAGE" });

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setMessages((prev) => [...prev, responseToMessage("offline", null, message)]);
      setSending(false);
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const timing = startReplyTiming();
    let next: StrivyChatMessage;
    try {
      const res = await fetch("/api/strivy/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as { reply?: unknown } | null;
      next = responseToMessage(res.status, data, message);
      // Lets "auto" push language follow the chat. Only after push is allowed.
      if (res.ok) void rememberChatLanguage(detectMessageLanguage(message)).catch(() => undefined);
    } catch {
      next = responseToMessage(controller.signal.aborted ? "timeout" : "network", null, message);
    } finally {
      clearTimeout(timer);
    }

    setMessages((prev) => [...prev, next]);
    setSending(false);
    timing();
    return next.role === "strivy" ? next.reply.text : null;
  }

  // Newest first: in "auto" voice mode the recogniser follows these.
  /** When dark mode was switched on in this panel, for the "lasted 12 seconds" line. */
  const darkSince = useRef<number | null>(null);
  // The mic never stays "busy" for popups after the panel closes.
  useEffect(() => () => setCompanionBusy("voice", false), []);
  const recentUserTexts = useMemo(
    () =>
      messages
        .flatMap((m) => (m.role === "user" ? [m.text] : []))
        .slice(-5)
        .reverse(),
    [messages]
  );
  const voice = useStrivyVoice({
    send,
    recentUserTexts,
    onBusyChange: (busy) => setCompanionBusy("voice", busy),
  });
  const voiceOn = voice.phase !== "off";
  const avatarState =
    voice.phase === "listening" || voice.phase === "starting"
      ? "listening"
      : voice.phase === "speaking"
        ? "speaking"
        : sending
          ? "thinking"
          : "idle";

  function toggleTheme() {
    const next: StrivyTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
    // A playful line, sometimes ("Dark modeeeee... haaaaan 😏"). The light
    // line says how long dark mode really lasted, when this panel saw it start.
    const now = Date.now();
    const darkForMs = next === "light" && darkSince.current ? now - darkSince.current : undefined;
    darkSince.current = next === "dark" ? now : null;
    emitStrivyEvent({ type: "THEME_CHANGED", variant: next, darkForMs });
  }

  function newChat() {
    if (sending) return;
    setMessages(() => []);
    setInput("");
    inputRef.current?.focus({ preventScroll: true });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  const last = messages[messages.length - 1];
  const suggestions = last?.role === "strivy" ? last.reply.suggestions : [];

  return (
    <>
      {/* Backdrop — phones only */}
      <button
        type="button"
        aria-label="Close Strivy"
        onClick={onClose}
        data-state={closing ? "closing" : "open"}
        className="strivy-backdrop fixed inset-0 z-[60] bg-black/40 md:hidden"
      />

      <section
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="strivy-title"
        data-theme={theme}
        data-state={closing ? "closing" : "open"}
        className={[
          "strivy-panel strivy-sheet fixed z-[61] flex flex-col overflow-hidden bg-surface-container-lowest text-on-surface",
          // Phone: bottom sheet
          "inset-x-0 bottom-0 h-[85dvh] rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.18)]",
          // Desktop: floating panel
          "md:inset-x-auto md:bottom-6 md:right-6 md:h-[min(640px,calc(100dvh-3rem))] md:w-[400px] md:rounded-2xl md:border md:border-outline-variant md:shadow-[0_12px_40px_rgba(0,0,0,0.16)]",
        ].join(" ")}
      >
        {/* Drag-handle affordance (phone) */}
        <div className="flex justify-center pt-2 md:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-outline-variant" />
        </div>

        {/* Header */}
        <header className="flex items-center gap-2.5 border-b border-outline-variant px-4 py-3">
          <StrivyAvatar size={32} state={avatarState} />
          <div className="flex min-w-0 flex-1 flex-col">
            <h2
              id="strivy-title"
              className="text-[15px] font-extrabold leading-5 tracking-wide text-on-surface"
            >
              STRIVY
            </h2>
            <p className="truncate text-[12px] leading-4 text-on-surface-variant" aria-live="off">
              {voiceOn ? "Listening mode 🎙️" : sending ? "typing…" : "Your accountability buddy"}
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={newChat}
              disabled={sending}
              aria-label="Start a new chat"
              title="New chat"
              className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
            >
              <SquarePen size={18} />
            </button>
          )}
          {canPush && (
            <button
              type="button"
              onClick={() => {
                setShowPush((v) => !v);
                setUnread(0);
              }}
              aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
              aria-expanded={showPush}
              title="Notifications"
              className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${showPush ? "bg-surface-container text-secondary" : "text-on-surface-variant"}`}
            >
              <Bell size={18} />
              {unread > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold leading-none text-on-error"
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={theme === "dark"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Strivy"
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            <X size={20} />
          </button>
        </header>

        {canPush && showPush && <StrivyPushSettings onNavigate={onClose} />}

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
          <div className="flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-start gap-3 pb-2 pt-4">
                <StrivyAvatar size={44} state="idle" />
                <div>
                  <p className="text-headline-md text-on-surface">Hey, I&apos;m Strivy 👋</p>
                  <p className="text-body-md text-on-surface-variant">
                    What are we getting done today? 👀
                  </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 pt-1">
                  {STARTER_PROMPTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-left text-[13px] font-medium leading-5 text-on-surface transition-colors hover:border-secondary hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {voice.available && (
                  <button
                    type="button"
                    onClick={voice.talk}
                    className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-3.5 py-2 text-[13px] font-semibold text-secondary transition-colors hover:border-secondary hover:bg-secondary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                  >
                    <AudioLines size={16} aria-hidden="true" />
                    Talk to Strivy
                  </button>
                )}
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <UserMessage key={m.id} id={m.id} text={m.text} />
              ) : m.role === "strivy" ? (
                <StrivyMessage key={m.id} id={m.id} reply={m.reply} onNavigate={onClose} />
              ) : (
                <div key={m.id} className="strivy-msg flex items-end gap-2">
                  <StrivyAvatar />
                  <div
                    role="alert"
                    className="flex max-w-[85%] flex-col items-start gap-2 rounded-2xl rounded-bl-md border border-error/30 bg-error-container/40 px-3.5 py-2.5"
                  >
                    <p className="text-body-md text-on-surface">{m.text}</p>
                    {m.retry && m.id === last?.id && (
                      <button
                        type="button"
                        onClick={() => void send(m.retry ?? "", m.id)}
                        disabled={sending}
                        className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1 text-[13px] font-semibold text-secondary transition-colors hover:bg-secondary/5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                      >
                        <RotateCcw size={14} aria-hidden="true" />
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              )
            )}

            {offerPush && !sending && <StrivyPushPrompt onDone={() => setOfferPush(false)} />}

            {sending && (
              <div className="strivy-msg flex items-end gap-2" role="status">
                <StrivyAvatar state="thinking" />
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-surface-container-low px-3.5 py-2.5">
                  <span className="flex gap-1" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="strivy-typing-dot h-1.5 w-1.5 rounded-full bg-secondary"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </span>
                  <span className="text-[13px] text-on-surface-variant">
                    {slow ? "Still on it… 👀" : "Strivy is typing"}
                  </span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* Suggested prompts */}
        {!sending && suggestions.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="shrink-0 rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-[13px] font-medium text-on-surface transition-colors hover:border-secondary hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {voice.error && !voiceOn && (
          <div
            role="alert"
            className="mx-3 mb-2 flex items-start gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-[13px] leading-5 text-on-surface"
          >
            <p className="flex-1">{voice.error}</p>
            <button
              type="button"
              onClick={voice.clearError}
              aria-label="Dismiss"
              className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Composer, or the voice bar while voice is on */}
        {voiceOn ? (
          <StrivyVoiceBar
            phase={voice.phase}
            conversation={voice.conversation}
            interim={voice.interim}
            hearing={voice.hearing}
            lang={voice.lang}
            onLang={voice.setLang}
            onFinish={voice.finish}
            onEnd={voice.end}
          />
        ) : (
          <form
            onSubmit={onSubmit}
            className="flex items-center gap-2 border-t border-outline-variant px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:pb-3"
          >
            <label htmlFor="strivy-input" className="sr-only">
              Message Strivy
            </label>
            <div className="relative flex min-w-0 flex-1 items-center">
              <input
                id="strivy-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={MAX_CHARS}
                placeholder="Message Strivy…"
                autoComplete="off"
                enterKeyHint="send"
                className={`h-11 min-w-0 flex-1 rounded-full border border-outline-variant bg-surface pl-4 text-[16px] text-on-surface placeholder:text-on-surface-variant/70 focus:border-secondary focus:outline-none md:text-[14px] ${voice.available ? "pr-12" : "pr-4"}`}
              />
              {voice.available && (
                <button
                  type="button"
                  onClick={voice.dictate}
                  disabled={sending}
                  aria-label="Speak a message"
                  title="Speak"
                  className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-secondary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                >
                  <Mic size={18} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-on-secondary transition-[opacity,transform] active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
            >
              <ArrowUp size={20} strokeWidth={2.5} />
            </button>
          </form>
        )}
      </section>
    </>
  );
}
