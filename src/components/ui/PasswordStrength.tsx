"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * PasswordStrength — segmented meter, live label and a checklist.
 *
 * Adapted from the reference design. Two deliberate changes:
 *
 *   NO MOTION LIBRARY. The reference drives this with `motion/react`. What it
 *   animates is a scaleX on four bars and two opacity fades — CSS transitions,
 *   and this project still has nine runtime dependencies. If real spring
 *   physics is ever wanted, this is the one file to swap.
 *
 *   THE RULES MATCH WHAT THE FORMS ACTUALLY ENFORCE. The reference asks for 12
 *   characters and a symbol; our zod schemas require 8 with a letter and a
 *   number. A checklist that contradicts the validator teaches people to
 *   ignore it, so the first two rules below are exactly the enforced minimum
 *   and the last two are the genuine upgrades. Nothing here blocks submission
 *   — the schema remains the only gate.
 *
 * Colours are the semantic tokens, which already carry documented AA ratios on
 * surface: error 5.9:1, warning 5.0:1, success 5.5:1.
 */

/** Patterns a cracking dictionary tries first. Worth calling out explicitly. */
const COMMON =
  /^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|111111|123123|123456)/i;
/** The same character four or more times. */
const RUN = /(.)\1{3,}/;
/** Keyboard and counting runs. */
const RUN_UP =
  /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf)/i;
