"use client";

/**
 * useStrivyCompanion — turns app activity into STRIVY companion popups.
 *
 * Mounted once, by StrivyLauncher. It is the only place with timers for
 * popups; screens just emit events (emitStrivyEvent in companion.ts). What
 * it listens to:
 *
 *   APP_OPENED / ACTIVE_BROWSING  ~30 s of real activity on a visible tab
 *   IDLE                          90 s with no input after some activity
 *   RETURNED_TO_APP               the tab comes back after a minute or more
 *   CHALLENGE_OPENED, QUEST_OPENED, SCREEN_OPENED   route changes
 *   STRIVY_OPENED                 the chat panel opens
 *   everything else               emitted by screens (theme, completions…)
 *
 * Whether anything shows is decided by decideCompanion (cooldowns, caps,
 * dedupe, dismissals, typing / voice / form blockers). A moment that was
 * blocked only for now (typing, a form, voice) is retried once things calm
 * down; a moment refused by the rules is not.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  decideCompanion,
  recordDismiss,
  recordSerious,
  type CompanionEvent,
  type ShownLine,
} from "@/lib/strivy/companion/engine";
import { loadCompanionState, onStrivyEvent, readBlockers, saveCompanionState } from "./companion";

/** Active time before the "I'm here btw" moment. */
export const ACTIVE_AFTER_MS = 30_000;
/** No input for this long (after some activity) is the idle moment. */
export const IDLE_AFTER_MS = 90_000;
/** Away at least this long counts as returning. */
export const RETURN_AFTER_MS = 60_000;
/** A popup hides by itself after this long (not counted as a dismissal). */
export const AUTO_HIDE_MS = 8000;
const TICK_MS = 5000;
/** Interaction this recent counts the last tick as active. */
const ACTIVE_WINDOW_MS = 15_000;
/** Let a screen settle before reacting to it. */
const ROUTE_DELAY_MS = 2500;
const EVENT_DELAY_MS = 700;

/** Refusals that only mean "not right now": the moment is tried again later. */
const TRANSIENT = new Set([
  "typing",
  "in a form",
  "voice in use",
  "tab hidden",
  "one already showing",
]);

function routeEvent(pathname: string): CompanionEvent | null {
  if (/^\/challenges\/(?!new(\/|$))[^/]+\/?$/.test(pathname)) return { type: "CHALLENGE_OPENED" };
  if (/^\/quests\/(?!new(\/|$))[^/]+\/?$/.test(pathname)) return { type: "QUEST_OPENED" };
  if (pathname === "/explore") return { type: "SCREEN_OPENED", variant: "explore" };
  if (pathname === "/profile") return { type: "SCREEN_OPENED", variant: "profile" };
  return null;
}

