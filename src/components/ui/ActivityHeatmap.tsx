"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * ActivityHeatmap — a contribution-style consistency grid.
 *
 * One square per day, weeks as columns, five tints for how much was posted.
 * Adapted from the reference design, in StrivUp's blues.
 *
 * WHAT CAME ACROSS: the layout and the interaction model — month and weekday
 * labels, a single tooltip shared by the whole grid, arrow-key navigation,
 * the Less/More legend, a summary line, and the diagonal wave as the grid
 * first appears.
 *
 * WHAT DID NOT: `motion/react`. The reference also leans on it for a
 * digit-rolling total and blur crossfades between tooltip strings — lovely,
 * but they need AnimatePresence to be worth having, and that is a dependency
 * this project does not carry. The wave and the tooltip move on CSS instead.
 */

export interface ActivityDay {
  /** Calendar day, YYYY-MM-DD. */
  date: string;
  count: number;
}

const DAY_MS = 86_400_000;
/** Total travel time of the reveal wave, however many weeks are on screen. */
const WAVE_MS = 420;

const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Level tints. Deliberately the brand blue stepping up in opacity rather than
 * five hand-picked colours: the ramp stays correct if --color-secondary ever
 * changes, and every step keeps the same hue so the grid reads as one scale.
 */
const LEVEL_BG = [
  "bg-surface-container",
  "bg-secondary/25",
  "bg-secondary/45",
  "bg-secondary/70",
  "bg-secondary",
] as const;

interface Model {
  start: number;
  length: number;
  /** Blank cells before the first real day, so columns line up with weekdays. */
  lead: number;
  weeks: number;
  total: number;
  counts: number[];
  levels: number[];
  thresholds: [number, number, number];
  months: { col: number; label: string }[];
}

function buildModel(
  days: ActivityDay[],
  weekStartsOn: 0 | 1,
  rangeDays: number,
  locale: string
): Model {
  // The range is always the trailing window ending today, so an empty account
  // still gets a full grid instead of a single square.
  const today = Date.parse(`${toIso(Date.now())}T00:00:00Z`);
  const start = today - (rangeDays - 1) * DAY_MS;
  const length = rangeDays;

  const counts = new Array<number>(length).fill(0);
  for (const day of days) {
    const t = toUtc(day.date);
    if (!Number.isFinite(t)) continue;
    const i = Math.round((t - start) / DAY_MS);
    if (i >= 0 && i < length) counts[i] += Math.max(0, day.count);
  }

  const max = counts.reduce((a, b) => Math.max(a, b), 0);
  const thresholds: [number, number, number] = [
    Math.max(1, Math.ceil(max * 0.25)),
    Math.max(2, Math.ceil(max * 0.5)),
    Math.max(3, Math.ceil(max * 0.75)),
  ];
  const levels = counts.map((n) =>
    n <= 0 ? 0 : n <= thresholds[0] ? 1 : n <= thresholds[1] ? 2 : n <= thresholds[2] ? 3 : 4
  );

  const lead = (new Date(start).getUTCDay() - weekStartsOn + 7) % 7;
  const weeks = Math.ceil((lead + length) / 7);

  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const months: Model["months"] = [];
  for (let i = 0; i < length; i++) {
    const d = new Date(start + i * DAY_MS);
    if (i === 0 || d.getUTCDate() === 1) {
      months.push({ col: Math.floor((lead + i) / 7), label: monthFmt.format(d) });
    }
  }
  // A partial first month keeps its label only if there is room before the next.
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();

  return {
    start,
    length,
    lead,
    weeks,
    total: counts.reduce((a, b) => a + b, 0),
    counts,
    levels,
    thresholds,
    months,
  };
}

