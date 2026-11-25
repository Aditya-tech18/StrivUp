import Link from "next/link";
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
    <Link
      href="/coins"
      aria-label={`${balance} StrivCoins${earnedToday > 0 ? `, ${earnedToday} earned today` : ""}. View your balance.`}
      className="relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-coin/30 bg-coin/12 px-3 text-coin-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
    >
      <Coins size={16} aria-hidden="true" />
      <span className="text-label-md font-bold tabular-nums" aria-hidden="true">
        {balance.toLocaleString("en-IN")} <span className="text-label-sm">SC</span>
      </span>

      {earnedToday > 0 ? (
        <span
          aria-hidden="true"
          className="animate-coin-float pointer-events-none absolute -top-2 right-1 text-label-sm font-bold text-coin-ink"
        >
          +{earnedToday}
        </span>
      ) : null}
    </Link>
  );
}