export function useStrivyCompanion({
  pathname,
  panelOpen,
}: {
  pathname: string;
  panelOpen: boolean;
}) {
  const [line, setLine] = useState<ShownLine | null>(null);
  const lineRef = useRef<ShownLine | null>(null);
  const pathRef = useRef(pathname);
  const panelRef = useRef(panelOpen);
  const langRef = useRef<string | null>(null);
  const lastKeyAt = useRef(0);
  const lastInputAt = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Moments waiting for a calmer moment (typing, a form, voice). */
  const pending = useRef<CompanionEvent[]>([]);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    panelRef.current = panelOpen;
  }, [panelOpen]);

  const hide = useCallback(() => {
    clearTimeout(hideTimer.current);
    lineRef.current = null;
    setLine(null);
  }, []);

  /** Returns true when the moment is finished with (shown or refused for good). */
  const fire = useCallback(
    (event: CompanionEvent): boolean => {
      const now = Date.now();
      const state = loadCompanionState();
      const decision = decideCompanion({
        event,
        now,
        persisted: state.persisted,
        session: state.session,
        blockers: readBlockers({
          activeElement: document.activeElement,
          hidden: document.hidden,
          pathname: pathRef.current,
          lastKeyAt: lastKeyAt.current,
          now,
        }),
        panelOpen: panelRef.current,
        visible: lineRef.current !== null,
        lang: langRef.current === "en" ? "en" : "hinglish",
      });
      if (!decision.show) return !TRANSIENT.has(decision.reason);
      saveCompanionState({ persisted: decision.persisted, session: decision.session });
      lineRef.current = decision.line;
      setLine(decision.line);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, AUTO_HIDE_MS);
      return true;
    },
    [hide]
  );

  const tryOrQueue = useCallback(
    (event: CompanionEvent) => {
      if (!fire(event)) pending.current = [event];
    },
    [fire]
  );

  // Events from screens and the chat panel.
  useEffect(
    () =>
      onStrivyEvent((message) => {
        if (message.type === "SERIOUS_MESSAGE") {
          const state = loadCompanionState();
          saveCompanionState({ persisted: recordSerious(state.persisted, Date.now()) });
          pending.current = [];
          hide();
          return;
        }
        if (message.type === "USER_LANGUAGE") {
          langRef.current = message.lang;
          return;
        }
        const event = message;
        setTimeout(() => tryOrQueue(event), EVENT_DELAY_MS);
      }),
    [tryOrQueue, hide]
  );

  // Screens: a short while after landing on one.
  useEffect(() => {
    const event = routeEvent(pathname);
    if (!event) return;
    const t = setTimeout(() => tryOrQueue(event), ROUTE_DELAY_MS);
    return () => clearTimeout(t);
  }, [pathname, tryOrQueue]);

  // Opening the chat.
  const wasOpen = useRef(panelOpen);
  useEffect(() => {
    if (panelOpen && !wasOpen.current) {
      const t = setTimeout(() => tryOrQueue({ type: "STRIVY_OPENED" }), 600);
      wasOpen.current = panelOpen;
      return () => clearTimeout(t);
    }
    if (!panelOpen && wasOpen.current) {
      // Popups that belonged to the panel go with it.
      if (lineRef.current && ["STRIVY_OPENED", "THEME_CHANGED"].includes(lineRef.current.event))
        hide();
    }
    wasOpen.current = panelOpen;
  }, [panelOpen, tryOrQueue, hide]);

  // Activity, idleness, coming back.
  useEffect(() => {
    let activeMs = 0;
    let activeDone = false;
    let idleDone = false;
    let hiddenAt = 0;

    const onInput = () => {
      lastInputAt.current = Date.now();
    };
    const onKey = () => {
      lastKeyAt.current = Date.now();
      lastInputAt.current = lastKeyAt.current;
    };
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= RETURN_AFTER_MS) {
        lastInputAt.current = Date.now();
        tryOrQueue({ type: "RETURNED_TO_APP" });
      }
      hiddenAt = 0;
    };

    const tick = setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      // A moment that was waiting for typing / voice / a form to finish.
      if (pending.current.length > 0) {
        const [event] = pending.current;
        if (fire(event)) pending.current = [];
        return;
      }
      if (lastInputAt.current && now - lastInputAt.current < ACTIVE_WINDOW_MS) activeMs += TICK_MS;
      if (!activeDone && activeMs >= ACTIVE_AFTER_MS) {
        activeDone = fire({ type: "ACTIVE_BROWSING" });
      }
      if (!idleDone && lastInputAt.current && now - lastInputAt.current >= IDLE_AFTER_MS) {
        idleDone = fire({ type: "IDLE" });
      }
    }, TICK_MS);

    window.addEventListener("pointerdown", onInput, { passive: true });
    window.addEventListener("scroll", onInput, { passive: true });
    window.addEventListener("touchstart", onInput, { passive: true });
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(tick);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("scroll", onInput);
      window.removeEventListener("touchstart", onInput);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fire, tryOrQueue]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  /** The person closed it: snooze the rest (see recordDismiss). */
  const dismiss = useCallback(() => {
    const state = loadCompanionState();
    saveCompanionState({ persisted: recordDismiss(state.persisted, Date.now()) });
    pending.current = [];
    hide();
  }, [hide]);

  return { line, dismiss, hide };
}