export function ActivityHeatmap({
  days,
  label,
  period,
  unit = { one: "proof", other: "proofs" },
  rangeDays = 182,
  weekStartsOn = 0,
  locale = "en-GB",
  actions,
  className = "",
}: {
  days: ActivityDay[];
  /** Accessible name for the grid. */
  label: string;
  /** Finishes the summary: "12 proofs in {period}". */
  period: string;
  unit?: { one: string; other: string };
  /** Length of the trailing window. Six months fits a phone without scrolling. */
  rangeDays?: number;
  weekStartsOn?: 0 | 1;
  locale?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  const model = useMemo(
    () => buildModel(days, weekStartsOn, rangeDays, locale),
    [days, weekStartsOn, rangeDays, locale]
  );

  const fmt = useMemo(
    () => ({
      long: new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      short: new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }),
      number: new Intl.NumberFormat(locale),
    }),
    [locale]
  );

  // The reveal runs once, a frame after mount, so the wave is visible rather
  // than already finished on first paint.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const [tip, setTip] = useState<{ index: number; x: number; y: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const noun = (n: number) => (n === 1 ? unit.one : unit.other);

  const describe = (index: number) => {
    const n = model.counts[index];
    const d = new Date(model.start + index * DAY_MS);
    return {
      primary: n ? `${fmt.number.format(n)} ${noun(n)}` : `No ${unit.other}`,
      secondary: fmt.short.format(d),
      full: `${n ? fmt.number.format(n) : "No"} ${noun(n)}, ${fmt.long.format(d)}`,
    };
  };

  const showTip = (index: number, cell: HTMLElement) => {
    const grid = gridRef.current;
    if (!grid) return;
    const g = grid.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    setTip({ index, x: c.left - g.left + c.width / 2, y: c.top - g.top });
  };

  const focusDay = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), model.length - 1);
    gridRef.current?.querySelector<HTMLElement>(`[data-index="${clamped}"]`)?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (!target) return;
    const i = Number(target.dataset.index);
    // Up/down move a day, left/right move a week — the grid's own axes.
    const moves: Record<string, number> = {
      ArrowUp: i - 1,
      ArrowDown: i + 1,
      ArrowLeft: i - 7,
      ArrowRight: i + 7,
      Home: 0,
      End: model.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      focusDay(moves[event.key]);
    } else if (event.key === "Escape") {
      setTip(null);
    }
  };

  const maxDiagonal = Math.max(1, model.weeks - 1 + 6);
  const step = Math.min(12, WAVE_MS / maxDiagonal);
  const weekdayLabels = Array.from({ length: 7 }, (_, row) => {
    const weekday = (row + weekStartsOn) % 7;
    // 4 Jan 1970 was a Sunday; every other row keeps the column readable.
    return weekday % 2 === 1 ? fmt.weekday.format(new Date((3 + weekday) * DAY_MS)) : "";
  });

  const [t1, t2, t3] = model.thresholds;
  const legendRanges = [
    `no ${unit.other}`,
    t1 === 1 ? `1 ${unit.one}` : `1 to ${t1} ${unit.other}`,
    `${t1 + 1} to ${t2} ${unit.other}`,
    `${t2 + 1} to ${t3} ${unit.other}`,
    `${t3 + 1} or more ${unit.other}`,
  ];

  const tipInfo = tip ? describe(tip.index) : null;

  return (
    <div className={`w-full ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-md text-on-surface-variant">
          <span className="font-bold text-on-surface">
            {fmt.number.format(model.total)} {noun(model.total)}
          </span>{" "}
          in {period}
        </p>
        {actions}
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          {/* Month labels sit on the same column track as the grid below. */}
          <div
            aria-hidden="true"
            // Fixed 13px tracks, matching the grid's cells exactly. With 1fr
            // the label row stretched to the container while the grid stayed
            // intrinsically sized, so the months drifted right of their weeks.
            className="mb-1 grid gap-[3px] pl-7 text-label-sm text-on-surface-variant"
            style={{ gridTemplateColumns: `repeat(${model.weeks}, 13px)` }}
          >
            {model.months.map((m, i) => (
              <span
                key={`${m.label}-${i}`}
                // min-w-0 matters: a grid item defaults to min-width:auto, so
                // "Sept" in a 13px track widens the track and drags every
                // later month out of line with its week.
                className="min-w-0"
                style={{ gridColumnStart: m.col + 1 }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex gap-1">
            <div
              aria-hidden="true"
              className="grid w-6 shrink-0 gap-[3px] text-label-sm leading-none text-on-surface-variant"
            >
              {weekdayLabels.map((text, row) => (
                <span key={row} className="flex h-[13px] items-center">
                  {text}
                </span>
              ))}
            </div>

            <div className="relative">
              <div
                ref={gridRef}
                role="grid"
                aria-label={label}
                aria-readonly="true"
                onKeyDown={onKeyDown}
                onPointerLeave={() => setTip(null)}
                className="grid grid-flow-col gap-[3px]"
                style={{ gridTemplateRows: "repeat(7, 13px)" }}
              >
                {Array.from({ length: model.weeks }, (_, col) =>
                  Array.from({ length: 7 }, (_, row) => {
                    const index = col * 7 + row - model.lead;
                    const inRange = index >= 0 && index < model.length;
                    const delay = Math.round((col + row) * step);

                    if (!inRange) {
                      return (
                        <span
                          key={`${col}-${row}`}
                          aria-hidden="true"
                          className="h-[13px] w-[13px] rounded-[3px]"
                        />
                      );
                    }

                    const info = describe(index);
                    return (
                      <span
                        key={`${col}-${row}`}
                        role="gridcell"
                        data-index={index}
                        tabIndex={index === model.length - 1 ? 0 : -1}
                        aria-label={info.full}
                        onPointerEnter={(e) => showTip(index, e.currentTarget)}
                        onFocus={(e) => showTip(index, e.currentTarget)}
                        onBlur={() => setTip(null)}
                        style={{ transitionDelay: revealed ? `${delay}ms` : "0ms" } as CSSProperties}
                        className={[
                          "heat-cell h-[13px] w-[13px] rounded-[3px]",
                          LEVEL_BG[model.levels[index]],
                          revealed ? "opacity-100" : "scale-75 opacity-0",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1",
                        ].join(" ")}
                      />
                    );
                  })
                )}
              </div>

              {tipInfo ? (
                <div
                  role="tooltip"
                  aria-hidden="true"
                  className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-inverse-surface px-2.5 py-1.5 elev-3"
                  style={{ left: tip!.x, top: tip!.y - 6 }}
                >
                  <p className="whitespace-nowrap text-label-sm font-semibold text-inverse-on-surface">
                    {tipInfo.primary}
                  </p>
                  <p className="whitespace-nowrap text-label-sm text-inverse-on-surface/70">
                    {tipInfo.secondary}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5">
        <span className="sr-only">
          Darker squares mean more {unit.other}. Levels: {legendRanges.join(", ")}.
        </span>
        <span aria-hidden="true" className="text-label-sm text-on-surface-variant">
          Less
        </span>
        {LEVEL_BG.map((bg, level) => (
          <span
            key={level}
            aria-hidden="true"
            title={legendRanges[level]}
            className={`h-[11px] w-[11px] rounded-[3px] ${bg}`}
          />
        ))}
        <span aria-hidden="true" className="text-label-sm text-on-surface-variant">
          More
        </span>
      </div>
    </div>
  );
}
