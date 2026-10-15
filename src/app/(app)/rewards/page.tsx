import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText, Gift } from "lucide-react";
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
    },
    {
      label: "Awaiting payment",
      value: formatMoney(summary.cashAwaitingMinor),
      hint: "Not yet in your account",
    },
    {
      label: "Paid out",
      value: formatMoney(summary.cashPaidMinor),
      hint: "Confirmed transfers only",
    },
    {
      label: "Coupons available",
      value: String(summary.couponsOpen),
      hint: "Unredeemed and unexpired",
    },
  ];

  return (
    <div className="min-h-screen bg-surface pb-24">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-5 py-4">
        <Link href="/profile" aria-label="Back to profile">
          <ArrowLeft className="h-5 w-5 text-on-surface-variant" />
        </Link>
        <h1 className="flex-1 text-body-lg font-bold tracking-[-0.01em] text-on-surface">
          My Rewards
        </h1>
        <Link
          href="/rewards/terms"
          aria-label="Reward terms and conditions"
          className="flex h-9 items-center gap-1.5 rounded-full border border-outline-variant px-3 text-label-lg font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <FileText size={15} aria-hidden="true" />
          Terms
        </Link>
      </header>

      <main className="mx-auto measure-page space-y-5 px-5 py-5">
        {/* Summary. Four tiles, each one a figure the database can defend. */}
        <section aria-label="Rewards summary" className="grid grid-cols-2 gap-2.5">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised"
            >
              <p className="text-label-md font-semibold text-on-surface-variant">{t.label}</p>
              <p className="mt-1 text-headline-md font-bold tracking-[-0.02em] text-on-surface">
                {t.value || formatMoney(0)}
              </p>
              <p className="mt-0.5 text-label-sm text-on-surface-variant">{t.hint}</p>
            </div>
          ))}
        </section>

        {rewards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline bg-surface-container-lowest p-6 text-center">
            <Gift className="mx-auto mb-2 h-8 w-8 text-on-surface-variant" aria-hidden="true" />
            <h2 className="text-body-md font-bold text-on-surface">No rewards yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-body-sm leading-relaxed text-on-surface-variant">
              Rewards show up here once a challenge or quest you completed has been
              reviewed. Nothing is listed until it has actually been awarded to you.
            </p>
            <Link
              href="/explore"
              className="mt-4 inline-flex h-10 items-center rounded-xl bg-secondary px-5 text-body-md font-bold text-white elev-2 tap-target"
            >
              Explore challenges
            </Link>
          </div>
        ) : (
          <RewardsBrowser rewards={rewards} />
        )}

        <p className="text-center text-label-sm leading-relaxed text-on-surface-variant">
          Rewards are awarded under the{" "}
          <Link href="/rewards/terms" className="font-semibold text-secondary hover:underline">
            StrivUp reward terms
          </Link>
          . Eligibility and amounts are decided by review, and a reward is only
          payable once its status says so.
        </p>
      </main>
    </div>
  );
}
