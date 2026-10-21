/**
 * src/lib/strivy/companion/engine.ts
 *
 * The rules behind STRIVY's companion popups, as pure functions so every
 * rule is testable without a browser:
 *
 *   event ─▶ decideCompanion() ─▶ a line to show, or the reason not to
 *                 │
 *                 ├─ blockers:   typing, a form, voice, hidden tab, quiet time
 *                 ├─ cooldown:   a gap between popups, a daily and a session cap
 *                 ├─ dedupe:     each moment once per session, no repeated line
 *                 ├─ dismissal:  a close snoozes popups; repeated closes end the day
 *                 └─ chance:     ambient moments only sometimes
 *
 * The browser side (src/components/features/strivy/companion.ts and
 * useStrivyCompanion.ts) turns app activity into events, keeps the state in
 * storage and renders the line. Nothing here reads personal data.
 */
import type { StrivyLang } from "../language";
import { COMPANION_LINES, type CompanionLine } from "./messages";

export type CompanionEventType =
  | "APP_OPENED"
  | "ACTIVE_BROWSING"
  | "STRIVY_OPENED"
  | "THEME_CHANGED"
  | "CHALLENGE_OPENED"
  | "QUEST_OPENED"
  | "SCREEN_OPENED"
  | "CHALLENGE_COMPLETED"
  | "QUEST_COMPLETED"
  | "TASK_COMPLETED"
  | "IDLE"
  | "RETURNED_TO_APP";

export interface CompanionEvent {
  type: CompanionEventType;
  /** A sub-case of the event: "dark" / "light", "explore" / "profile". */
  variant?: string;
  /** THEME_CHANGED to light: how long dark mode was on, in ms, when known. */
  darkForMs?: number;
}

/** Kept across visits (localStorage). */
export interface CompanionPersisted {
  /** When the last popup showed (any tab). */
  lastShownAt: number;
  /** "YYYY-MM-DD" the counters below belong to. */
  day: string;
  shownToday: number;
  dismissedToday: number;
  /** After a close, nothing shows until then. */
  snoozeUntil: number;
  /** After a serious or low message, nothing playful shows until then. */
  quietUntil: number;
  /** The most recent line ids, so a line doesn't come back too soon. */
  recent: string[];
}

/** This visit only (sessionStorage). */
export interface CompanionSession {
  shown: number;
  /** Moments already shown this session ("THEME_CHANGED:dark"…). */
  moments: string[];
}

/** Why now would be a bad moment. Any true value blocks every popup. */
export interface CompanionBlockers {
  /** The person is typing (a focused field with text, or keys just pressed). */
  typing: boolean;
  /** A form field outside STRIVY has focus, or the page is a form. */
  form: boolean;
  /** The mic is open or STRIVY is speaking. */
  voice: boolean;
  /** The tab isn't visible. */
  hidden: boolean;
}

export const NO_BLOCKERS: CompanionBlockers = {
  typing: false,
  form: false,
  voice: false,
  hidden: false,
};

/* ── Rules ─────────────────────────────────────────────────────────────── */

/** Minimum gap between two ambient popups. */
export const COOLDOWN_MS = 4 * 60_000;
/** Minimum gap before a celebration (completions); still never stacked. */
export const CELEBRATION_COOLDOWN_MS = 20_000;
/** At most this many popups per session, and per day. */
export const MAX_PER_SESSION = 4;
export const MAX_PER_DAY = 8;
/** Closing a popup snoozes the rest for this long. */
export const DISMISS_SNOOZE_MS = 30 * 60_000;
/** Closing this many in one day ends popups for that day. */
export const MAX_DISMISSALS_PER_DAY = 3;
/** After a serious or low message: no playful popups for this long. */
export const SERIOUS_QUIET_MS = 3 * 60 * 60_000;
/** How many recent lines are never repeated. */
const RECENT_LINES = 12;

/** Celebrations: always shown when allowed, with a shorter cooldown. */
const CELEBRATIONS = new Set<CompanionEventType>([
  "CHALLENGE_COMPLETED",
  "QUEST_COMPLETED",
  "TASK_COMPLETED",
]);

/**
 * How often an allowed moment actually shows. Below 1 so STRIVY isn't
 * predictable or chatty; celebrations always show.
 */
export const CHANCE: Record<CompanionEventType, number> = {
  APP_OPENED: 0,
  ACTIVE_BROWSING: 0.6,
  STRIVY_OPENED: 0.35,
  THEME_CHANGED: 0.8,
  CHALLENGE_OPENED: 0.3,
  QUEST_OPENED: 0.35,
  SCREEN_OPENED: 0.2,
  CHALLENGE_COMPLETED: 1,
  QUEST_COMPLETED: 1,
  TASK_COMPLETED: 1,
  IDLE: 0.5,
  RETURNED_TO_APP: 0.5,
};

/** Moments that may show while the STRIVY panel is open (they are about it). */
const PANEL_EVENTS = new Set<CompanionEventType>(["STRIVY_OPENED", "THEME_CHANGED"]);

export function emptyPersisted(): CompanionPersisted {
  return {
    lastShownAt: 0,
    day: "",
    shownToday: 0,
    dismissedToday: 0,
    snoozeUntil: 0,
    quietUntil: 0,
    recent: [],
  };
}

export function emptySession(): CompanionSession {
  return { shown: 0, moments: [] };
}

/** Local calendar day, so "per day" means the person's day. */
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Counters reset on a new day. */
function forToday(p: CompanionPersisted, now: number): CompanionPersisted {
  const day = dayKey(now);
  return p.day === day ? p : { ...p, day, shownToday: 0, dismissedToday: 0 };
}

