"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

/**
 * Tour — the guided walkthrough shell.
 *
 * A spotlight cut out of a dimmed page, with a card beside it. The reference
 * design used framer-motion for the movement; this uses CSS transitions on the
 * same cubic-bezier the sidebar rail already animates with, so the tour feels
 * like part of the app rather than a widget bolted onto it, and the project
 * stays at nine runtime dependencies.
 *
 * WHAT MAKES THIS HARDER THAN A ONE-PAGE TOUR
 * -------------------------------------------
 * StrivUp's features live on a dozen routes, so a step can name a `route` and
 * the tour navigates there first, then waits for the target to exist. Pages
 * are server-rendered and arrive late, which is why resolution polls rather
 * than measuring once.
 *
 * A new account is also empty by definition — no proofs, no challenges, no
 * followers. So steps that would point at content nobody has yet carry no
 * target at all and present as a centred card. Spotlighting an absent feed
 * card would be worse than not spotlighting anything.
 *
 * Nav lives in two places — the desktop rail and the mobile bottom bar — and
 * only one is on screen at a time. Both carry the same `data-tour` value and
 * the resolver takes the first VISIBLE match, so one step description serves
 * both layouts without branching on a breakpoint.
 */

export type TourPlacement = "top" | "bottom" | "left" | "right" | "auto" | "center";

