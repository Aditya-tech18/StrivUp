"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Calendar — a single-date month calendar in the app's palette.
 *
 * Modelled on the react-aria calendar the design reference used, but written
 * against the DOM directly. The reference needed three packages
 * (react-aria-components, @internationalized/date, @radix-ui/react-icons) to
 * draw twelve rows of buttons; this project runs on nine runtime dependencies
 * and the behaviour that actually matters here — roving focus, arrow keys,
 * Home/End, PageUp/PageDown, a disabled past, an announced selection — is the
 * code below.
 *
 * Dates are plain "YYYY-MM-DD" strings, never Date objects, for the same reason
 * the heatmap uses them: a Date is a moment in time and a calendar square is a
 * calendar day, and the two disagree for five and a half hours every day in
 * India. All arithmetic runs in UTC on a noon anchor so a DST-shifting host
 * clock cannot roll a square onto the day before.
 */

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today as the user in India experiences it, not as UTC has it. */
export const todayISO = () => istDateFormatter.format(new Date());

/** Noon UTC, so adding days can never cross a boundary by an hour. */
function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** Inclusive day count: today → today is 1 day, not 0. */
export function daysBetween(startISO: string, endISO: string): number {
  const ms = toDate(endISO).getTime() - toDate(startISO).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function formatLongDate(iso: string): string {
  return toDate(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthLabel(iso: string): string {
  return toDate(iso).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** First of the month containing `iso`. */
function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function addMonths(iso: string, months: number): string {
  const d = toDate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp: 31 Jan + 1 month is 28 Feb, not 3 March.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toISO(d);
}

export function Calendar({
  value,
  onChange,
  min,
  max,
  ariaLabel = "Choose a date",
}: {
  /** Selected day, "YYYY-MM-DD", or null for nothing selected. */
  value: string | null;
  onChange: (iso: string) => void;
  /** Earliest selectable day, inclusive. */
  min?: string;
  /** Latest selectable day, inclusive. */
  max?: string;
  ariaLabel?: string;
}) {
  const today = todayISO();
  const [cursor, setCursor] = useState(() => startOfMonth(value ?? min ?? today));
  // The day that owns the grid's single tab stop. Roving tabindex, so Tab
  // moves past the whole month instead of through 31 buttons.
  const [focusDay, setFocusDay] = useState(() => value ?? min ?? today);
  const gridRef = useRef<HTMLDivElement>(null);
  // Armed only by keyboard movement, so the calendar never grabs focus on
  // mount or when the month is changed with the chevrons.
  const pendingFocus = useRef(false);

  const weeks = useMemo(() => {
    const first = toDate(cursor);
    const daysInMonth = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)
    ).getUTCDate();
    // Flat list with leading blanks, chunked into rows of seven. Nested
    // Array.from would produce unkeyed inner arrays.
    const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${cursor.slice(0, 7)}-${String(d).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor]);

  const disabled = (iso: string) => Boolean(min && iso < min) || Boolean(max && iso > max);

  const prevDisabled = Boolean(min && addMonths(cursor, -1) < startOfMonth(min));
  const nextDisabled = Boolean(max && addMonths(cursor, 1) > max);

  /** Move the tab stop, pulling the month and the real DOM focus along. */
  function moveFocus(iso: string) {
    if (max && iso > max) return;
    if (min && iso < min) return;
    // Same day: React would bail out of the re-render, the effect below would
    // not run, and the pending flag would be left armed to steal focus on some
    // later unrelated render.
    if (iso === focusDay) return;
    pendingFocus.current = true;
    setFocusDay(iso);
    if (iso.slice(0, 7) !== cursor.slice(0, 7)) setCursor(startOfMonth(iso));
  }

  // Focus follows the tab stop after the commit, not inside the handler: when
  // an arrow key crosses into another month the target cell does not exist yet
  // at that point. An effect runs once the new month is in the DOM.
  // (requestAnimationFrame is the obvious alternative and the wrong one — it
  // does not run at all while the tab is hidden, so the keyboard would
  // silently stop working in a backgrounded tab.)
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay]);

  function handleKey(e: React.KeyboardEvent) {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in step) {
      e.preventDefault();
      moveFocus(addDays(focusDay, step[e.key]));
      return;
    }
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      moveFocus(addMonths(focusDay, e.key === "PageUp" ? -1 : 1));
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const row = weeks.find((w) => w.includes(focusDay));
      const days = (row ?? []).filter((d): d is string => d !== null);
      const target = e.key === "Home" ? days[0] : days[days.length - 1];
      if (target) moveFocus(target);
    }
  }

  const navBtn = [
    "flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant",
    "transition-colors hover:bg-surface-container hover:text-on-surface",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
    "disabled:pointer-events-none disabled:opacity-30",
  ].join(" ");

  return (
    <div
      className="w-fit rounded-xl border border-outline-variant bg-surface-container-lowest p-2"
      role="group"
      aria-label={ariaLabel}
    >
      <header className="flex w-full items-center gap-1 pb-1">
        <button
          type="button"
          onClick={() => setCursor(addMonths(cursor, -1))}
          disabled={prevDisabled}
          aria-label="Previous month"
          className={navBtn}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span aria-live="polite" className="grow text-center text-body-md font-semibold text-on-surface">
          {monthLabel(cursor)}
        </span>
        <button
          type="button"
          onClick={() => setCursor(addMonths(cursor, 1))}
          disabled={nextDisabled}
          aria-label="Next month"
          className={navBtn}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </header>

      {/* A table, because that is what a month is: seven named columns of
          dates. Screen readers announce the weekday with the day number. */}
      <div ref={gridRef} onKeyDown={handleKey}>
        <table className="border-collapse" role="grid" aria-label={monthLabel(cursor)}>
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th
                  key={d}
                  scope="col"
                  abbr={d}
                  className="h-9 w-9 p-0 text-label-sm font-medium text-on-surface-variant"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.find((d) => d !== null) ?? String(week)}>
                {week.map((day, i) => {
                  if (!day) return <td key={`pad-${i}`} className="h-9 w-9 p-0" />;
                  const selected = day === value;
                  const isToday = day === today;
                  const off = disabled(day);
                  return (
                    // aria-selected belongs on the gridcell, which is what a
                    // <td> inside role="grid" already is — not on the button
                    // inside it, where the role does not support it.
                    <td key={day} className="p-0" aria-selected={selected}>
                      <button
                        type="button"
                        data-day={day}
                        disabled={off}
                        tabIndex={day === focusDay ? 0 : -1}
                        // Keeps the tab stop honest no matter how focus
                        // arrived — a click, a Tab, or a programmatic focus().
                        // Without it the arrow keys step from wherever the tab
                        // stop last was rather than from the day the user is
                        // actually looking at.
                        onFocus={() => setFocusDay(day)}
                        aria-pressed={selected}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={formatLongDate(day)}
                        onClick={() => {
                          setFocusDay(day);
                          onChange(day);
                        }}
                        className={[
                          "relative flex h-9 w-9 items-center justify-center rounded-lg",
                          "text-body-md transition-colors duration-150",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
                          "disabled:pointer-events-none disabled:opacity-30",
                          selected
                            ? "bg-secondary font-semibold text-on-secondary"
                            : "text-on-surface hover:bg-secondary/10",
                        ].join(" ")}
                      >
                        {Number(day.slice(8))}
                        {isToday ? (
                          <span
                            aria-hidden="true"
                            className={[
                              "absolute bottom-1 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full",
                              selected ? "bg-on-secondary" : "bg-secondary",
                            ].join(" ")}
                          />
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
