"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Footprints, Pause, Play, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { ActivityProgressCard } from "./ActivityProgressCard";
import {
  Pedometer,
  fetchStoredToday,
  isPedometerSupported,
  pushSteps,
  requestMotionPermission,
  type PedometerStatus,
} from "@/lib/activity/pedometer";

/** How often a running session saves to the server. */
const PUSH_INTERVAL_MS = 20_000;

/**
 * LiveStepTracker — the in-app pedometer (spec §6, §13).
 *
 * The user taps Start, puts the phone in a pocket, and walks or jogs. Steps
 * are counted from the accelerometer and pushed to the server every 20
 * seconds, so quest progress advances while they are still moving.
 *
 * The count shown is today's total, not just this session: it is seeded from
 * whatever the server already has, so closing the page and coming back does
 * not appear to lose progress.
 */
export function LiveStepTracker({
  targetSteps,
  timezone = "Asia/Kolkata",
  onSynced,
}: {
  targetSteps?: number;
  timezone?: string;
  onSynced?: (total: number) => void;
}) {
  const router = useRouter();

  const [status, setStatus] = useState<PedometerStatus>("idle");
  const [baseline, setBaseline] = useState(0);
  const [sessionSteps, setSessionSteps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pedometerRef = useRef<Pedometer | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /* Kept in a ref so the interval always pushes the latest figure without
     being torn down and recreated on every single step. */
  const totalRef = useRef(0);

  const total = baseline + sessionSteps;
  totalRef.current = total;

  useEffect(() => {
    if (!isPedometerSupported()) {
      setStatus("unsupported");
      return;
    }
    void fetchStoredToday(timezone).then(setBaseline).catch(() => {});
  }, [timezone]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const result = await pushSteps(totalRef.current, timezone);
      /* The server keeps the higher of stored and sent, so trust it back. */
      if (result.storedToday > totalRef.current) {
        setBaseline(result.storedToday - sessionSteps);
      }
      onSynced?.(result.storedToday);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save steps");
    } finally {
      setSaving(false);
    }
  }, [timezone, sessionSteps, onSynced, router]);

  /* Stop cleanly if the component unmounts mid-session, so the listener and
     the wake lock do not outlive the screen. */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      pedometerRef.current?.stop();
    };
  }, []);

  async function handleStart() {
    setError(null);

    const permission = await requestMotionPermission();
    if (permission === "unsupported") {
      setStatus("unsupported");
      return;
    }
    if (permission === "denied") {
      setStatus("denied");
      return;
    }

    const pedometer =
      pedometerRef.current ??
      new Pedometer({
        onStep: (s) => setSessionSteps(s),
        onStatus: (s) => setStatus(s),
      });
    pedometerRef.current = pedometer;

    await pedometer.start();
    timerRef.current = setInterval(() => void save(), PUSH_INTERVAL_MS);
  }

  async function handleStop() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    pedometerRef.current?.stop();
    await save();
  }

  const isRunning = status === "running" || status === "paused";

  if (status === "unsupported") {
    return (
      <div className="rounded-lg bg-surface-container-low p-3">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-on-surface-variant">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This browser can&apos;t read motion sensors. Open StrivUp on your phone to track
            steps.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-secondary-fixed-dim bg-secondary-fixed/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-on-secondary-fixed">
          <Footprints className="h-3.5 w-3.5" />
          Today&apos;s steps
        </span>
        {isRunning && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-sm font-medium ${
              status === "paused"
                ? "bg-warning-container text-on-warning-container"
                : "bg-success-container text-on-success-container"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "paused" ? "bg-warning" : "animate-pulse bg-success"
              }`}
            />
            {status === "paused" ? "Paused" : "Counting"}
          </span>
        )}
      </div>

      {targetSteps ? (
        <ActivityProgressCard current={total} target={targetSteps} unit="steps" />
      ) : (
        <p className="text-2xl font-bold tabular-nums text-on-surface">
          {total.toLocaleString("en-IN")}
        </p>
      )}

      {isRunning && sessionSteps > 0 && (
        <p className="mt-1.5 text-label-sm text-on-surface-variant">
          +{sessionSteps.toLocaleString("en-IN")} this session
          {saving && " · saving…"}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {isRunning ? (
          <Button variant="outline" size="sm" onClick={handleStop}>
            <Pause className="h-3.5 w-3.5" /> Stop &amp; save
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={handleStart}>
            <Play className="h-3.5 w-3.5" /> Start tracking
          </Button>
        )}
      </div>

      {status === "paused" && (
        <p className="mt-2 text-label-sm leading-relaxed text-on-warning-container">
          Counting pauses when you leave the app or the screen locks. Keep StrivUp open while
          you walk.
        </p>
      )}

      {status === "denied" && (
        <p className="mt-2 text-label-sm leading-relaxed text-on-error-container">
          Motion access was blocked. Allow it in your browser settings, and make sure you&apos;re
          on an https:// page.
        </p>
      )}

      {!isRunning && status !== "denied" && (
        <p className="mt-2 text-label-sm leading-relaxed text-on-surface-variant">
          Keep StrivUp open while you walk — a browser can only count steps on the screen
          you&apos;re looking at.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-on-error-container">{error}</p>}
    </div>
  );
}
