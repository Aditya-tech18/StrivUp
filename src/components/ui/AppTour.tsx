"use client";

import { useCallback, useEffect, useState } from "react";
import { Tour } from "./Tour";
import { TOUR_STEPS, TOUR_STORAGE_KEY } from "@/lib/tour/steps";

/**
 * AppTour — owns whether the tour is showing, and remembers that it has been.
 *
 * Mounted once in the authenticated shell so the tour survives the route
 * changes it makes itself. A tour rendered per page would unmount the moment
 * it navigated to its second step.
 *
 * "Seen" lives in localStorage rather than the database. It is a per-device UI
 * preference, not a fact about the person, and putting it in Postgres would
 * mean a write on first load and a read that blocks the first paint for
 * everyone who has already seen it. The cost is that it shows once per browser,
 * which for a tour is the right failure direction.
 *
 * A custom event lets anything in the app replay it — Settings → Help does —
 * without threading a callback through the whole tree.
 */

export const TOUR_REPLAY_EVENT = "strivup:tour:replay";

/** Fire from anywhere to start the tour. */
export function startAppTour(): void {
  window.dispatchEvent(new CustomEvent(TOUR_REPLAY_EVENT));
}

export function AppTour() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  /* First visit on this device. Deliberately delayed: starting a spotlight
     while the first screen is still painting measures the wrong box and feels
     like an ambush. Every setState here fires from a timer or a listener. */
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(TOUR_STORAGE_KEY) === "1";
    } catch {
      /* Storage blocked — treat as seen rather than showing it every load. */
    }
    if (seen) return;

    const t = window.setTimeout(() => {
      setIndex(0);
      setOpen(true);
    }, 900);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onReplay = () => {
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, onReplay);
  }, []);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      /* Nothing to do; it will offer itself again next time. */
    }
  }, []);

  /* Skipping counts as seen. Someone who closed it on step two does not want
     it reappearing on their next visit — they want it on demand, which is
     what Settings → Help is for. */
  const close = useCallback(() => {
    markSeen();
    setOpen(false);
  }, [markSeen]);

  const finish = useCallback(() => {
    markSeen();
    setOpen(false);
  }, [markSeen]);

  return (
    <Tour
      steps={TOUR_STEPS}
      open={open}
      index={index}
      onIndexChange={setIndex}
      onClose={close}
      onFinish={finish}
    />
  );
}
