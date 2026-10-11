/**
 * src/lib/activity/geoDistance.ts — distance walked, from GPS (CLIENT ONLY).
 *
 * Runs beside the accelerometer pedometer, not instead of it. The two measure
 * different things and each is weak where the other is strong:
 *
 *   accelerometer — counts real steps, works indoors and on a treadmill, and
 *                   can be inflated by shaking the phone.
 *   GPS           — measures real ground covered and cannot be faked by
 *                   shaking, but reads zero indoors and drifts when still.
 *
 * So both are recorded and neither is derived from the other. We do NOT turn
 * distance into steps: that would mean multiplying by an assumed stride length
 * and reporting the guess as a measurement, and `verification_status` could no
 * longer mean anything.
 *
 * HONEST LIMITS — the same ones the pedometer carries:
 *   - only runs while the page is visible; the browser stops the watch when
 *     the screen locks.
 *   - a phone standing still reports a wandering position. The accuracy gate
 *     and MIN_MOVE_M below exist to stop that drift accumulating as distance,
 *     but they cannot remove it entirely.
 */

import { haversineMeters, GeoError, type GeoFix } from "@/lib/location/geo";

/** Ignore any fix less certain than this. Urban GPS is usually 5–20 m. */
const MAX_ACCURACY_M = 35;
/**
 * Movement below this is treated as the position wandering while stationary,
 * not as walking. Set above a typical good-fix error so a phone on a table
 * does not quietly log a kilometre.
 */
const MIN_MOVE_M = 8;
/**
 * Above this, the fix jumped — a tower handover or the device switching from
 * network to satellite positioning. Counting it would add hundreds of metres
 * nobody walked.
 */
const MAX_JUMP_M = 150;
/** Faster than a sprint over the gap between two fixes: not on foot. */
const MAX_SPEED_MPS = 12;

export type GeoTrackerStatus = "idle" | "acquiring" | "tracking" | "paused" | "denied" | "unsupported";

export interface GeoTrackerEvents {
  onDistance?: (meters: number) => void;
  onStatus?: (status: GeoTrackerStatus, detail?: string) => void;
}

export class GeoDistanceTracker {
  private watchId: number | null = null;
  private last: GeoFix | null = null;
  private meters = 0;
  private events: GeoTrackerEvents;

  constructor(events: GeoTrackerEvents = {}) {
    this.events = events;
  }

  get sessionMeters(): number {
    return this.meters;
  }

  /** Begins watching. Shares the one permission prompt with Near Me. */
  start(): void {
    if (this.watchId !== null) return;

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      this.events.onStatus?.("unsupported");
      return;
    }

    this.events.onStatus?.("acquiring");
    document.addEventListener("visibilitychange", this.handleVisibility);

    this.watchId = navigator.geolocation.watchPosition(
      this.handleFix,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          this.stop();
          this.events.onStatus?.("denied");
          return;
        }
        /* A single unavailable reading is normal indoors or in a lift. Keep
           the watch open and wait for the next one rather than tearing the
           session down on one bad fix. */
        this.events.onStatus?.("acquiring", new GeoError("unavailable", "").kind);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.last = null;
    this.events.onStatus?.("idle");
  }

  /** Clears the session's distance without touching anything already synced. */
  reset(): void {
    this.meters = 0;
    this.last = null;
  }

  private handleVisibility = () => {
    if (this.watchId === null) return;
    /* Drop the anchor when hidden. Resuming from a fix taken before the screen
       locked would book the whole gap — a bus ride, a lift, a night — as one
       walked segment. */
    if (document.hidden) this.last = null;
    this.events.onStatus?.(document.hidden ? "paused" : "tracking");
  };

  private handleFix = (position: GeolocationPosition) => {
    const fix: GeoFix = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };

    /* Too uncertain to tell movement from noise. Do not anchor on it either —
       a bad anchor poisons the next segment as much as a bad endpoint. */
    if (fix.accuracy > MAX_ACCURACY_M) {
      this.events.onStatus?.("acquiring");
      return;
    }

    const previous = this.last;
    this.last = fix;

    if (!previous) {
      this.events.onStatus?.("tracking");
      return;
    }

    const segment = haversineMeters(
      previous.latitude,
      previous.longitude,
      fix.latitude,
      fix.longitude
    );

    if (segment < MIN_MOVE_M) return;
    if (segment > MAX_JUMP_M) return;

    const seconds = (fix.timestamp - previous.timestamp) / 1000;
    if (seconds > 0 && segment / seconds > MAX_SPEED_MPS) return;

    this.meters += segment;
    this.events.onStatus?.("tracking");
    this.events.onDistance?.(this.meters);
  };
}

/** Metres as a person would say them. */
export function formatWalked(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}
