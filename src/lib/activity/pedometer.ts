/**
 * src/lib/activity/pedometer.ts — in-app step counter (CLIENT ONLY).
 *
 * Counts steps from the phone's accelerometer while the user has StrivUp open
 * and is walking or jogging. No app store, no third-party account, no OAuth —
 * it runs inside the normal web app.
 *
 * HOW IT DETECTS A STEP
 * ---------------------
 * Walking makes the acceleration magnitude oscillate around gravity: a peak on
 * each foot strike. So we:
 *   1. take |a| = sqrt(x² + y² + z²) from `accelerationIncludingGravity`
 *   2. track a slow-moving baseline (a low-pass filter), because the resting
 *      value drifts with how the phone is held — it is not always 9.81
 *   3. arm when |a| rises THRESHOLD above the baseline, and count one step when
 *      it falls back through it. Counting on the falling edge (rather than the
 *      peak) is what stops a single noisy peak registering several times.
 *   4. ignore anything faster than MIN_STEP_INTERVAL_MS
 *
 * HONEST LIMITS — do not paper over these in the UI:
 *   - it only counts while the page is visible. Lock the screen or switch apps
 *     and the browser stops delivering events. That is a browser limitation,
 *     not a bug here.
 *   - shaking the phone produces steps. Server-side heuristics catch absurd
 *     rates, but a determined person can inflate a count. That is why this
 *     source is recorded as SELF_REPORTED, never VERIFIED.
 */

/** Rise above the smoothed baseline, in m/s², before a peak counts. */
const THRESHOLD = 1.2;
/** Smoothing factor for the baseline. Lower = slower to adapt. */
const BASELINE_ALPHA = 0.08;
/** Fastest believable cadence — 4 steps/sec, matching the server's check. */
const MIN_STEP_INTERVAL_MS = 250;

export type PedometerStatus =
  | "idle"
  | "unsupported"
  | "needs-permission"
  | "denied"
  | "running"
  | "paused";

export interface PedometerEvents {
  onStep?: (sessionSteps: number) => void;
  onStatus?: (status: PedometerStatus, detail?: string) => void;
}

interface DeviceMotionEventWithPermission {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

/** True when this browser exposes motion events at all. */
export function isPedometerSupported(): boolean {
  return typeof window !== "undefined" && typeof window.DeviceMotionEvent !== "undefined";
}

/**
 * iOS 13+ requires an explicit grant, and it must originate from a user
 * gesture — call this straight from a click handler, never from an effect.
 * Android grants implicitly but still needs a secure context (https or
 * localhost), so a plain-http page silently delivers no events.
 */
export async function requestMotionPermission(): Promise<PedometerStatus> {
  if (!isPedometerSupported()) return "unsupported";

  const dme = window.DeviceMotionEvent as unknown as DeviceMotionEventWithPermission;

  if (typeof dme.requestPermission === "function") {
    try {
      const result = await dme.requestPermission();
      return result === "granted" ? "idle" : "denied";
    } catch {
      /* Thrown when not called from a user gesture. */
      return "needs-permission";
    }
  }

  if (!window.isSecureContext) return "denied";
  return "idle";
}

export class Pedometer {
  private steps = 0;
  private baseline: number | null = null;
  private armed = false;
  private lastStepAt = 0;
  private listening = false;
  private wakeLock: WakeLockSentinel | null = null;
  private events: PedometerEvents;

  constructor(events: PedometerEvents = {}) {
    this.events = events;
  }

  get sessionSteps(): number {
    return this.steps;
  }

  /** Begins counting. Permission must already be granted. */
  async start(): Promise<void> {
    if (this.listening) return;

    window.addEventListener("devicemotion", this.handleMotion);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.listening = true;
    this.events.onStatus?.("running");

    /* The counter only works while the screen is on, so ask to keep it on.
       Unsupported or refused is fine — the user just has to keep tapping. */
    try {
      if ("wakeLock" in navigator) {
        this.wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch {
      /* Not fatal. */
    }
  }

  /** Stops counting. The session total stays readable. */
  stop(): void {
    if (!this.listening) return;

    window.removeEventListener("devicemotion", this.handleMotion);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.listening = false;

    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;

    this.events.onStatus?.("idle");
  }

  /** Clears the session count without touching anything already synced. */
  reset(): void {
    this.steps = 0;
    this.baseline = null;
    this.armed = false;
    this.lastStepAt = 0;
  }

  private handleVisibility = () => {
    if (!this.listening) return;
    /* Events stop arriving when hidden; say so rather than appearing stuck. */
    this.events.onStatus?.(document.hidden ? "paused" : "running");
  };

  private handleMotion = (event: DeviceMotionEvent) => {
    const a = event.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;

    const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

    if (this.baseline === null) {
      this.baseline = magnitude;
      return;
    }
    this.baseline = this.baseline * (1 - BASELINE_ALPHA) + magnitude * BASELINE_ALPHA;

    const high = this.baseline + THRESHOLD;

    if (!this.armed && magnitude > high) {
      this.armed = true;
      return;
    }

    /* Count on the falling edge — one peak, one step. */
    if (this.armed && magnitude < this.baseline) {
      this.armed = false;
      const now = Date.now();
      if (now - this.lastStepAt < MIN_STEP_INTERVAL_MS) return;
      this.lastStepAt = now;
      this.steps += 1;
      this.events.onStep?.(this.steps);
    }
  };
}

/* ── Server sync ─────────────────────────────────────────────────────────── */

/** Today's date in the given timezone, as YYYY-MM-DD. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export interface PushResult {
  storedToday: number;
  inserted: number;
  updated: number;
  flagged: number;
}

/**
 * Pushes today's running total to the server.
 *
 * `steps` is the whole day's count, not a delta — the server keeps the higher
 * of what it already has and what arrives, so a page reload or a second tab
 * can never knock the day's total backwards.
 */
export async function pushSteps(
  steps: number,
  timeZone = "Asia/Kolkata"
): Promise<PushResult> {
  const res = await fetch("/api/activity/native/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "device_sensor",
      timezone: timeZone,
      records: [{ local_date: todayIn(timeZone), steps }],
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    storedToday?: number;
    inserted?: number;
    updated?: number;
    flagged?: number;
  };
  if (!res.ok) throw new Error(body.error ?? "Could not save steps");

  return {
    storedToday: body.storedToday ?? steps,
    inserted: body.inserted ?? 0,
    updated: body.updated ?? 0,
    flagged: body.flagged ?? 0,
  };
}

/** Today's already-stored step count, used as the starting point on mount. */
export async function fetchStoredToday(timeZone = "Asia/Kolkata"): Promise<number> {
  const res = await fetch(`/api/activity/today?tz=${encodeURIComponent(timeZone)}`, {
    cache: "no-store",
  });
  if (!res.ok) return 0;
  const body = (await res.json().catch(() => ({}))) as { steps?: number };
  return body.steps ?? 0;
}
