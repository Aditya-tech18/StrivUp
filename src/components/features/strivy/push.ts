/**
 * src/components/features/strivy/push.ts
 *
 * Browser side of STRIVY push: register the service worker, ask for
 * permission, subscribe with the VAPID public key and tell the server. Kept
 * free of React so the pure parts can be tested.
 */

// The app's one service worker; it imports the STRIVY push handlers from
// /strivy-sw.js. Registering a second worker at "/" would replace this one.
export const SW_URL = "/sw.js";

export type PushSupport = "supported" | "unsupported" | "not-configured";

export function vapidPublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined;
}

export function devToolsVisible(): boolean {
  return process.env.NEXT_PUBLIC_STRIVY_PUSH_DEV_TOOLS === "true";
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  return vapidPublicKey() ? "supported" : "not-configured";
}

/** VAPID keys are base64url; PushManager wants bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  return existing ?? navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  return reg ? reg.pushManager.getSubscription() : null;
}

export type EnableResult = "enabled" | "denied" | "unsupported" | "server-error";

/**
 * Turns push on for this device: asks permission (must run from a tap),
 * subscribes and saves the endpoint for the signed-in user. Whether daily
 * nudges are sent is a separate setting (setNudges).
 */
export async function enablePush(): Promise<EnableResult> {
  const key = vapidPublicKey();
  if (pushSupport() !== "supported" || !key) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }));

  const saved = await fetch("/api/strivy/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return saved.ok ? "enabled" : "server-error";
}

/** Turns push off for this device: drops the endpoint here and on the server. */
export async function disablePush(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return true;
  const removed = await fetch("/api/strivy/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => null);
  await sub.unsubscribe().catch(() => false);
  return Boolean(removed?.ok);
}

export type PushLanguage = "en" | "hinglish" | "hi" | "bho";

export interface PushPrefs {
  nudges: boolean;
  /** The user's explicit choice; null means "auto" (follow the chat). */
  language: PushLanguage | null;
  chatLanguage: PushLanguage | null;
}

export async function loadPushPrefs(): Promise<PushPrefs | null> {
  const res = await fetch("/api/strivy/push/preferences").catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as PushPrefs | null;
}

async function putPrefs(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/strivy/push/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return Boolean(res?.ok);
}

/** Daily STRIVY nudges on/off for this account. */
export function setNudges(on: boolean): Promise<boolean> {
  return putPrefs({ nudges: on });
}

/** Push language for this account; "auto" follows the chat. */
export function setPushLanguage(language: PushLanguage | "auto"): Promise<boolean> {
  return putPrefs({ language });
}

const CHAT_LANG_KEY = "strivy:push-chat-lang:v1";

/**
 * Remembers the language the user chats in, so "auto" pushes match it. Only
 * runs once push permission is granted, and only saves when it changes.
 */
export async function rememberChatLanguage(lang: PushLanguage | null): Promise<void> {
  if (!lang || pushSupport() !== "supported" || Notification.permission !== "granted") return;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(CHAT_LANG_KEY);
  } catch {
    // Storage blocked: save every change instead.
  }
  if (saved === lang) return;
  if (await putPrefs({ chatLanguage: lang })) {
    try {
      localStorage.setItem(CHAT_LANG_KEY, lang);
    } catch {
      // Ignore.
    }
  }
}

const ASK_KEY = "strivy:push-ask:v1";

/**
 * Whether to show the in-chat "keep you accountable?" card: only when this
 * browser can do push, the person hasn't decided yet (permission is still
 * "default"), isn't already subscribed, and hasn't tapped "Not now" before.
 * The browser's own prompt only ever appears after they tap Enable.
 */
export async function shouldOfferPush(): Promise<boolean> {
  if (pushSupport() !== "supported" || Notification.permission !== "default") return false;
  try {
    if (localStorage.getItem(ASK_KEY)) return false;
  } catch {
    return false;
  }
  return !(await currentSubscription().catch(() => null));
}

/** Remembers the answer so the card never comes back on this device. */
export function rememberPushAnswer(answer: "enabled" | "not-now"): void {
  try {
    localStorage.setItem(ASK_KEY, answer);
  } catch {
    // Storage blocked: the card may show again next time, nothing worse.
  }
}

/** Where to re-allow notifications after blocking them. */
export const BLOCKED_HELP =
  "Notifications are blocked for STRIVUP. To allow them, tap the lock or site icon next to the address, open Notifications and choose Allow, then try again.";

export function permissionState(): NotificationPermission | "unsupported" {
  return pushSupport() === "supported" ? Notification.permission : "unsupported";
}

/** What a normal user sees when a test push fails. Details stay in dev/server logs. */
export const TEST_FAILED_TEXT = "Push notification test failed. Check your notification setup.";

/**
 * DEVELOPMENT ONLY: one test push to the signed-in user's own devices.
 * Never reports success unless the push service accepted it.
 */
