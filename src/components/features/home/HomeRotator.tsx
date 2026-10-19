"use client";

/**
 * HomeRotator — the banner and Today's Tasks, taking turns.
 *
 * Three phases, three seconds each, looping:
 *   0  the Food Quests banner
 *   1  Today's Tasks, showing quests
 *   2  Today's Tasks, showing challenges
 *
 * The rotation stops permanently the moment someone touches it, and does
 * not restart. Today's Tasks is the one thing on this screen people come to
 * act on, and a list that changes under a thumb halfway to a button is
 * worse than no rotation at all. Tapping a dot, tapping the toggle inside
 * the tasks, or simply scrolling the strip all count as "I am reading this
 * now", and the component gets out of the way for the rest of the visit.
 *
 * prefers-reduced-motion starts it on the tasks and never rotates, because
 * content swapping on a timer is the kind of motion that setting is for.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { TodaysTasks } from "@/components/features/TodaysTasks";
import type { TodaySummary, TodayTask } from "@/lib/data/today";

const PHASE_MS = 3000;
const PHASES = ["banner", "quests", "challenges"] as const;
type Phase = (typeof PHASES)[number];

export function HomeRotator({
  summary,
  questTasks,
}: {
  summary: TodaySummary;
  questTasks: TodayTask[];
}) {
  const [phase, setPhase] = useState<Phase>("banner");
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Reduced motion is read into state rather than branched on during
     render: the server has no media query, so reading it inline would
     render "banner" on the server and something else on the client. The
     first read is deferred off the effect body for the same reason the
     rotation is, which is that setState straight from an effect is the
     cascading-render pattern the compiler rejects. Listening for `change`
     also means toggling the OS setting takes effect without a reload. */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    const initial = setTimeout(apply, 0);
    mq.addEventListener("change", apply);
    return () => {
      clearTimeout(initial);
      mq.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    if (paused || reduced) return;

    timer.current = setInterval(() => {
      setPhase((p) => PHASES[(PHASES.indexOf(p) + 1) % PHASES.length]);
    }, PHASE_MS);

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, reduced]);

  /** Any deliberate touch ends the rotation for good. */
  const take = useCallback((next?: Phase) => {
    setPaused(true);
    if (next) setPhase(next);
  }, []);

  /* With reduced motion the banner never gets its turn, so the slot shows
     the tasks, which are the part of this that is actually load-bearing. */
  const shown: Phase = reduced && phase === "banner" ? "challenges" : phase;
  const showingTasks = shown !== "banner";

  return (
    <section
      aria-label="Today"
      className="flex flex-col gap-space-sm"
      onPointerDown={() => take()}
    >
      {shown === "banner" ? (
        <Link
          /* /how-quests-work, not /quests: the artwork's four step labels
             are unreadable at phone width whatever the resolution, and that
             page already explains the same four steps in real text. The
             banner is the hook; the page is the answer. */
          href="/how-quests-work"
          aria-label="How food quests work. Read the steps."
          className="block overflow-hidden rounded-2xl border border-outline-variant elev-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          {/* The artwork is 1672x941. Held at its own ratio rather than
              cropped: it is four labelled steps, and a crop removes one of
              them. priority, because at phase 0 it is the first thing on
              the screen and a banner that fades in late is a layout jump. */}
          <Image
            src="/banners/food-quests.webp"
            alt="Complete food quests: join a quest, generate an order code, add it on Zomato or Swiggy, then upload the bill to verify. Top 5, 10 and 20 users win cash rewards, coupons and discounts every week."
            width={1672}
            height={941}
            priority
            quality={90}
            sizes="(max-width: 672px) 100vw, 672px"
            className="h-auto w-full"
          />
        </Link>
      ) : (
        <TodaysTasks
          summary={summary}
          questTasks={questTasks}
          view={shown === "quests" ? "quests" : "challenges"}
          onViewChange={(v) => take(v)}
        />
      )}

      {/* Dots. Present so the rotation is obviously controllable rather than
          something happening at you, and so phase 0 is reachable again
          after it has gone by. */}
      <div className="flex items-center justify-center gap-1.5" role="tablist" aria-label="Home panels">
        {PHASES.map((p) => {
          const active = p === shown;
          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={
                p === "banner" ? "How food quests work" : `Today's ${p}`
              }
              onClick={() => take(p)}
              className={[
                "h-1.5 rounded-full transition-all duration-300",
                active
                  ? "w-5 bg-secondary"
                  : "w-1.5 bg-outline-variant hover:bg-outline",
              ].join(" ")}
            />
          );
        })}
      </div>

      {/* Screen readers get the phase change announced once, not three times
          a cycle: politeness plus a single live region, and nothing at all
          once someone has taken control. */}
      <span className="sr-only" role="status">
        {paused ? "" : showingTasks ? `Showing today's ${shown}` : "Showing food quests"}
      </span>
    </section>
  );
}
