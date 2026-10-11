"use client";

import { useState } from "react";
import { CalendarDays, Check, Infinity as InfinityIcon } from "lucide-react";
import {
  Calendar,
  addDays,
  daysBetween,
  formatLongDate,
  todayISO,
} from "@/components/ui/Calendar";

/**
 * DurationPicker — how long a challenge runs.
 *
 * Replaces a four-option <select> (30/60/90/Indefinite) that could not express
 * a one-week challenge at all, which is the shape most people actually start
 * with. Presets cover the common lengths; Custom opens a calendar and the
 * length is derived from the day picked, so any duration is reachable.
 *
 * The calendar picks an END DATE rather than a start-and-end range. That is
 * not a simplification — `challenges` stores `duration_days` and has no start
 * column, because a challenge begins the day each participant joins, not on a
 * date the creator sets. A range picker would offer a start date the database
 * would silently discard.
 */

export interface DurationChoice {
  /** null means ongoing — the column is nullable and the app reads it as such. */
  days: number | null;
}

const PRESETS = [7, 14, 21, 30, 60, 90] as const;

/** Two years out. Long enough for anything real, short enough to bound paging. */
const MAX_DAYS = 730;

export function DurationPicker({
  value,
  onChange,
  error,
}: {
  /** null when nothing has been chosen yet. */
  value: DurationChoice | null;
  onChange: (next: DurationChoice) => void;
  error?: string | null;
}) {
  const today = todayISO();
  const [customOpen, setCustomOpen] = useState(false);

  // A custom length is any chosen value that is not one of the presets and is
  // not ongoing — derived rather than stored, so the two cannot disagree.
  const isCustom =
    value != null &&
    value.days != null &&
    !PRESETS.includes(value.days as (typeof PRESETS)[number]);

  const endDate = value?.days ? addDays(today, value.days - 1) : null;

  const chipCls = (selected: boolean) =>
    [
      "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-body-md transition-all duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1",
      selected
        ? "border-secondary bg-secondary text-on-secondary font-semibold"
        : "border-outline-variant bg-surface-container-lowest text-on-surface hover:border-secondary/40",
    ].join(" ");

  return (
    <div className="space-y-2">
      <span id="duration-label" className="block text-body-md font-medium text-on-surface">
        Duration
      </span>

      <div role="radiogroup" aria-labelledby="duration-label" className="flex flex-wrap gap-2">
        {PRESETS.map((days) => {
          const selected = value?.days === days;
          return (
            <button
              key={days}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setCustomOpen(false);
                onChange({ days });
              }}
              className={chipCls(selected)}
            >
              {selected ? <Check size={13} aria-hidden="true" /> : null}
              {days} days
            </button>
          );
        })}

        <button
          type="button"
          role="radio"
          aria-checked={value?.days === null && value !== null}
          onClick={() => {
            setCustomOpen(false);
            onChange({ days: null });
          }}
          className={chipCls(value != null && value.days === null)}
        >
          <InfinityIcon size={13} aria-hidden="true" />
          Ongoing
        </button>

        <button
          type="button"
          role="radio"
          // No aria-expanded: a radio does not support it, and the calendar
          // it reveals is a sibling with its own group label, not a popup this
          // control owns.
          aria-checked={isCustom}
          onClick={() => setCustomOpen((open) => !open)}
          className={chipCls(isCustom)}
        >
          <CalendarDays size={13} aria-hidden="true" />
          {isCustom && value?.days ? `${value.days} days` : "Custom"}
        </button>
      </div>

      {customOpen ? (
        <div className="space-y-2 pt-1">
          <p className="text-label-sm text-on-surface-variant">
            Pick the last day. The length is counted from the day someone joins.
          </p>
          <Calendar
            ariaLabel="Last day of the challenge"
            value={endDate}
            min={today}
            max={addDays(today, MAX_DAYS - 1)}
            onChange={(iso) => {
              onChange({ days: daysBetween(today, iso) });
              setCustomOpen(false);
            }}
          />
        </div>
      ) : null}

      {/* Always say what was chosen in words. A chip reading "45 days" does
          not tell a creator when that lands, and the end date is the thing
          they are picturing. */}
      {value != null ? (
        <p className="text-label-sm text-on-surface-variant" aria-live="polite">
          {value.days == null
            ? "Runs with no end date — participants keep going until they stop."
            : `${value.days} ${value.days === 1 ? "day" : "days"} · ends ${formatLongDate(
                addDays(today, value.days - 1)
              )} for someone joining today.`}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-label-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
