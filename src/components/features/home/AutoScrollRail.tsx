"use client";

/**
 * AutoScrollRail — the Active Challenges and Quests rail, scrolling itself.
 *
 * The rail is the first thing on the home page now, and a row of cards that
 * sits still reads as a static banner: people swipe the feed past it without
 * ever learning there is more than one card. Moving it slowly is what says
 * "there is more to the right".
 *
 * How the loop is seamless. The children are rendered twice, side by side.
 * The rail scrolls right, and the moment it has travelled exactly the width
 * of the first copy it jumps back by that same width. The pixels under the
 * viewport are identical across that jump, so there is no snap, no blank
 * gap, and no visible restart. The second copy is aria-hidden and inert, so
 * neither a screen reader nor the Tab key ever reaches a duplicate card.
 *
 * It stops rather than fights the person:
 *   - prefers-reduced-motion means it never moves at all
 *   - pointer over the rail, or keyboard focus inside it, pauses it, so a
 *     card can be hovered and read (the quest bulge needs a still target)
 *   - a touch or a manual scroll pauses it and it stays paused until the
 *     person has been idle for a moment
 *   - a hidden tab pauses it, so a backgrounded page burns no frames
 *
 * Duplication only happens when the content is actually wider than the
 * viewport. With one or two cards there is nothing to scroll, so there is no
 * second copy to see.
 *
 * Scroll snapping is deliberately off while this is running: snap points and
 * a programmatic scrollLeft pull against each other every frame.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** Pixels per second. Slow enough to read a card title as it passes. */
const SPEED = 26;
/** How long after the last manual scroll before the rail takes over again. */
const RESUME_AFTER_MS = 2500;

export function AutoScrollRail({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const [canLoop, setCanLoop] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [paused, setPaused] = useState(false);

  /* Reduced motion. Resolved after mount rather than in the effect body:
     a synchronous setState during an effect is the cascading render the
     React Compiler lint rejects, and this starts pessimistic (no motion)
     so nothing moves before the preference is known. */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    const id = window.setTimeout(apply, 0);
    mq.addEventListener("change", apply);
    return () => {
      window.clearTimeout(id);
      mq.removeEventListener("change", apply);
    };
  }, []);

  /* Is there anything to loop? Measured, not guessed: the rail only grows a
     second copy once the first one is wider than the space it has. */
  useEffect(() => {
    const viewport = viewportRef.current;
    const group = groupRef.current;
    if (!viewport || !group) return;

    const measure = () => {
      setCanLoop(group.scrollWidth > viewport.clientWidth + 8);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    ro.observe(group);
    const id = window.requestAnimationFrame(measure);
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(id);
    };
  }, [children]);

  /* Pause while a tab is in the background. */
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /* The drive loop. */
  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const group = groupRef.current;
    if (!viewport || !track || !group) return;
    if (!canLoop || reduced || paused) return;

    let frame = 0;
    let last = 0;
    // Where we believe the rail is, as a float. scrollLeft rounds to whole
    // pixels, so keeping the fraction here is what stops 26px/s from
    // degenerating into a stutter of 0px and 1px jumps.
    let pos = viewport.scrollLeft;
    // What we last wrote, so a scroll the person made can be told apart from
    // the one we made and adopted instead of overwritten.
    let written = pos;

    const cycle = () => {
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return group.scrollWidth + gap;
    };

    const step = (now: number) => {
      if (last === 0) last = now;
      // Clamped: a tab that was throttled should not teleport the rail.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (Math.abs(viewport.scrollLeft - written) > 2) pos = viewport.scrollLeft;

      const span = cycle();
      if (span > 0) {
        pos += SPEED * dt;
        // The seamless part. One copy back is the same picture.
        if (pos >= span) pos -= span;
        viewport.scrollLeft = pos;
        written = viewport.scrollLeft;
      }

      frame = window.requestAnimationFrame(step);
    };

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [canLoop, reduced, paused]);

  /* A manual scroll or a touch hands control over for a moment. */
  const idleTimer = useRef<number | null>(null);
  const holdForUser = useCallback(() => {
    setPaused(true);
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setPaused(false), RESUME_AFTER_MS);
  }, []);

  useEffect(
    () => () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    },
    []
  );

  const autoScrolling = canLoop && !reduced;

  return (
    <div
      ref={viewportRef}
      aria-label={label}
      className={[
        "no-scrollbar -mx-gutter overflow-x-auto overscroll-x-contain px-gutter pb-2",
        // Snap points and a per-frame scrollLeft fight each other, so snapping
        // is only on when the rail is standing still.
        autoScrolling ? "" : "snap-x snap-mandatory",
      ].join(" ")}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onPointerDown={holdForUser}
      onTouchStart={holdForUser}
      onWheel={holdForUser}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div ref={trackRef} className="flex w-max gap-space-md">
        <div ref={groupRef} className="flex gap-space-md">
          {children}
        </div>

        {/* The second copy exists only to be scrolled into. It is hidden from
            assistive technology and removed from the tab order, so the rail
            still announces each challenge exactly once. */}
        {canLoop && !reduced ? (
          <div className="flex gap-space-md" aria-hidden="true" inert>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
