"use client";

import { Sparkles, X } from "lucide-react";
import type { ShownLine } from "@/lib/strivy/companion/engine";

/**
 * StrivyCompanionPopup — one short playful line from STRIVY.
 *
 * Near the launcher when the chat is closed (tapping it opens the chat), at
 * the top of the screen while the chat is open. Announced politely to
 * screen readers, never steals focus, and the × closes it (which also
 * snoozes further popups; see recordDismiss). It hides by itself after a
 * few seconds otherwise. The text is from the hand-written library in
 * src/lib/strivy/companion/messages.ts, never generated.
 */
export function StrivyCompanionPopup({
  line,
  panelOpen,
  onOpen,
  onDismiss,
}: {
  line: ShownLine;
  panelOpen: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const place = panelOpen
    ? "left-1/2 top-3 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 md:[bottom:auto] md:top-6"
    : "right-4 w-[min(17rem,calc(100vw-2rem))] [bottom:calc(var(--bottom-nav-h)+5.25rem)] md:right-6 md:[bottom:5.75rem]";
  return (
    <div className={`fixed z-[70] ${place}`}>
      <div
        role="status"
        aria-live="polite"
        data-companion={line.id}
        className="strivy-companion flex items-start gap-2 rounded-2xl rounded-br-md border border-outline-variant bg-surface-container-lowest p-3 pr-2 text-on-surface shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
      >
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-on-secondary"
        >
          <Sparkles size={14} strokeWidth={2.25} />
        </span>
        {panelOpen ? (
          <p className="min-w-0 flex-1 whitespace-pre-line text-[13.5px] leading-snug">
            {line.text}
          </p>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`${line.text.replace(/\n/g, " ")} Open Strivy`}
            className="min-w-0 flex-1 whitespace-pre-line rounded-lg text-left text-[13.5px] leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            {line.text}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss Strivy's message"
          title="Not now"
          className="-mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
