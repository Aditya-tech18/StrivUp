"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * ActivityHeatmap — a consistency grid, grouped by calendar month.
 *
 * One square per day, seven rows for the seven weekdays, and each month in
 * its own block with a gap and a label beneath it.
 *
 * WHY MONTH BLOCKS AND NOT ONE CONTINUOUS STRIP. The usual contribution graph
 * runs weeks end to end and drops a month label on whichever column the 1st
 * happens to land in. Because a week straddles two months, that label is only
 * ever approximately over its month, and the longer the range the more it
 * drifts. Breaking the strip at each month boundary means a label sits over
 * exactly the days it names — you can point at March and be right. The cost
 * is a partial column where months meet, which is the correct trade: this
 * chart is read as "how was my March", not "how was week 11".
 *
 * NO MOTION LIBRARY. The reference drives this with motion/react, including a
 * digit-rolling total and blurred tooltip crossfades. Those need
 * AnimatePresence to be worth having and this project does not carry that
 * dependency; the reveal wave and the tooltip run on CSS.
 */

export interface ActivityDay {
  /** Calendar day, YYYY-MM-DD. */
  date: string;
  count: number;
}

const DAY_MS = 86_400_000;
/** Total travel of the reveal wave, however many months are on screen. */
const WAVE_MS = 420;
const CELL = 13;
const GAP = 3;

const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utcDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * Level tints: the brand blue stepping up in opacity rather than five picked
 * shades, so the ramp stays correct if --color-secondary moves and every step
 * keeps the same hue.
 */
const LEVEL_BG = [
  "bg-surface-container",
  "bg-secondary/25",
  "bg-secondary/45",
  "bg-secondary/70",
  "bg-secondary",
] as const;

interface MonthBlock {
  label: string;
  /** Weekday row the 1st rendered day of this month sits on. */
  lead: number;
  /** Day indices into the flat arrays, in calendar order. */
  indices: number[];
  cols: number;
}

interface Model {
  start: number;
  length: number;
  total: number;
  counts: number[];
  levels: number[];
  thresholds: [number, number, number];
  months: MonthBlock[];
}

function buildModel(
  days: ActivityDay[],
  weekStartsOn: 0 | 1,
  rangeDays: number,
  locale: string
): Model {
  // Always the trailing window ending today, so an empty account still gets a
  // full grid rather than a single square.
  const today = utcDay(toIso(Date.now()));
  const start = today - (rangeDays - 1) * DAY_MS;
  const length = rangeDays;

  const counts = new Array<number>(length).fill(0);
  for (const day of days) {
    const t = utcDay(day.date);
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

  // Split the window at calendar month boundaries.
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const months: MonthBlock[] = [];
  for (let i = 0; i < length; i++) {
    const date = new Date(start + i * DAY_MS);
    const isFirstOfMonth = date.getUTCDate() === 1;
    if (i === 0 || isFirstOfMonth) {
      months.push({
        label: monthFmt.format(date),
        lead: (date.getUTCDay() - weekStartsOn + 7) % 7,
        indices: [],
        cols: 0,
      });
    }
    months[months.length - 1].indices.push(i);
  }
  for (const block of months) {
    block.cols = Math.ceil((block.lead + block.indices.length) / 7);
  }

  return {
    start,
    length,
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
  /** Length of the trailing window. */
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

  // Runs once, a frame after mount, so the wave is seen rather than finished
  // before first paint.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const [tip, setTip] = useState<{ index: number; x: number; y: number } | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

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
    const plot = plotRef.current;
    if (!plot) return;
    const p = plot.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    setTip({ index, x: c.left - p.left + c.width / 2, y: c.top - p.top });
  };

  const focusDay = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), model.length - 1);
    plotRef.current?.querySelector<HTMLElement>(`[data-index="${clamped}"]`)?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (!target) return;
    const i = Number(target.dataset.index);
    // Up/down a day, left/right a week — and because the blocks are split by
    // month, those moves cross a month boundary the same as any other day.
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
  const totalCols = model.months.reduce((n, m) => n + m.cols, 0);
  const step = Math.min(12, WAVE_MS / Math.max(1, totalCols + 6));

  return (
    <div className={`w-full ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-md text-on-surface-variant">
          <span className="font-bold text-on-surface">
            {fmt.number.format(model.total)} {noun(model.total)}
          </span>{" "}
          in {period}
        </p>
        {/* Wrapped so the slot has its own box to size and shrink, rather
            than the caller's element being laid out directly by this flex
            row. */}
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1.5">
          {/* Weekday rail, aligned to the same 13px rows as every block. */}
          <div
            aria-hidden="true"
            className="grid shrink-0 text-label-sm leading-none text-on-surface-variant"
            style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP, paddingTop: 0 }}
          >
            {weekdayLabels.map((text, row) => (
              <span key={row} className="flex items-center pr-1">
                {text}
              </span>
            ))}
          </div>

          <div
            ref={plotRef}
            role="grid"
            aria-label={label}
            aria-readonly="true"
            onKeyDown={onKeyDown}
            onPointerLeave={() => setTip(null)}
            className="relative flex gap-2"
          >
            {model.months.map((block, blockIndex) => {
              // Columns before this one, for the diagonal wave to stay
              // continuous across the gaps.
              const colsBefore = model.months
                .slice(0, blockIndex)
                .reduce((n, m) => n + m.cols, 0);

              return (
                <div key={`${block.label}-${blockIndex}`} className="flex flex-col gap-1">
                  <div
                    className="grid grid-flow-col"
                    style={{
                      gridTemplateRows: `repeat(7, ${CELL}px)`,
                      gap: GAP,
                    }}
                  >
                    {/* Flat rather than nested Array.from: nesting yields an
                        array of arrays, and the inner arrays are children
                        React cannot key. With grid-flow-col and 7 rows, a flat
                        list fills column by column exactly the same way. */}
                    {Array.from({ length: block.cols * 7 }, (_, n) => {
                      const col = Math.floor(n / 7);
                      const row = n % 7;
                      {
                        const slot = col * 7 + row - block.lead;
                        const index = block.indices[slot];
                        const key = `${col}-${row}`;

                        if (slot < 0 || index === undefined) {
                          // Padding where the month does not start or end on a
                          // week boundary. Kept as a cell so rows stay aligned.
                          return (
                            <span
                              key={key}
                              aria-hidden="true"
                              style={{ width: CELL, height: CELL }}
                            />
                          );
                        }

                        const info = describe(index);
                        const delay = Math.round((colsBefore + col + row) * step);
                        return (
                          <span
                            key={key}
                            role="gridcell"
                            data-index={index}
                            tabIndex={index === model.length - 1 ? 0 : -1}
                            aria-label={info.full}
                            onPointerEnter={(e) => showTip(index, e.currentTarget)}
                            onFocus={(e) => showTip(index, e.currentTarget)}
                            onBlur={() => setTip(null)}
                            style={
                              {
                                width: CELL,
                                height: CELL,
                                transitionDelay: revealed ? `${delay}ms` : "0ms",
                              } as CSSProperties
                            }
                            className={[
                              "heat-cell rounded-[3px]",
                              LEVEL_BG[model.levels[index]],
                              revealed ? "opacity-100" : "scale-75 opacity-0",
                              "focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1",
                            ].join(" ")}
                          />
                        );
                      }
                    })}
                  </div>

                  {/* Centred under exactly the days it names. */}
                  <span
                    aria-hidden="true"
                    className="text-center text-label-sm text-on-surface-variant"
                  >
                    {block.label}
                  </span>
                </div>
              );
            })}

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
