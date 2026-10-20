/**
 * src/lib/strivy/push/config.ts
 *
 * Settings for STRIVY's daily push notifications. Everything is off unless
 * switched on with environment variables, so shipping the code changes
 * nothing on its own.
 *
 * Server-only variables (never NEXT_PUBLIC_):
 *   STRIVY_PUSH_ENABLED=true        subscribe/preferences routes and the cron route work
 *   VAPID_PRIVATE_KEY, VAPID_SUBJECT  Web Push signing (mailto: or https: subject)
 *   SUPABASE_SERVICE_ROLE_KEY       the scheduler reads every subscribed user's facts
 *   CRON_SECRET                     the scheduler route only runs with this bearer token
 *   STRIVY_PUSH_DEV_TOOLS=true      development-only test routes (never in production)
 *
 * Public:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY    the browser subscribes with it
 *   NEXT_PUBLIC_STRIVY_PUSH_DEV_TOOLS=true  shows the dev-only test button
 */

/** The three daily windows, in India time (hours, end exclusive). */
export type PushWindow = "morning" | "afternoon" | "evening";

export const PUSH_WINDOWS: Record<PushWindow, { from: number; to: number }> = {
  morning: { from: 9, to: 11 },
  afternoon: { from: 14, to: 17 },
  evening: { from: 19, to: 22 },
};

/** Hard ceiling, whatever a preference says. */
export const MAX_PUSHES_PER_DAY = 3;
export const DEFAULT_MIN_SPACING_MINUTES = 180;
export const MIN_SPACING_FLOOR_MINUTES = 30;

export const PUSH_TITLE = "STRIVY 👀";
export const MAX_BODY_CHARS = 160;

const HOUR = 3_600_000;
const IST_OFFSET = 5.5 * HOUR;

export function istDay(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET).toISOString().slice(0, 10);
}

export function istHour(now: Date): number {
  return new Date(now.getTime() + IST_OFFSET).getUTCHours();
}

/** The window `now` falls in, or null outside all three. */
export function windowAt(now: Date): PushWindow | null {
  const h = istHour(now);
  for (const [name, w] of Object.entries(PUSH_WINDOWS) as [
    PushWindow,
    { from: number; to: number },
  ][]) {
    if (h >= w.from && h < w.to) return name;
  }
  return null;
}

export function isPushEnabled(): boolean {
  return process.env.STRIVY_PUSH_ENABLED === "true";
}

/** Dev tools never run in a production build, whatever the flag says. */
export function arePushDevToolsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.STRIVY_PUSH_DEV_TOOLS === "true";
}

/** Only same-site paths may be opened from a notification. */
export function safeClickUrl(url: string | null | undefined): string {
  if (typeof url !== "string") return "/feed";
  if (!url.startsWith("/") || url.startsWith("//") || url.includes("\\")) return "/feed";
  return url.slice(0, 300);
}
