"use client";

/**
 * src/components/features/permissions/permissionState.ts
 *
 * What the browser will and will not let us do with permissions, in one
 * place, because the honest answer differs from the obvious expectation.
 *
 * A web app, including this one inside its TWA shell, CANNOT open the Android
 * permission dialog whenever it likes. Chrome only shows it in response to a
 * user gesture, and `Notification.requestPermission()` called on load is
 * ignored, or on repeat visits silently auto-denied. So a prompt "the moment
 * the app opens" is not something the platform offers.
 *
 * What we do instead is the pattern every well-behaved app uses: our own
 * sheet appears on first launch explaining why each permission is wanted, and
 * the button inside it is the gesture that opens the real system dialog. The
 * person sees the native prompt, one tap later, with context.
 *
 * Turning a permission back OFF is similarly limited: no browser exposes a
 * revoke API. For notifications that does not matter, because we hold the
 * push subscription and deleting it genuinely stops them. For location there
 * is nothing to delete, so "off" means we stop asking for a fix and clear the
 * one we cached. Both are real effects; neither is a fake switch.
 */

export type PermissionState = "granted" | "denied" | "prompt" | "unsupported";

export function notificationState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const p = Notification.permission;
  return p === "granted" ? "granted" : p === "denied" ? "denied" : "prompt";
}

export async function locationState(): Promise<PermissionState> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "unsupported";
  // Permissions API is not everywhere, and Safari in particular omits it.
  // Without it we cannot know the state without asking, so treat it as
  // "prompt" and let the request itself be the source of truth.
  if (!("permissions" in navigator)) return "prompt";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state === "granted"
      ? "granted"
      : status.state === "denied"
        ? "denied"
        : "prompt";
  } catch {
    return "prompt";
  }
}

/** Our own record of whether the person wants us using location at all. */
const LOCATION_PREF_KEY = "strivup:perm:location";

export function locationEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LOCATION_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setLocationEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(LOCATION_PREF_KEY, on ? "on" : "off");
  } catch {
    // Private mode. The preference is a convenience, not a gate.
  }
}

/** Shown once per device, so the launch sheet is not a recurring nag. */
export const PROMPT_SEEN_KEY = "strivup:perm:prompted:v1";

export function promptSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(PROMPT_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markPromptSeen(): void {
  try {
    window.localStorage.setItem(PROMPT_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Is StrivUp running as the installed app, or inside a browser tab?
 *
 * This decides which permission dialog a person actually sees. Inside the
 * installed TWA, Notification.requestPermission() is delegated to Android and
 * they get the system POST_NOTIFICATIONS prompt, the same one every other app
 * shows. In a browser tab they get Chrome's own prompt, and any notification
 * that follows is attributed to Chrome rather than to StrivUp.
 *
 * A TWA only launches without the browser chrome when Digital Asset Links
 * verify, which needs /.well-known/assetlinks.json to carry the real package
 * name and signing fingerprint. While it does not, Android quietly falls back
 * to a Custom Tab, which looks like the app but is a browser, and that is why
 * the prompt can look wrong even on a phone with the app installed.
 */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches;
  // iOS Safari predates display-mode and uses its own flag.
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}
