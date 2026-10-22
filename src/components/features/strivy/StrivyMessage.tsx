"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight, Flame, Sparkles, Target } from "lucide-react";
import type { ChipTone, StrivyReply } from "@/lib/strivy/types";
import { safeHref } from "./chat";
import { messageTime, parseRichText, type Inline } from "./richtext";

/**
 * StrivyMessage — one bubble in the STRIVY chat.
 *
 * Strivy's bubbles can carry fact chips (streak, status) and link buttons that
 * jump to the challenge or quest being talked about. User bubbles are plain.
 */

const CHIP_CLASSES: Record<ChipTone, string> = {
  neutral: "bg-surface-container text-on-surface-variant",
  streak: "bg-secondary-fixed text-on-secondary-fixed-variant",
  success: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  pending: "bg-secondary/10 text-secondary",
  error: "bg-error-container text-on-error-container",
};

/**
 * Strivy's avatar. `state` drives a small, calm animation (see .strivy-avatar
 * in globals.css): "idle" breathes a soft glow now and then, "thinking"
 * pulses while a reply is on its way, "listening" and "speaking" ripple in
 * voice mode. Bubble avatars have no state and just pop in with the message.
 * All of it is off under prefers-reduced-motion.
 */
export type AvatarState = "idle" | "thinking" | "listening" | "speaking";

export function StrivyAvatar({ size = 28, state }: { size?: number; state?: AvatarState }) {
  return (
    <span
      aria-hidden="true"
      data-state={state}
      className="strivy-avatar relative flex shrink-0 items-center justify-center rounded-full bg-secondary text-on-secondary"
      style={{ width: size, height: size }}
    >
      <Sparkles size={Math.round(size * 0.5)} strokeWidth={2.25} />
    </span>
  );
}

export function UserMessage({ text, id }: { text: string; id?: string }) {
  const time = id ? messageTime(id) : null;
  return (
    <div className="strivy-msg flex flex-col items-end gap-1">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[15px] leading-6 text-on-primary shadow-sm">
        {text}
      </p>
      {time && <span className="px-1 text-[11px] text-on-surface-variant/80">{time}</span>}
    </div>
  );
}

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-semibold">
            {p.text}
          </strong>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        )
      )}
    </>
  );
}

/**
 * The reply text: paragraphs, line breaks, bullets and bold, built as React
 * elements from parsed data (no HTML strings), so markup in a reply can't
 * render and raw Markdown syntax never shows.
 */
export function RichText({ text }: { text: string }) {
  const blocks = parseRichText(text);
  return (
    <div className="flex flex-col gap-2 break-words text-[15px] leading-6 text-on-surface">
      {blocks.map((b, i) =>
        b.kind === "paragraph" ? (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <InlineText parts={line} />
              </Fragment>
            ))}
          </p>
        ) : b.ordered ? (
          <ol key={i} className="flex list-decimal flex-col gap-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>
                <InlineText parts={item} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="flex flex-col gap-1">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-secondary"
                />
                <span className="min-w-0">
                  <InlineText parts={item} />
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

/** Quest links get a target, challenge links a flame: a card, not a bare pill. */
function linkIcon(href: string) {
  if (href.startsWith("/quests/"))
    return <Target size={15} aria-hidden="true" className="shrink-0" />;
  if (href.startsWith("/challenges/"))
    return <Flame size={15} aria-hidden="true" className="shrink-0" />;
  return null;
}

export function StrivyMessage({
  reply,
  onNavigate,
  id,
}: {
  reply: Pick<StrivyReply, "text" | "chips" | "links">;
  onNavigate?: () => void;
  /** The message id, for its timestamp. */
  id?: string;
}) {
  // Only STRIVUP pages; anything else is dropped rather than trusted.
  const links = reply.links.filter((l) => safeHref(l.href) !== null);
  const time = id ? messageTime(id) : null;
  return (
    <div className="strivy-msg flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <StrivyAvatar />
        <div className="flex min-w-0 max-w-[85%] flex-col gap-1.5">
          <div className="rounded-2xl rounded-bl-md border border-outline-variant/50 bg-surface-container-low px-3.5 py-2.5 shadow-sm">
            <RichText text={reply.text} />
            {reply.chips.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {reply.chips.map((chip) => (
                  <span
                    key={chip.label}
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${CHIP_CLASSES[chip.tone]}`}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          {links.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {links.map((link) => (
                <Link
                  key={link.href + link.label}
                  href={link.href}
                  onClick={onNavigate}
                  className="group inline-flex max-w-full items-center gap-2 self-start rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[13px] font-semibold text-secondary shadow-sm transition-colors hover:border-secondary hover:bg-secondary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                >
                  {linkIcon(link.href)}
                  <span className="truncate">{link.label}</span>
                  <ChevronRight
                    size={14}
                    aria-hidden="true"
                    className="shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      {time && <span className="pl-9 text-[11px] text-on-surface-variant/80">{time}</span>}
    </div>
  );
}
