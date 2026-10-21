/**
 * src/components/features/strivy/chat.ts
 *
 * The chat panel's non-visual logic, kept free of React so it can be unit
 * tested: message types, the history sent to the server, turning an API
 * response into a message, and per-tab conversation storage.
 */
import { stripInternalMetadata } from "@/lib/strivy/sanitize";
import type { ChatTurn, StrivyReply } from "@/lib/strivy/types";

export type StrivyChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "strivy"; reply: StrivyReply }
  /** A failed request. `retry` is the message to resend, when retrying can help. */
  | { id: string; role: "error"; text: string; retry: string | null };

export const MAX_CHARS = 500;
export const HISTORY_TURNS = 8;
/**
 * How long the panel waits for a reply. Longer than the server's own model
 * budget (STRIVY_LLM_TIMEOUT_MS, at most 60 s), because the server always
 * answers with the grounded draft once that runs out; this only catches a
 * request that never comes back.
 */
export const REQUEST_TIMEOUT_MS = 65_000;

let nextId = 0;
export const newId = () => `m${Date.now()}-${nextId++}`;

/** The last few real turns, with the intent each Strivy reply answered. */
export function toHistory(messages: StrivyChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (m.role === "user") turns.push({ role: "user", text: m.text });
    else if (m.role === "strivy")
      turns.push({ role: "strivy", text: m.reply.text, intent: m.reply.intent });
  }
  return turns.slice(-HISTORY_TURNS);
}

/**
 * A reply as the panel can show it, or null if the server sent something
 * else. Anything that isn't a proper reply becomes a friendly error, so raw
 * JSON or internal text never reaches the chat.
 */
export function normalizeReply(value: unknown): StrivyReply | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Partial<StrivyReply>;
  if (typeof r.text !== "string" || typeof r.intent !== "string") return null;
  // The server already strips internal labels; this is a second line of
  // defence on the data itself (not CSS), so neither the bubble nor voice
  // can ever show or speak "User Safety: safe" and the like.
  const text = stripInternalMetadata(r.text);
  if (!text) return null;
  const strings = (xs: unknown) =>
    Array.isArray(xs)
      ? xs
          .filter((x): x is string => typeof x === "string")
          .map(stripInternalMetadata)
          .filter(Boolean)
          .slice(0, 4)
      : [];
  return {
    intent: r.intent,
    text: text.slice(0, 2000),
    chips: Array.isArray(r.chips)
      ? r.chips.filter(
          (c) =>
            c &&
            typeof c.label === "string" &&
            typeof c.tone === "string" &&
            Boolean(stripInternalMetadata(c.label))
        )
      : [],
    links: Array.isArray(r.links)
      ? r.links.filter((l) => l && typeof l.label === "string" && safeHref(l.href) !== null)
      : [],
    suggestions: strings(r.suggestions),
  };
}

/**
 * Link buttons only ever open STRIVUP pages: a same-site path, never another
 * site, a protocol-relative URL or a script URL. Anything else is dropped.
 */
export function safeHref(href: unknown): string | null {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return null;
  if (href.includes("\\") || [...href].some((c) => c.charCodeAt(0) < 32)) return null;
  return href;
}

/** The friendly texts for failed requests. Nothing internal is ever shown. */
export const ERROR_TEXT = {
  generic: "Something went sideways 😅 Try that again.",
  offline: "I can't reach STRIVUP right now. Try again in a bit.",
  timeout: "That took too long 😅 Try that again.",
  signedOut: "Your session has ended. Sign in again to keep chatting.",
  blocked: "Your account can't use STRIVY right now.",
  off: "STRIVY is switched off right now.",
  tooLong: `Keep it under ${MAX_CHARS} characters and try again.`,
  slowDown: "Easy there 😅 Give me a few seconds, then try again.",
} as const;

/**
 * What to show for a finished request. Retrying is offered only when it could
 * help (server errors, timeouts, network), not for sign-in or input problems.
 */
export function responseToMessage(
  status: number | "network" | "timeout" | "offline",
  data: { reply?: unknown; error?: string } | null,
  message: string
): StrivyChatMessage {
  if (typeof status === "number" && status >= 200 && status < 300) {
    const reply = normalizeReply(data?.reply);
    // Only the reply is kept: any other field (routing details from an older
    // server, for instance) is dropped and never rendered.
    if (reply) return { id: newId(), role: "strivy", reply };
  }
  const error = (text: string, retry: boolean): StrivyChatMessage => ({
    id: newId(),
    role: "error",
    text,
    retry: retry ? message : null,
  });
  switch (status) {
    case "timeout":
      return error(ERROR_TEXT.timeout, true);
    case "network":
    case "offline":
      return error(ERROR_TEXT.offline, true);
    case 401:
      return error(ERROR_TEXT.signedOut, false);
    case 403:
      return error(ERROR_TEXT.blocked, false);
    case 404:
      return error(ERROR_TEXT.off, false);
    case 400:
      return error(ERROR_TEXT.tooLong, false);
    case 429:
      return error(ERROR_TEXT.slowDown, true);
    default:
      return error(ERROR_TEXT.generic, true);
  }
}

