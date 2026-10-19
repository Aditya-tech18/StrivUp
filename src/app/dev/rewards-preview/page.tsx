/**
 * /dev/rewards-preview — dev-only visual harness for the My Rewards screens.
 *
 * /rewards sits behind auth and reads reward_allocations under RLS, and no
 * allocations exist yet, so the list, the status pills and the summary tiles
 * could not otherwise be looked at in any state at all. This renders them
 * against fabricated rows covering every status the lifecycle can reach.
 *
 * 404s in production, like /dev/components. The amounts below are invented
 * for layout review and are not user data: nothing here reaches the database,
 * and nothing here is reachable from the app.
 */

import { notFound } from "next/navigation";
import { RewardsBrowser } from "@/components/features/rewards/RewardsBrowser";
import { StatusPill } from "@/components/features/rewards/StatusPill";
import {
  formatMoney,
  summarise,
  type RewardRow,
  type RewardStatus,
  type RewardType,
} from "@/lib/data/rewards";

function row(
  key: string,
  type: RewardType,
  status: RewardStatus,
  over: Partial<RewardRow> = {}
): RewardRow {
  return {
    id: key,
    type,
    status,
    amountMinor: type === "cash" ? 15000 : null,
    currency: "INR",
    badgeCode: type === "badge" ? "Consistency 30" : null,
    earnedAt: "2026-10-01T09:30:00Z",
    approvedAt: null,
    claimedAt: null,
    paidAt: null,
    expiresAt: null,
    decisionReason: null,
    campaignId: "camp-1",
    campaignName: "October streak campaign",
    sourceKind: "challenge",
    sourceId: "ch-1",
    sourceTitle: "100 Days of LeetCode",
    couponDefinitionId: type === "coupon" ? "cd-1" : null,
    couponTitle: type === "coupon" ? "Flat 20 percent off at Chaap Corner" : null,
    rulesVersionId: "rv-1",
    ...over,
  };
}

const ALL_STATUSES: RewardStatus[] = [
  "pending_review", "approved", "claim_required", "processing", "paid",
  "failed", "rejected", "expired", "cancelled",
  "available", "claimed", "redeemed", "revoked",
];

const FIXTURES: RewardRow[] = [
  row("r1", "cash", "claim_required", { amountMinor: 20000 }),
  row("r2", "cash", "processing", { amountMinor: 10000, approvedAt: "2026-10-03T10:00:00Z" }),
  row("r3", "cash", "paid", {
    amountMinor: 15000,
    approvedAt: "2026-09-20T10:00:00Z",
    claimedAt: "2026-09-21T10:00:00Z",
    paidAt: "2026-09-22T10:00:00Z",
  }),
  row("r4", "cash", "failed", { amountMinor: 5000 }),
  row("r5", "cash", "rejected", { amountMinor: 10000, decisionReason: "Proof did not match the task." }),
  row("r6", "coupon", "available", { expiresAt: "2026-12-31T18:30:00Z" }),
  row("r7", "coupon", "redeemed"),
  row("r8", "badge", "available", { badgeCode: "First quest" }),
  row("r9", "badge", "available", { badgeCode: "30 day streak" }),
];

export default function RewardsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const summary = summarise(FIXTURES);
  const tiles = [
    { label: "Rewards earned", value: String(summary.totalEarned), hint: "Approved and in progress" },
    { label: "Awaiting payment", value: formatMoney(summary.cashAwaitingMinor), hint: "Not yet in your account" },
    { label: "Paid out", value: formatMoney(summary.cashPaidMinor), hint: "Confirmed transfers only" },
    { label: "Coupons available", value: String(summary.couponsOpen), hint: "Unredeemed and unexpired" },
  ];

  return (
    <div className="min-h-screen bg-surface p-5">
      <main className="mx-auto measure-page space-y-6">
        <h1 className="text-headline-md font-bold text-on-surface">Rewards preview</h1>

        <section data-testid="tiles" aria-label="Rewards summary" className="grid grid-cols-2 gap-2.5">
          {tiles.map((t) => (
            <div
              key={t.label}
              data-testid="tile"
              className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised"
            >
              <p className="text-label-md font-semibold text-on-surface-variant">{t.label}</p>
              <p className="mt-1 text-headline-md font-bold tracking-[-0.02em] text-on-surface">
                {t.value}
              </p>
              <p className="mt-0.5 text-label-sm text-on-surface-variant">{t.hint}</p>
            </div>
          ))}
        </section>

        <section aria-label="Every status pill" className="flex flex-wrap gap-2">
          {ALL_STATUSES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </section>

        <div data-testid="browser">
          <RewardsBrowser rewards={FIXTURES} />
        </div>

        <div data-testid="browser-empty">
          <RewardsBrowser rewards={[]} />
        </div>
      </main>
    </div>
  );
}