export async function sendTestPush(): Promise<{ ok: boolean; text: string; detail?: string }> {
  const res = await fetch("/api/strivy/push/dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "test" }),
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as {
    delivered?: number;
    devices?: number;
    error?: string;
    category?: string;
  } | null;
  if (!res?.ok || !data || !data.delivered) {
    return {
      ok: false,
      text: TEST_FAILED_TEXT,
      detail: data?.category ? `${data.category}: ${data.error ?? ""}`.trim() : undefined,
    };
  }
  return {
    ok: true,
    text: `Test sent ✅ Delivered to ${data.delivered} of ${data.devices ?? data.delivered} device(s). Check your notifications.`,
  };
}

/* ── The bell list: this user's recent STRIVY notifications ───────────── */

export interface PushHistoryItem {
  id: string;
  body: string;
  type: string;
  url: string;
  sentAt: string;
}

/** null when the list can't be loaded (server not set up, offline…). */
export async function loadPushHistory(): Promise<PushHistoryItem[] | null> {
  const res = await fetch("/api/strivy/push/history").catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { items?: unknown } | null;
  if (!data || !Array.isArray(data.items)) return null;
  return data.items.filter(
    (i): i is PushHistoryItem =>
      typeof i === "object" &&
      i !== null &&
      typeof (i as PushHistoryItem).body === "string" &&
      typeof (i as PushHistoryItem).sentAt === "string"
  );
}

const SEEN_KEY = "strivy:push-seen:v1";

/** When the list was last opened on this device (ISO), or null. */
export function lastSeenAt(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function markNotificationsSeen(at = new Date()): void {
  try {
    localStorage.setItem(SEEN_KEY, at.toISOString());
  } catch {
    // Storage blocked: the dot may come back, nothing worse.
  }
}

/** Items newer than the last time the list was opened. */
export function unreadCount(items: PushHistoryItem[], seen: string | null): number {
  const since = seen ? Date.parse(seen) : 0;
  return items.filter((i) => Date.parse(i.sentAt) > since).length;
}

/** An emoji for each kind of STRIVY notification. */
export function pushIcon(type: string): string {
  if (type === "proof_rejected") return "⚠️";
  if (type === "proof_verified" || type === "reward_earned" || type === "evening_done") return "✅";
  if (type.startsWith("streak")) return "🔥";
  if (type.startsWith("quest")) return "🎯";
  if (type === "proof_in_review" || type === "pending_task") return "👀";
  return "🔔";
}

/* ── DEVELOPMENT ONLY: step-by-step push setup check ──────────────────── */

export interface SetupStep {
  label: string;
  ok: boolean | null;
  fix?: string;
}

/**
 * Browser checks (permission, service worker, subscription) plus the
 * server's own checklist from /api/strivy/push/dev { action: "diagnose" }.
 * Shows what's missing, never a secret value.
 */
export async function diagnosePush(): Promise<SetupStep[]> {
  const steps: SetupStep[] = [];
  const support = pushSupport();
  steps.push({
    label: "Browser supports push",
    ok: support !== "unsupported",
    fix: support === "unsupported" ? "Use Chrome, Edge, Firefox or Safari 16.4+." : undefined,
  });
  steps.push({
    label: "VAPID public key in the browser bundle",
    ok: Boolean(vapidPublicKey()),
    fix: vapidPublicKey()
      ? undefined
      : "Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and restart the dev server.",
  });
  const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  steps.push({
    label: "Notification permission granted",
    ok: permission === "granted",
    fix:
      permission === "granted"
        ? undefined
        : permission === "denied"
          ? BLOCKED_HELP
          : "Turn on push notifications above.",
  });
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg =
      support !== "unsupported" ? await navigator.serviceWorker.getRegistration(SW_URL) : undefined;
  } catch {
    reg = undefined;
  }
  steps.push({
    label: "Service worker registered",
    ok: Boolean(reg),
    fix: reg ? undefined : "Turn on push notifications above (it registers /sw.js).",
  });
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  steps.push({
    label: "Browser has a push subscription",
    ok: Boolean(sub),
    fix: sub ? undefined : "Turn push notifications off and on again.",
  });

  const res = await fetch("/api/strivy/push/dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "diagnose" }),
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as {
    checks?: { label: string; ok: boolean; fix?: string }[];
    database?: { ok: boolean; fix?: string };
    devices?: number | null;
    error?: string;
  } | null;
  if (!res?.ok || !data?.checks) {
    steps.push({
      label: "Server push checks",
      ok: false,
      fix: data?.error ?? "Dev tools are off on the server (STRIVY_PUSH_DEV_TOOLS=true).",
    });
    return steps;
  }
  for (const c of data.checks) steps.push({ label: c.label, ok: c.ok, fix: c.fix });
  steps.push({
    label: "Push tables reachable in Supabase",
    ok: data.database?.ok ?? false,
    fix: data.database?.fix,
  });
  steps.push({
    label: "Subscription stored for your account",
    ok: data.database?.ok ? (data.devices ?? 0) > 0 : null,
    fix:
      data.database?.ok && !data.devices ? "Turn push notifications off and on again." : undefined,
  });
  return steps;
}

/** DEVELOPMENT ONLY: what the scheduler would send the caller now, as a short summary. */
export async function previewNextPush(): Promise<string> {
  const res = await fetch("/api/strivy/push/dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "preview" }),
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as {
    outcome?: string;
    skipReason?: string | null;
    window?: string | null;
    selected?: { type: string } | null;
    message?: { body: string; tone: string } | null;
    candidates?: { type: string; alreadySent: boolean }[];
    sentToday?: number;
    error?: string;
  } | null;
  if (!res?.ok || !data) return data?.error ?? "Preview failed.";
  const events = (data.candidates ?? [])
    .map((c) => `${c.type}${c.alreadySent ? " (sent)" : ""}`)
    .join(", ");
  const head =
    data.outcome === "ready" && data.message && data.selected
      ? `Would send (${data.selected.type}, ${data.message.tone}): "${data.message.body}"`
      : `Would skip: ${data.skipReason ?? "nothing to say"}`;
  return `${head}\nWindow: ${data.window ?? "none"} · sent today: ${data.sentToday ?? 0}\nEvents: ${events || "none"}`;
}