/* ── Per-tab storage ─────────────────────────────────────────────────────── */

const STORAGE_KEY = "strivy:chat:v1";
const MAX_STORED = 40;

/**
 * The saved conversation for this tab, only if it belongs to `userId`, so a
 * different account signing in on the same tab never sees it.
 */
export function loadChat(userId: string): StrivyChatMessage[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as { userId?: string; messages?: StrivyChatMessage[] };
    if (saved.userId !== userId || !Array.isArray(saved.messages)) return [];
    // Rebuilt field by field, so nothing else saved with a message comes back.
    return saved.messages.flatMap((m): StrivyChatMessage[] => {
      if (m?.role === "user" && typeof m.text === "string")
        return [{ id: m.id, role: "user", text: m.text }];
      if (m?.role === "strivy") {
        const reply = normalizeReply(m.reply);
        return reply ? [{ id: m.id, role: "strivy", reply }] : [];
      }
      return [];
    });
  } catch {
    return [];
  }
}

/** Saves real turns only; error bubbles are not worth restoring. */
export function saveChat(userId: string, messages: StrivyChatMessage[]): void {
  try {
    const kept = messages.filter((m) => m.role !== "error").slice(-MAX_STORED);
    if (kept.length === 0) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, messages: kept }));
  } catch {
    // Storage blocked or full: the chat still works for this page view.
  }
}

export function clearChat(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/* ── Proactive check-ins ─────────────────────────────────────────────────── */

export interface CheckInPayload {
  key: string;
  reply: StrivyReply;
}

const CHECKIN_RUN_KEY = "strivy:checkin-run:v1";
const CHECKIN_SEEN_KEY = "strivy:checkin-seen:v1";
const MAX_SEEN = 100;

/** India-time date, matching the server's once-a-day dedupe keys. */
export function istDay(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * True at most once per tab, per user, per day, so page refreshes and
 * navigation don't re-run the check-in.
 */
export function claimCheckinRun(userId: string, now = new Date()): boolean {
  try {
    const stamp = `${userId}|${istDay(now)}`;
    if (window.sessionStorage.getItem(CHECKIN_RUN_KEY) === stamp) return false;
    window.sessionStorage.setItem(CHECKIN_RUN_KEY, stamp);
    return true;
  } catch {
    return false;
  }
}

function readSeen(userId: string): string[] {
  try {
    const raw = window.localStorage.getItem(CHECKIN_SEEN_KEY);
    const saved = raw ? (JSON.parse(raw) as { userId?: string; keys?: string[] }) : null;
    return saved?.userId === userId && Array.isArray(saved.keys) ? saved.keys : [];
  } catch {
    return [];
  }
}

/** Check-ins this user hasn't been shown yet on this device. */
export function unseenCheckIns(userId: string, list: CheckInPayload[]): CheckInPayload[] {
  const seen = new Set(readSeen(userId));
  return list.filter((c) => typeof c?.key === "string" && c.reply && !seen.has(c.key));
}

export function markCheckInsSeen(userId: string, keys: string[]): void {
  try {
    const all = [...readSeen(userId), ...keys].slice(-MAX_SEEN);
    window.localStorage.setItem(CHECKIN_SEEN_KEY, JSON.stringify({ userId, keys: all }));
  } catch {
    // Not critical: the worst case is seeing a check-in again.
  }
}

export function clearCheckInState(): void {
  try {
    window.sessionStorage.removeItem(CHECKIN_RUN_KEY);
    window.localStorage.removeItem(CHECKIN_SEEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

/* ── Panel theme ─────────────────────────────────────────────────────────── */

export type StrivyTheme = "light" | "dark";

const THEME_KEY = "strivy:theme:v1";

/**
 * The saved panel theme on this device. With nothing saved, it follows the
 * system's light/dark setting; light when that can't be read either.
 */
export function loadTheme(): StrivyTheme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Fall through to the system preference.
  }
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function saveTheme(theme: StrivyTheme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked: the toggle still works until the panel closes.
  }
}
