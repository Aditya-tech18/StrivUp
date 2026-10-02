import { Coins } from "lucide-react";

/**
 * CoinPill — the StrivCoin balance in the home-feed header.
 *
 * Sits beside the streak pill so the two reinforcement loops — consistency and
 * reward — are read in the same glance, the way LeetCode pairs streak and coins.
 *
 * Deliberately a server component with no state. An earlier version animated a
 * count-up in an effect, which meant setting state synchronously on mount for
 * the no-award case and hand-rolling a prefers-reduced-motion check. The "+N"
 * float carries all of the signal on its own, and as a pure CSS animation it
 * honours reduced-motion for free (see the guard on .animate-coin-float in
 * globals.css).
 */
export function CoinPill({
  balance,
  earnedToday = 0,
}: {
  balance: number;
  earnedToday?: number;
}) {
  return (
    <div className="relative flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container-high px-space-md py-1.5 shadow-sm">
      <Coins size={15} className="text-on-tertiary-container" aria-hidden="true" />
      <span className="text-label-md font-bold tabular-nums text-on-surface" aria-hidden="true">
        {balance}
      </span>

      <span className="sr-only">
        {balance} StrivCoins{earnedToday > 0 ? `, ${earnedToday} earned today` : ""}
      </span>

      {earnedToday > 0 ? (
        <span
          aria-hidden="true"
          className="animate-coin-float pointer-events-none absolute -top-2 right-1 text-label-sm font-bold text-on-tertiary-container"
        >
          +{earnedToday}
        </span>
      ) : null}
    </div>
  );
}