export interface TourStep {
  /** Stable key, also used as the progress-cell key. */
  id: string;
  title: string;
  body: ReactNode;
  /** CSS selector. The first visible match wins. Omit for a centred card. */
  target?: string;
  /** Navigate here before showing this step. */
  route?: string;
  placement?: TourPlacement;
  padding?: number;
  /** Shown as a small kicker above the title — the section being toured. */
  chapter?: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Matches the rail's easing, so every moving surface in the app agrees. */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const MOVE_MS = 320;
/** How long to wait for a route's target to appear before giving up on it. */
const RESOLVE_TIMEOUT_MS = 2500;
const POLL_MS = 90;

/**
 * The first match that is actually on screen. `offsetParent` is null for
 * anything display:none, which is exactly how the rail and the bottom nav hide
 * from each other across the md breakpoint.
 */
function findVisibleTarget(selector: string): HTMLElement | null {
  const matches = Array.from(document.querySelectorAll<HTMLElement>(selector));
  for (const el of matches) {
    const rect = el.getBoundingClientRect();
    if (el.offsetParent !== null && rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

export function Tour({
  steps,
  open,
  index,
  onIndexChange,
  onClose,
  onFinish,
}: {
  steps: TourStep[];
  open: boolean;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onFinish: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const cardRef = useRef<HTMLDivElement>(null);

  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState({ w: 340, h: 200 });
  const [viewport, setViewport] = useState({ w: 1024, h: 768 });

  const step = steps[index];
  const count = steps.length;
  const isFirst = index === 0;
  const isLast = index === count - 1;
  const pad = step?.padding ?? 8;

  /* ── Navigation ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open || !step?.route) return;
    if (pathname === step.route) return;
    router.push(step.route);
  }, [open, step?.route, pathname, router, step]);

  /* ── Measurement ─────────────────────────────────────────────────────────
     Every setState here fires from a timer, a listener or an observer — never
     synchronously from the effect body, which is the cascading-render pattern
     react-hooks/set-state-in-effect rejects. The poll exists because a step
     that navigates has to wait for the new route to paint. */
  useEffect(() => {
    if (!open || !step) return;

    let cancelled = false;
    let settled = false;
    const startedAt = Date.now();

    const measure = () => {
      if (cancelled) return;
      setViewport({ w: window.innerWidth, h: window.innerHeight });

      if (!step.target) {
        setRect(null);
        settled = true;
        return;
      }

      const el = findVisibleTarget(step.target);
      if (!el) {
        /* Give up only after the timeout: until then the page may still be
           arriving. Falling back to a centred card means a step whose target
           never appears still reads, instead of the tour stalling. */
        if (Date.now() - startedAt > RESOLVE_TIMEOUT_MS) {
          setRect(null);
          settled = true;
        }
        return;
      }

      if (!settled) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        settled = true;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const poll = window.setInterval(measure, POLL_MS);
    const onScroll = () => measure();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, index, step, pathname]);

  /* Card size, measured from the DOM after it renders. Also from a timer, for
     the same reason as above. */
  useEffect(() => {
    if (!open) return;
    const read = () => {
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCardSize((prev) =>
        Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1
          ? prev
          : { w: r.width, h: r.height }
      );
    };
    const t = window.setInterval(read, POLL_MS);
    return () => window.clearInterval(t);
  }, [open, index]);

  /* ── The rail ────────────────────────────────────────────────────────────
     The desktop rail is collapsed to icons and only widens on hover, so a
     spotlight on a nav item would frame an icon with its label clipped off.
     This pins it open for the duration; the CSS lives beside .rail so the two
     rules are read together. */
  useEffect(() => {
    if (!open) return;
    document.documentElement.setAttribute("data-tour-open", "true");
    return () => document.documentElement.removeAttribute("data-tour-open");
  }, [open]);

  const next = useCallback(() => {
    if (isLast) onFinish();
    else onIndexChange(index + 1);
  }, [isLast, onFinish, onIndexChange, index]);

  const back = useCallback(() => {
    if (!isFirst) onIndexChange(index - 1);
  }, [isFirst, onIndexChange, index]);

  /* ── Keyboard ────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Tab") {
        /* Focus stays in the card: everything behind it is inert for the
           duration, and tabbing into a dimmed page is a dead end. */
        const focusables = cardRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, onClose]);

  /* Move focus onto the card when the step changes, so a screen reader lands
     on the new copy instead of staying wherever the last click left it. */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      cardRef.current?.querySelector<HTMLElement>("[data-tour-primary]")?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [open, index]);

  /* No mounted flag: the usual useState/useEffect portal guard is the exact
     cascading-render pattern react-hooks/set-state-in-effect rejects, and it
     is not needed here. The tour renders null until a timer opens it, which
     is long after hydration, so the server and the client agree on null at
     the only moment they are compared. */
  if (typeof document === "undefined" || !open || !step) return null;

  /* ── Placement ───────────────────────────────────────────────────────── */
  const gap = 14;
  let place: TourPlacement = step.placement ?? "auto";
  if (!rect) place = "center";
  if (place === "auto" && rect) {
    if (rect.top + rect.height + gap + cardSize.h < viewport.h) place = "bottom";
    else if (rect.top - gap - cardSize.h > 0) place = "top";
    else if (rect.left + rect.width + gap + cardSize.w < viewport.w) place = "right";
    else place = "left";
  }

  let left = viewport.w / 2 - cardSize.w / 2;
  let top = viewport.h / 2 - cardSize.h / 2;
  if (rect && place !== "center") {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (place === "bottom") {
      left = cx - cardSize.w / 2;
      top = rect.top + rect.height + gap + pad;
    } else if (place === "top") {
      left = cx - cardSize.w / 2;
      top = rect.top - gap - pad - cardSize.h;
    } else if (place === "right") {
      left = rect.left + rect.width + gap + pad;
      top = cy - cardSize.h / 2;
    } else {
      left = rect.left - gap - pad - cardSize.w;
      top = cy - cardSize.h / 2;
    }
  }
  left = Math.min(Math.max(12, left), Math.max(12, viewport.w - 12 - cardSize.w));
  top = Math.min(Math.max(12, top), Math.max(12, viewport.h - 12 - cardSize.h));

  const spot = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label={`Tour: ${step.title}`}>
      {/* The dim, as four bands around the hole rather than one enormous
          spread shadow on the cut-out.
          `box-shadow: 0 0 0 9999px` is the usual trick and it is the reason
          this is written out longhand: the compositor clipped the shadow a
          few hundred pixels out, so the right and bottom of the page were
          left undimmed while the top-left looked correct. Four rectangles
          are exact at any viewport size, and they animate on the same
          transition the spotlight does. */}
      {spot ? (
        <>
          <div
            className="tour-band"
            style={{ top: 0, left: 0, width: "100%", height: Math.max(0, spot.top) }}
            aria-hidden="true"
          />
          <div
            className="tour-band"
            style={{
              top: spot.top + spot.height,
              left: 0,
              width: "100%",
              bottom: 0,
            }}
            aria-hidden="true"
          />
          <div
            className="tour-band"
            style={{
              top: spot.top,
              left: 0,
              width: Math.max(0, spot.left),
              height: spot.height,
            }}
            aria-hidden="true"
          />
          <div
            className="tour-band"
            style={{
              top: spot.top,
              left: spot.left + spot.width,
              right: 0,
              height: spot.height,
            }}
            aria-hidden="true"
          />
          <div
            className="tour-spot"
            style={{
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
            }}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className="tour-dim" aria-hidden="true" />
      )}

      <div
        ref={cardRef}
        className="tour-card"
        style={{ left, top }}
        /* The card sits over a dimmed page; a click inside it must never
           reach whatever is underneath. */
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {step.chapter ? (
              <p className="text-label-sm font-bold uppercase tracking-wider text-secondary">
                {step.chapter}
              </p>
            ) : null}
            <h2 className="mt-0.5 text-body-lg font-bold leading-snug text-on-surface">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tour"
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-2 text-body-md leading-relaxed text-on-surface-variant">
          {step.body}
        </div>

        {/* Progress as a streak bar — the same filled-cell language the
            activity heatmap uses, so the tour teaches the motif while it
            runs. */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div
            className="flex flex-wrap items-center gap-[3px]"
            role="img"
            aria-label={`Stop ${index + 1} of ${count}`}
          >
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={[
                  "tour-cell",
                  i < index ? "tour-cell--done" : "",
                  i === index ? "tour-cell--now" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {!isFirst && (
              <button
                type="button"
                onClick={back}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-label-md font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                <ArrowLeft size={13} aria-hidden="true" />
                Back
              </button>
            )}
            <button
              type="button"
              data-tour-primary
              onClick={next}
              className="inline-flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-label-md font-semibold text-on-secondary transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
            >
              {isLast ? "Start building" : "Next"}
              {!isLast && <ArrowRight size={13} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <p className="mt-2 text-label-sm text-on-surface-variant">
          Stop {index + 1} of {count} · Esc to leave, arrows to move
        </p>
      </div>

      <style>{`
        /* 90, not 70: the PWA install prompt sits at 80 and was floating
           over the spotlight. The band list is documented beside .rail. */
        .tour-root { position: fixed; inset: 0; z-index: 90; }
        .tour-dim {
          position: absolute; inset: 0;
          background: color-mix(in srgb, var(--color-on-surface) 55%, transparent);
          animation: tour-fade 200ms ${EASE};
        }
        .tour-band {
          position: absolute;
          background: color-mix(in srgb, var(--color-on-surface) 55%, transparent);
          transition:
            top ${MOVE_MS}ms ${EASE},
            left ${MOVE_MS}ms ${EASE},
            width ${MOVE_MS}ms ${EASE},
            height ${MOVE_MS}ms ${EASE};
        }
        .tour-spot {
          position: absolute;
          border-radius: 14px;
          pointer-events: none;
          box-shadow:
            0 0 0 2px var(--color-secondary),
            0 0 0 7px color-mix(in srgb, var(--color-secondary) 28%, transparent);
          transition:
            top ${MOVE_MS}ms ${EASE},
            left ${MOVE_MS}ms ${EASE},
            width ${MOVE_MS}ms ${EASE},
            height ${MOVE_MS}ms ${EASE};
        }
        .tour-card {
          position: absolute;
          width: 340px;
          max-width: calc(100vw - 24px);
          border-radius: 16px;
          border: 1px solid var(--color-outline-variant);
          background: var(--color-surface-container-lowest);
          padding: 16px;
          box-shadow: var(--shadow-e3, 0 12px 40px rgba(0,0,0,0.22));
          transition: left ${MOVE_MS}ms ${EASE}, top ${MOVE_MS}ms ${EASE};
          animation: tour-pop 220ms ${EASE};
        }
        .tour-cell {
          width: 9px; height: 9px; border-radius: 2px;
          background: color-mix(in srgb, var(--color-secondary) 14%, transparent);
          transition: background-color 260ms ${EASE}, transform 260ms ${EASE};
        }
        .tour-cell--done { background: color-mix(in srgb, var(--color-secondary) 55%, transparent); }
        .tour-cell--now  { background: var(--color-secondary); transform: scale(1.25); }

        @keyframes tour-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes tour-pop {
          from { opacity: 0; transform: translateY(6px) scale(0.98) }
          to   { opacity: 1; transform: none }
        }

        @media (prefers-reduced-motion: reduce) {
          .tour-spot, .tour-band, .tour-card, .tour-cell { transition: none; }
          .tour-card, .tour-dim { animation: none; }
          .tour-cell--now { transform: none; outline: 2px solid var(--color-secondary); }
        }
      `}</style>
    </div>,
    document.body
  );
}
