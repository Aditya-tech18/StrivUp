"use client";

import { useState } from "react";
import { Check, Coins, Flame, ShieldCheck } from "lucide-react";

/**
 * StakePicker — put StrivCoins on the line for each day you miss.
 *
 * WHAT A STAKE IS HERE, AND WHAT IT IS NOT.
 *
 * Missing a day burns coins. Finishing mints a bonus. Nothing is ever paid
 * from one participant to another, and nothing staked or won can be converted
 * to money — see the contract at the top of 20261021_challenge_stakes.sql for
 * why that distinction is load-bearing rather than cosmetic.
 *
 * THE CONSEQUENCE TABLE IS THE POINT.
 *
 * A number of coins at risk means nothing on its own; "miss three days and
 * you are down to 12" means something immediately. So the cost is shown
 * before the commitment, computed against the creator's real balance rather
 * than a round hypothetical, because a worked example in your own numbers is
 * the only version that lands.
 *
 * Showing the damage up front is also the ethical shape for a loss-framed
 * mechanic: the moment to understand what this costs is before opting in, not
 * the morning it is taken.
 */

export interface StakeChoice {
  /** Coins burned per missed day. 0 means no stake. */
  perDay: number;
}

/** Mirrors challenges_daily_stake_check — the database is the enforcement point. */
export const MAX_DAILY_STAKE = 25;

const LEVELS: { perDay: number; label: string; blurb: string }[] = [
  { perDay: 0,  label: "No stake",  blurb: "Just the streak. Nothing at risk." },
  { perDay: 2,  label: "Light",     blurb: "A nudge. Easy to recover from." },
  { perDay: 5,  label: "Serious",   blurb: "About a day's earnings per miss." },
  { perDay: 10, label: "Steep",     blurb: "Two days' earnings. You will feel it." },
  { perDay: 25, label: "All in",    blurb: "The cap. Only for a streak you mean." },
];

/** What's left after missing n days, floored at zero — balances never go negative. */
function remaining(balance: number, perDay: number, missed: number): number {
  return Math.max(0, balance - perDay * missed);
}

export function StakePicker({
  value,
  onChange,
  balance,
  durationDays,
  eligible,
  ineligibleReason,
}: {
  value: StakeChoice;
  onChange: (next: StakeChoice) => void;
  /** The creator's real StrivCoin balance, used for the worked example. */
  balance: number;
  /** Null for an ongoing challenge, where there is no completion bonus. */
  durationDays: number | null;
  /** False when the account cannot stake (under 18, or age unknown). */
  eligible: boolean;
  ineligibleReason?: string;
}) {
  const [touched, setTouched] = useState(false);
  const perDay = value.perDay;

  // Mirrors award_stake_completion_bonus: half the total possible stake, and
  // only on a challenge with a fixed length.
  const bonus =
    durationDays && perDay > 0 ? Math.max(1, Math.floor((perDay * durationDays) / 2)) : 0;

  if (!eligible) {
    return (
      <section aria-labelledby="stake-heading" className="space-y-2">
        <h3 id="stake-heading" className="text-body-md font-medium text-on-surface">
          Daily stake
        </h3>
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
          <p className="text-label-sm text-on-surface-variant">
            {ineligibleReason ??
              "Staking is available once your date of birth is on file and you are 18 or over."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="stake-heading" className="space-y-3">
      <div>
        <h3 id="stake-heading" className="text-body-md font-medium text-on-surface">
          Daily stake
        </h3>
        <p className="mt-0.5 text-label-sm text-on-surface-variant">
          StrivCoins everyone in this challenge loses for each day they miss.
        </p>
      </div>

      <div role="radiogroup" aria-labelledby="stake-heading" className="flex flex-wrap gap-2">
        {LEVELS.map((level) => {
          const selected = perDay === level.perDay;
          return (
            <button
              key={level.perDay}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setTouched(true);
                onChange({ perDay: level.perDay });
              }}
              className={[
                "edge-press flex items-center gap-1.5 rounded-xl px-3 py-2 text-body-md transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1",
                selected
                  ? "edge-brand bg-secondary text-on-secondary font-semibold"
                  : "border border-outline-variant bg-surface-container-lowest text-on-surface hover:border-secondary/40",
              ].join(" ")}
            >
              {selected ? <Check size={13} aria-hidden="true" /> : null}
              {level.perDay === 0 ? (
                level.label
              ) : (
                <>
                  {level.perDay}
                  <Coins size={12} aria-hidden="true" />
                  <span className="opacity-80">/ day</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-label-sm text-on-surface-variant" aria-live="polite">
        {LEVELS.find((l) => l.perDay === perDay)?.blurb}
      </p>

      {perDay > 0 && (
        <div className={`edge rounded-xl bg-surface-container-lowest p-4 ${touched ? "rise" : ""}`}>
          <p className="overline-mono text-label-sm font-bold text-on-surface-variant">
            What a miss costs you
          </p>

          <p className="mt-2 text-label-sm text-on-surface-variant">
            You hold{" "}
            <span className="font-bold tabular-nums text-on-surface">{balance}</span> coins today.
          </p>

          <ul className="mt-3 space-y-2">
            {[1, 2, 3].map((missed) => {
              const left = remaining(balance, perDay, missed);
              const pct = balance > 0 ? (left / balance) * 100 : 0;
              return (
                <li key={missed} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-label-sm text-on-surface-variant">
                    {missed} {missed === 1 ? "day" : "days"}
                  </span>
                  <span
                    className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-error/15"
                    aria-hidden="true"
                  >
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-secondary transition-[width] duration-500 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-label-sm font-semibold tabular-nums text-on-surface">
                    {left} left
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Stated plainly, because a loss-framed mechanic that quietly
              bottoms out is worse than one that says where the floor is. */}
          <p className="mt-3 flex items-start gap-1.5 text-label-sm text-on-surface-variant">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            Your balance never goes below zero, and lost coins are destroyed — never given to
            anyone else.
          </p>

          {bonus > 0 ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-label-sm text-on-surface-variant">
              <Flame size={13} className="mt-0.5 shrink-0 text-secondary" aria-hidden="true" />
              Finish {durationDays} days with at least 80% proved and StrivUp pays a{" "}
              <span className="font-bold text-on-surface">+{bonus}</span> bonus.
            </p>
          ) : (
            <p className="mt-1.5 text-label-sm text-on-surface-variant">
              Ongoing challenges have no completion bonus — there is no finish line to pay out.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
