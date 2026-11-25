import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Coins, FileText, Gift, History, Ticket, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, getMyRewards, summarise } from "@/lib/data/rewards";
import { RewardsBrowser } from "@/components/features/rewards/RewardsBrowser";

/**
 * /rewards — My Rewards.
 *
 * Reached from the sidebar, the mobile drawer, and the entry directly below
 * My Active Challenges on the profile. Everything on it is read from
 * reward_allocations under RLS as the signed-in user, so there is no way for
 * this page to show one person another person's rewards, and no amount or
 * status on it was supplied by the browser.
 *
 * What this page does NOT do, deliberately:
 *  - It never invents a number. With no allocations, every tile reads zero
 *    and the list says so. No sample amounts, no illustrative transactions.
 *  - It does not treat money in flight as money received. "Paid" counts
 *    status='paid' alone; approved, claim_required and processing are
 *    reported separately as awaiting payment, because that is what they are.
 *  - It does not collect payout details. A UPI ID is asked for once, at claim
 *    time, on the claim screen, and never a PIN, OTP or banking password.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Rewards",
  description: "Cash prizes, coupons and badges you have earned on StrivUp.",
};

export default async function RewardsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/rewards");

  const rewards = await getMyRewards(supabase, user.id);
  const summary = summarise(rewards);

  const tiles = [
    {
      label: "Rewards earned",
      value: String(summary.totalEarned),
      hint: "Approved and in progress",
      icon: Gift,
      accent: "bg-secondary/12 text-secondary",
    },
    {
      label: "Awaiting payment",
      value: formatMoney(summary.cashAwaitingMinor),
      hint: "Payment pending",
      icon: History,
      accent: "bg-coin/15 text-coin-ink",
    },
    {
      label: "Paid out",
      value: formatMoney(summary.cashPaidMinor),
      hint: "Confirmed transfers only",
      icon: Wallet,
      accent: "bg-streak/15 text-streak-ink",
    },
    {
      label: "Coupons available",
      value: String(summary.couponsOpen),
      hint: "Unredeemed and unexpired",
      icon: Ticket,
      accent: "bg-secondary/12 text-secondary",
    },
  ];

  return (
    <div className="min-h-screen bg-surface pb-24">
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/95 pt-safe backdrop-blur-sm">
        <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link href="/profile" aria-label="Back to profile" className="flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-container">
            <ArrowLeft size={20} aria-hidden="true" className="text-on-surface" />
          </Link>
          <h1 className="flex-1 font-display text-headline-md font-bold text-on-surface">My Rewards</h1>
          <Link
            href="/rewards/terms"
            aria-label="Reward terms and conditions"
            className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-label-lg font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <FileText size={15} aria-hidden="true" />
            Terms
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
        <section aria-label="Rewards summary" className="grid grid-cols-2 gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:grid-cols-4 sm:gap-3 sm:p-3">
          {tiles.map(({ label, value, hint, icon: Icon, accent }) => (
            <div
              key={label}
              className="min-w-0 rounded-xl bg-surface-container-low p-3"
            >
              <span className={`mb-2 flex size-8 items-center justify-center rounded-lg ${accent}`}>
                <Icon size={16} aria-hidden="true" />
              </span>
              <p className="text-label-md font-semibold text-on-surface-variant">{label}</p>
              <p className="mt-0.5 wrap-anywhere font-display text-headline-md font-bold tabular-nums text-on-surface">
                {value}
              </p>
              <p className="mt-0.5 text-label-sm text-on-surface-variant">{hint}</p>
            </div>
          ))}
        </section>

        {rewards.length === 0 ? (
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 text-center">
            <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-secondary/12 text-secondary">
              <Gift size={22} aria-hidden="true" />
            </span>
            <h2 className="font-display text-headline-md font-bold text-on-surface">No rewards yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-body-sm leading-relaxed text-on-surface-variant">
              Awards from completed challenges and quests appear here after review.
            </p>
            <Link
              href="/explore"
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-secondary px-5 text-body-md font-bold text-on-secondary transition-colors hover:bg-secondary/85"
            >
              Explore challenges
            </Link>
          </div>
        ) : (
          <RewardsBrowser rewards={rewards} />
        )}

        <Link
          href="/coins"
          className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 transition-colors hover:bg-surface-container"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-coin/15 text-coin-ink">
            <Coins size={20} aria-hidden="true" />
          </span>
          <span className="flex-1 text-body-md font-bold text-on-surface">StrivCoins wallet</span>
          <ArrowRight size={18} className="text-on-surface-variant" aria-hidden="true" />
        </Link>

        <p className="text-center text-label-sm leading-relaxed text-on-surface-variant">
          Rewards are awarded under the{" "}
          <Link href="/rewards/terms" className="font-semibold text-secondary hover:underline">
            StrivUp reward terms
          </Link>
          . Eligibility and amounts are decided by review, and a reward is only
          payable once its status says so.
        </p>
      </div>
    </div>
  );
}