const SYMBOL = /[!-/:-@[-`{-~]/;

export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

export type EvaluatedRule = PasswordRule & { met: boolean };

/** First two mirror the zod schemas; last two are the upgrades. */
export const defaultPasswordRules: readonly PasswordRule[] = [
  { id: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
  {
    id: "alphanumeric",
    label: "A letter and a number",
    test: (v) => /[a-zA-Z]/.test(v) && /\d/.test(v),
  },
  { id: "length12", label: "12 characters or more", test: (v) => v.length >= 12 },
  {
    id: "variety",
    label: "Mixed case or a symbol",
    test: (v) => (/[a-z]/.test(v) && /[A-Z]/.test(v)) || SYMBOL.test(v),
  },
];

const DEFAULT_LABELS = ["Empty", "Weak", "Fair", "Good", "Strong"] as const;

export interface PasswordStrengthState {
  score: number;
  max: number;
  label: string;
  rules: EvaluatedRule[];
  guessable: boolean;
  announcement: string;
}

export function usePasswordStrength(
  value: string,
  {
    rules = defaultPasswordRules,
    labels = DEFAULT_LABELS,
    /** Pause before announcing, so a screen reader is not read every keystroke. */
    announceDelay = 700,
  }: {
    rules?: readonly PasswordRule[];
    labels?: readonly string[];
    announceDelay?: number;
  } = {}
): PasswordStrengthState {
  const state = useMemo(() => {
    const evaluated = rules.map((rule) => ({ ...rule, met: rule.test(value) }));
    const passed = evaluated.reduce((n, r) => n + (r.met ? 1 : 0), 0);

    const guessable =
      value.length > 0 && (COMMON.test(value) || RUN.test(value) || RUN_UP.test(value));

    // A guessable password is capped at the bottom of the scale no matter how
    // many boxes it ticks: "Passw0rd123!" satisfies every rule and is still
    // the first thing anyone tries.
    const score =
      value.length === 0 ? 0 : guessable ? 1 : Math.min(rules.length, Math.max(1, passed));

    const label = labels[Math.min(score, labels.length - 1)] ?? "";
    const unmet = evaluated.filter((r) => !r.met);

    const announcement =
      value.length === 0
        ? ""
        : [
            `Password strength ${label.toLowerCase()}.`,
            guessable ? "This is a commonly guessed pattern." : "",
            unmet.length === 0
              ? "All requirements met."
              : `Still needed: ${unmet.map((r) => r.label.toLowerCase()).join(", ")}.`,
          ]
            .filter(Boolean)
            .join(" ");

    return { score, max: rules.length, label, rules: evaluated, guessable, announcement };
  }, [value, rules, labels]);

  const [settled, setSettled] = useState("");

  useEffect(() => {
    if (state.announcement === "") return;
    const id = setTimeout(() => setSettled(state.announcement), announceDelay);
    return () => clearTimeout(id);
  }, [state.announcement, announceDelay]);

  // Announce only once the settled value has caught up with what the password
  // currently says. Clearing the field, or typing on, makes the two disagree
  // and this falls back to silence — which is the point of the delay, and it
  // avoids the stale-string problem without an effect writing state on every
  // keystroke. (An earlier version reset `settled` synchronously inside the
  // effect, which is the cascading-render pattern react-hooks warns about.)
  return { ...state, announcement: settled === state.announcement ? settled : "" };
}

const TONES = {
  none: { bar: "bg-outline-variant", text: "text-on-surface-variant" },
  danger: { bar: "bg-error", text: "text-error" },
  caution: { bar: "bg-warning", text: "text-warning" },
  safe: { bar: "bg-success", text: "text-success" },
} as const;

function toneFor(score: number, max: number) {
  if (score === 0) return TONES.none;
  const ratio = score / max;
  if (ratio <= 0.34) return TONES.danger;
  if (ratio <= 0.67) return TONES.caution;
  return TONES.safe;
}

export function PasswordStrength({
  value,
  rules = defaultPasswordRules,
  labels = DEFAULT_LABELS,
  showRules = true,
  className = "",
}: {
  value: string;
  rules?: readonly PasswordRule[];
  labels?: readonly string[];
  showRules?: boolean;
  className?: string;
}) {
  const { score, max, rules: evaluated, guessable, announcement } = usePasswordStrength(
    value,
    { rules, labels }
  );
  const tone = toneFor(score, max);
  const activeLabel = Math.min(score, labels.length - 1);

  return (
    <div className={`w-full ${className}`}>
      <div
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={score}
        aria-valuetext={labels[activeLabel]}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className="relative h-1.5 overflow-hidden rounded-sm bg-surface-container-high"
          >
            <span
              className={`pw-bar absolute inset-0 origin-left rounded-sm ${tone.bar}`}
              style={{
                transform: `scaleX(${i < score ? 1 : 0})`,
                // Segments fill left to right rather than all at once.
                transitionDelay: i < score ? `${i * 40}ms` : "0ms",
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex h-5 items-center justify-between gap-3">
        {/* Every label sits in the same grid cell and crossfades, so the row
            never changes width as the wording changes. */}
        <span className="inline-grid text-label-sm font-semibold leading-5">
          {labels.map((text, i) => (
            <span
              key={text}
              aria-hidden="true"
              className={`pw-fade col-start-1 row-start-1 whitespace-nowrap ${tone.text}`}
              style={{ opacity: i === activeLabel ? 1 : 0 }}
            >
              {text}
            </span>
          ))}
        </span>

        <span
          aria-hidden="true"
          className="pw-fade whitespace-nowrap text-label-sm leading-5 text-warning"
          style={{ opacity: guessable ? 1 : 0 }}
        >
          Commonly guessed
        </span>
      </div>

      {showRules ? (
        <ul className="mt-3 grid gap-1.5">
          {evaluated.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2">
              <span className="relative grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border border-outline-variant text-on-success">
                <span
                  className="pw-fade absolute inset-0 rounded-[3px] bg-success"
                  style={{ opacity: rule.met ? 1 : 0 }}
                />
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                  className="pw-bar relative h-[9px] w-[9px]"
                  style={{
                    opacity: rule.met ? 1 : 0,
                    transform: `scale(${rule.met ? 1 : 0.6})`,
                  }}
                >
                  <path
                    d="M2 6.2 4.7 8.9 10 3.3"
                    stroke="currentColor"
                    strokeWidth={1.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span
                className={`pw-fade text-label-sm leading-5 ${
                  rule.met ? "text-on-surface" : "text-on-surface-variant"
                }`}
              >
                {rule.label}
              </span>
              {/* The checkmark is decorative; this is what carries the state. */}
              <span className="sr-only">{rule.met ? "met" : "not met"}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
