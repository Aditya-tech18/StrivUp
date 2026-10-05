"use client";

import { useEffect, useState } from "react";

/**
 * RotatingWord — the swapping word in the entry-screen headline.
 *
 * The reference design does this with framer-motion. That would have been the
 * project's tenth runtime dependency, plus @radix-ui/react-slot and
 * class-variance-authority for the Button it imports — a lot of bundle on the
 * first screen a student loads over mobile data, for one animation on one
 * page. The spring is a transform and an opacity, so it is a CSS transition
 * here and the dependency list is unchanged. If you want true spring physics
 * later, this is the one component to swap.
 *
 * Mechanics: every word is stacked in the same grid cell, so the box is as
 * wide and tall as the longest word and the headline never reflows as they
 * swap. The outgoing word leaves in the direction the list is travelling,
 * which is what makes it read as a reel rather than a crossfade.
 */
export function RotatingWord({
  words,
  /** Milliseconds each word is held. */
  interval = 2200,
  className = "",
}: {
  words: string[];
  interval?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (words.length <= 1) return;
    // Advancing from a timer rather than synchronously in the effect body —
    // the latter is what react-hooks/set-state-in-effect exists to catch.
    const id = setTimeout(() => setIndex((n) => (n + 1) % words.length), interval);
    return () => clearTimeout(id);
  }, [index, interval, words.length]);

  return (
    <span className={`relative grid ${className}`}>
      {words.map((word, i) => {
        const isCurrent = i === index;
        // Words already shown exit upward, words still to come wait below.
        const resting = i < index ? "-translate-y-full" : "translate-y-full";
        return (
          <span
            key={word}
            // Every word occupies the same cell, so the widest one sizes the box.
            style={{ gridArea: "1 / 1" }}
            // Every word is hidden from assistive tech, not just the inactive
            // ones: the sr-only list below reads them all once, in order. Had
            // only the inactive words been hidden, the headline's accessible
            // name would change every couple of seconds and a screen reader
            // would re-announce it.
            aria-hidden="true"
            className={[
              "rotating-word text-center",
              isCurrent ? "translate-y-0 opacity-100" : `${resting} opacity-0`,
            ].join(" ")}
          >
            {word}
          </span>
        );
      })}
      <span className="sr-only">{words.join(", ")}</span>
    </span>
  );
}
