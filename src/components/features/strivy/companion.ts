/**
 * src/components/features/strivy/companion.ts
 *
 * The browser side of STRIVY's companion popups, without React:
 *
 *  - a tiny event bus, so any screen can say "a quest was completed" with
 *    one line (emitStrivyEvent) instead of running its own timers;
 *  - busy flags (voice) that keep popups away;
 *  - the blockers read from the page (typing, forms, hidden tab);
 *  - storage for the cooldown state (localStorage) and the session's
 *    de-duplication (sessionStorage). Storage failures are harmless: popups
 *    simply behave as on a first visit.
 *
 * The rules live in src/lib/strivy/companion/engine.ts; the timers and the
 * rendering in useStrivyCompanion.ts and StrivyCompanionPopup.tsx.
 */
import {
  emptyPersisted,
  emptySession,
  type CompanionBlockers,
  type CompanionEvent,
  type CompanionPersisted,
  type CompanionSession,
} from "@/lib/strivy/companion/engine";

/* ── Event bus ─────────────────────────────────────────────────────────── */

const EVENT = "strivy:companion";

/** Control messages that change the state without showing anything. */
export type CompanionSignal =
  { type: "SERIOUS_MESSAGE" } | { type: "USER_LANGUAGE"; lang: string | null };

export type CompanionBusMessage = CompanionEvent | CompanionSignal;

/** Tell STRIVY something happened. Safe to call anywhere, including on the server (no-op). */
export function emitStrivyEvent(message: CompanionBusMessage): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<CompanionBusMessage>(EVENT, { detail: message }));
  } catch {
    // Popups are optional; never let one break the page that sent it.
  }
}

export function onStrivyEvent(handler: (message: CompanionBusMessage) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<CompanionBusMessage>).detail;
    if (detail && typeof detail.type === "string") handler(detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/* ── Busy flags ────────────────────────────────────────────────────────── */

const busy = new Set<string>();

/** "voice": the mic is open or STRIVY is talking. */
export function setCompanionBusy(reason: string, on: boolean): void {
  if (on) busy.add(reason);
  else busy.delete(reason);
}

export function isCompanionBusy(reason: string): boolean {
  return busy.has(reason);
}

/* ── Blockers read from the page ───────────────────────────────────────── */

/** Pages that are mostly a form: never interrupted. */
const FORM_ROUTE = /\/(new|edit|onboarding|settings|login|signup|auth|business)(\/|$)/;

/** The page bits the blockers need; tests pass a fake. */
export interface PageLike {
  activeElement: Element | null;
  hidden: boolean;
  pathname: string;
  /** When a key was last pressed, ms. */
  lastKeyAt: number;
  now: number;
}

function isEditable(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file"].includes(
      type
    );
  }
  return (el as HTMLElement).isContentEditable === true;
}

/** Keys pressed this recently count as typing even without a focused field. */
export const TYPING_GRACE_MS = 3000;

export function readBlockers(page: PageLike): CompanionBlockers {
  const el = page.activeElement;
  const editable = isEditable(el);
  const inStrivy = Boolean(el?.closest?.(".strivy-panel"));
  const value =
    editable && "value" in (el as HTMLInputElement) ? (el as HTMLInputElement).value : "";
  return {
    typing: (editable && value.trim().length > 0) || page.now - page.lastKeyAt < TYPING_GRACE_MS,
    // A focused field outside STRIVY is a form being filled in.
    form: (editable && !inStrivy) || FORM_ROUTE.test(page.pathname),
    voice: isCompanionBusy("voice"),
    hidden: page.hidden,
  };
}

/* ── Storage ──────────────────────────────────────────────────────────── */

const PERSIST_KEY = "strivy:companion:v1";
const SESSION_KEY = "strivy:companion:session:v1";

function read<T extends object>(storage: Storage | undefined, key: string, fallback: T): T {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? { ...fallback, ...(parsed as T) } : fallback;
  } catch {
    return fallback;
  }
}

function write(storage: Storage | undefined, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the cooldown lasts this page view only.
  }
}

const local = () => (typeof window === "undefined" ? undefined : window.localStorage);
const sessionStore = () => (typeof window === "undefined" ? undefined : window.sessionStorage);

export function loadCompanionState(): { persisted: CompanionPersisted; session: CompanionSession } {
  const persisted = read(local(), PERSIST_KEY, emptyPersisted());
  const session = read(sessionStore(), SESSION_KEY, emptySession());
  return {
    persisted: { ...persisted, recent: Array.isArray(persisted.recent) ? persisted.recent : [] },
    session: { ...session, moments: Array.isArray(session.moments) ? session.moments : [] },
  };
}

export function saveCompanionState(state: {
  persisted?: CompanionPersisted;
  session?: CompanionSession;
}): void {
  if (state.persisted) write(local(), PERSIST_KEY, state.persisted);
  if (state.session) write(sessionStore(), SESSION_KEY, state.session);
}
