"use client";

/**
 * RewardsBrowser — the filter chips and the reward list on /rewards.
 *
 * Client-side only because the filter is a local view concern: every row the
 * person is entitled to see has already been fetched server-side under RLS,
 * so filtering here reveals nothing a round trip would have withheld, and the
 * chips respond instantly instead of re-querying.
 *
 * The list renders what the database says and nothing more. There is no
 * placeholder row, no illustrative amount and no example transaction: an
 * empty list means this account has earned nothing yet, and it says exactly
 * that.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Award, ChevronRight, Coins, Gift, Ticket } from "lucide-react";
import {
  formatMoney,
  isDead,
  type RewardRow,
  type RewardType,
} from "@/lib/data/rewards";
import { StatusPill } from "./StatusPill";

type Filter = "all" | RewardType;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cash", label: "Cash" },
  { key: "coupon", label: "Coupons" },
  { key: "badge", label: "Badges" },
];

const TYPE_ICON = { cash: Coins, coupon: Ticket, badge: Award } as const;
const TYPE_ACCENT = {
  cash: "bg-coin/15 text-coin-ink",
  coupon: "bg-secondary/12 text-secondary",
  badge: "bg-streak/15 text-streak-ink",
} as const;

function rewardTitle(r: RewardRow): string {
  if (r.type === "coupon") return r.couponTitle ?? "Coupon reward";
  if (r.type === "badge") return r.badgeCode ?? "Badge";
  return r.amountMinor !== null ? formatMoney(r.amountMinor, r.currency) : "Cash reward";
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RewardsBrowser({ rewards }: { rewards: RewardRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const byType = { all: rewards.length, cash: 0, coupon: 0, badge: 0 };
    for (const r of rewards) byType[r.type] += 1;
    return byType;
  }, [rewards]);

  const shown = useMemo(
    () => (filter === "all" ? rewards : rewards.filter((r) => r.type === filter)),
    [rewards, filter]
  );

  return (
    <section aria-labelledby="rewards-list-heading">
      <h2 id="rewards-list-heading" className="mb-3 font-display text-headline-md font-bold text-on-surface">
        Your rewards
      </h2>

      {/* Filters. role=tablist would promise panel semantics this does not
          have, so these are plain buttons with aria-pressed. */}
      <div
        role="group"
        aria-label="Filter rewards by type"
        className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-surface-container p-1"
      >
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={active}
              className={[
                "min-h-11 min-w-max flex-1 rounded-lg px-2 text-label-md font-bold transition-colors sm:text-label-lg",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-secondary",
                active
                  ? "bg-secondary text-on-secondary focus-visible:outline-on-secondary"
                  : "text-on-surface-variant hover:bg-surface-container-high",
              ].join(" ")}
            >
              {label}
              <span className={active ? "ml-1.5 opacity-80" : "ml-1.5 opacity-70"}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-outline bg-surface-container-lowest p-6 text-center text-body-sm text-on-surface-variant">
          {filter === "all"
            ? "No rewards yet."
            : `No ${filter === "cash" ? "cash rewards" : filter === "coupon" ? "coupons" : "badges"} yet.`}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((r) => {
            const Icon = TYPE_ICON[r.type] ?? Gift;
            const dim = isDead(r.status);
            return (
              <li key={r.id}>
                <Link
                  href={`/rewards/${r.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3.5 transition-colors hover:bg-surface-container tap-target"
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      dim ? "bg-surface-container text-on-surface-variant" : TYPE_ACCENT[r.type]
                    }`}
                  >
                    <Icon
                      size={20}
                      aria-hidden="true"
                    />
                  </span>

                  <span className="min-w-20 flex-1">
                    <span
                      className={`block truncate text-body-lg font-bold tracking-[-0.01em] ${
                        dim ? "text-on-surface-variant" : "text-on-surface"
                      }`}
                    >
                      {rewardTitle(r)}
                    </span>
                    <span className="block truncate text-body-sm text-on-surface-variant">
                      {r.sourceTitle ?? r.campaignName ?? "StrivUp reward"}
                      {" · "}
                      {dateLabel(r.earnedAt)}
                    </span>
                  </span>

                  <StatusPill status={r.status} />
                  <ChevronRight
                    size={18}
                    className="shrink-0 text-on-surface-variant"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