/** "THEME_CHANGED:dark": the once-per-session key for a moment. */
export function momentKey(event: CompanionEvent): string {
  return event.variant ? `${event.type}:${event.variant}` : event.type;
}

/** "12 seconds", "3 minutes", "2 hours": how long dark mode lasted. */
export function formatDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

export interface ShownLine {
  id: string;
  text: string;
  event: CompanionEventType;
}

export type CompanionDecision =
  | {
      show: true;
      line: ShownLine;
      persisted: CompanionPersisted;
      session: CompanionSession;
    }
  | { show: false; reason: string };

/** The lines for an event, without the ones shown recently or needing a missing value. */
export function candidateLines(
  event: CompanionEvent,
  recent: readonly string[] = [],
  lines: readonly CompanionLine[] = COMPANION_LINES
): CompanionLine[] {
  const fits = lines.filter(
    (l) =>
      l.event === event.type &&
      (!l.when || l.when === event.variant) &&
      (!/\{duration\}/.test(l.en) || typeof event.darkForMs === "number")
  );
  const fresh = fits.filter((l) => !recent.includes(l.id));
  return fresh.length > 0 ? fresh : fits;
}

/**
 * Whether to show a popup for this event now, and which line. Returns the
 * updated state to save when it shows. `rand` is injectable for tests.
 */
export function decideCompanion(input: {
  event: CompanionEvent;
  now: number;
  persisted: CompanionPersisted;
  session: CompanionSession;
  blockers?: CompanionBlockers;
  panelOpen?: boolean;
  /** A popup is already on screen. */
  visible?: boolean;
  lang?: StrivyLang | null;
  rand?: () => number;
}): CompanionDecision {
  const { event, now } = input;
  const blockers = input.blockers ?? NO_BLOCKERS;
  const rand = input.rand ?? Math.random;
  const persisted = forToday(input.persisted, now);
  const session = input.session;
  const celebration = CELEBRATIONS.has(event.type);

  if (CHANCE[event.type] <= 0) return { show: false, reason: "not a popup moment" };
  if (input.visible) return { show: false, reason: "one already showing" };
  if (blockers.hidden) return { show: false, reason: "tab hidden" };
  if (blockers.voice) return { show: false, reason: "voice in use" };
  if (blockers.typing) return { show: false, reason: "typing" };
  if (blockers.form) return { show: false, reason: "in a form" };
  if (now < persisted.quietUntil) return { show: false, reason: "quiet after a serious message" };
  if (persisted.dismissedToday >= MAX_DISMISSALS_PER_DAY)
    return { show: false, reason: "dismissed too often today" };
  if (now < persisted.snoozeUntil) return { show: false, reason: "snoozed after a dismissal" };
  if (input.panelOpen && !PANEL_EVENTS.has(event.type))
    return { show: false, reason: "chat is open" };
  if (session.shown >= MAX_PER_SESSION) return { show: false, reason: "session limit" };
  if (persisted.shownToday >= MAX_PER_DAY) return { show: false, reason: "daily limit" };
  const gap = celebration ? CELEBRATION_COOLDOWN_MS : COOLDOWN_MS;
  if (now - persisted.lastShownAt < gap) return { show: false, reason: "cooldown" };
  const key = momentKey(event);
  if (session.moments.includes(key)) return { show: false, reason: "already shown this session" };

  const lines = candidateLines(event, persisted.recent);
  if (lines.length === 0) return { show: false, reason: "no line for this moment" };
  if (rand() >= CHANCE[event.type]) return { show: false, reason: "not this time" };

  const line = lines[Math.min(lines.length - 1, Math.floor(rand() * lines.length))];
  const template = input.lang === "en" ? line.en : line.hinglish;
  const text = template.replace(/\{duration\}/g, () => formatDuration(event.darkForMs ?? 0));

  return {
    show: true,
    line: { id: line.id, text, event: event.type },
    persisted: {
      ...persisted,
      lastShownAt: now,
      shownToday: persisted.shownToday + 1,
      recent: [line.id, ...persisted.recent.filter((id) => id !== line.id)].slice(0, RECENT_LINES),
    },
    session: { shown: session.shown + 1, moments: [...session.moments, key] },
  };
}

/** The person closed a popup: snooze, and stop for the day after a few closes. */
export function recordDismiss(p: CompanionPersisted, now: number): CompanionPersisted {
  const today = forToday(p, now);
  return {
    ...today,
    dismissedToday: today.dismissedToday + 1,
    snoozeUntil: now + DISMISS_SNOOZE_MS,
  };
}

/** A serious or low message: no playful popups for a while. */
export function recordSerious(p: CompanionPersisted, now: number): CompanionPersisted {
  return { ...p, quietUntil: Math.max(p.quietUntil, now + SERIOUS_QUIET_MS) };
}

/* ── Safety ───────────────────────────────────────────────────────────── */

/**
 * Words and phrases a companion line must never contain: anything sexual,
 * insulting, shaming, guilt-tripping, or that makes the person feel they
 * owe STRIVY attention. Tests run every line in the library through it.
 */
const UNSAFE =
  /\b(sex\w*|sexy|nude\w*|naked|horny|hot body|kiss\w*|bed|bedroom|touch\w*|body|baby|babe|jaan|jaanu|darling|need me|needs me|don'?t leave|leave me|without me|only me|miss me|you owe|owe me|guilty|ashamed|shame\w*|disappoint\w*|lazy|loser|useless|pathetic|stupid|idiot|ugly|fat|worthless|failure|nalla|nikamma|bekaar|bekar|chutiy\w*|pagal|bewakoof|kill|die|hate)\b|❤️|💋|🍑|🍆|💦|🔞/i;

export function isSafeCompanionLine(text: string): boolean {
  return !UNSAFE.test(text);
}
