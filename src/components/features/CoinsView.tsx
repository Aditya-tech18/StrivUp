import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarCheck,
  Coins,
  Flag,
  Lock,
  MapPin,
  Trophy,
  Users,
} from "lucide-react";
import {
  COIN_REASON_LABEL,
  type CoinEvent,
  type CoinReward,
  type CoinRules,
} from "@/lib/data/coins";

/**
 * CoinsView — the presentational half of the StrivCoin wallet.
 *
 * Split from the route so it can be rendered against fabricated data in
 * /dev/coins-preview. The page itself sits behind auth, and shipping a screen
 * nobody has ever looked at is how the duplicate-title bug in Today's Tasks
 * got as far as it did.
 *
 * Holds no state and fetches nothing — every number is passed in.
 */

/** One row of the earning table. */
function EarnRow({
  icon,
  title,
  detail,
  amount,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  amount: string;
}) {
  return (
    <li className="flex items-center gap-space-sm py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-body-md font-medium text-on-surface">{title}</p>
        <p className="text-label-sm text-on-surface-variant">{detail}</p>
      </div>
      <span className="shrink-0 rounded-full bg-on-tertiary-container/10 px-2.5 py-1 text-label-sm font-bold text-on-tertiary-container">
        {amount}
      </span>
    </li>
  );
}

function earnRows(r: CoinRules) {
  return [
    {
      icon: <CalendarCheck size={17} className="text-secondary" aria-hidden="true" />,
      title: "Open the app",
      detail: "Once per day",
      amount: `+${r.daily_checkin}`,
    },
    {
      icon: <BadgeCheck size={17} className="text-on-tertiary-container" aria-hidden="true" />,
      title: "Proof approved",
      detail: `Up to ${r.proof_approved_daily_max} a day`,
      amount: `+${r.proof_approved}`,
    },
    {
      icon: <Users size={17} className="text-secondary" aria-hidden="true" />,
      title: "Join a challenge",
      detail: `Once per challenge · up to ${r.challenge_joined_weekly_max} a week`,
      amount: `+${r.challenge_joined}`,
    },
    {
      icon: <Trophy size={17} className="text-on-tertiary-container" aria-hidden="true" />,
      title: "Finish a challenge",
      detail: `${r.challenge_min_duration}+ days, and at least ${Math.round(
        r.challenge_min_consistency * 100
      )}% of days proven`,
      amount: `+${r.challenge_complete_base + r.challenge_complete_per_day * 7}–${
        r.challenge_complete_max
      }`,
    },
    {
      icon: <MapPin size={17} className="text-secondary" aria-hidden="true" />,
      title: "Join a quest",
      detail: "Once per quest",
      amount: `+${r.quest_joined}`,
    },
    {
      icon: <Flag size={17} className="text-on-tertiary-container" aria-hidden="true" />,
      title: "Complete a quest",
      detail: "Verified by the business",
      amount: `+${r.quest_completed}`,
    },
  ];
}

export function CoinsView({
  balance,
  rules,
  history,
  rewards,
}: {
  balance: number;
  rules: CoinRules | null;
  history: CoinEvent[];
  rewards: CoinReward[];
}) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 pt-safe z-40 border-b border-outline-variant bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-space-xs px-gutter">
          <Link
            href="/feed"
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          <h1 className="text-headline-sm text-on-surface">StrivCoins</h1>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-space-lg px-gutter py-space-lg">
        {/* ── Balance ─────────────────────────────────────────────────── */}
        <section
          aria-label="Your balance"
          className="flex flex-col items-center rounded-xl bg-primary px-space-md py-space-lg text-on-primary shadow-sm"
        >
          <Coins size={26} className="text-tertiary-fixed" aria-hidden="true" />
          <p className="mt-space-xs text-display-mobile tabular-nums">{balance}</p>
          <p className="text-label-md text-primary-fixed-dim">
            {balance === 1 ? "StrivCoin" : "StrivCoins"}
          </p>
        </section>

        {/* ── Earning ─────────────────────────────────────────────────── */}
        <section aria-label="How you earn">
          <h2 className="mb-space-xs text-headline-sm text-on-surface">How you earn</h2>
          {rules ? (
            <>
              <ul className="divide-y divide-outline-variant rounded-xl bg-surface-container-lowest px-space-md shadow-sm">
                {earnRows(rules).map((row) => (
                  <EarnRow key={row.title} {...row} />
                ))}
              </ul>
              <p className="mt-space-xs px-1 text-label-sm text-on-surface-variant">
                Up to {rules.daily_global_cap} coins a day from everyday actions. Finishing
                a challenge or a quest is on top of that. Challenges you created yourself
                pay {Math.round(rules.self_created_multiplier * 100)}%.
              </p>
            </>
          ) : (
            <p className="rounded-xl bg-surface-container-lowest p-space-md text-body-sm text-on-surface-variant shadow-sm">
              Couldn&apos;t load the earning rates right now.
            </p>
          )}
        </section>

        {/* ── Spending ────────────────────────────────────────────────── */}
        <section aria-label="What you can unlock">
          <h2 className="mb-space-xs text-headline-sm text-on-surface">What they unlock</h2>
          <ul className="flex flex-col gap-space-sm">
            {rewards.map((reward) => {
              const affordable = balance >= reward.cost;
              return (
                <li
                  key={reward.id}
                  className="flex items-center gap-space-sm rounded-xl bg-surface-container-lowest p-space-md shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-space-xs">
                      <p className="text-body-md font-semibold text-on-surface">
                        {reward.name}
                      </p>
                      {!reward.available ? (
                        <span className="flex items-center gap-1 rounded bg-surface-container px-1.5 py-0.5 text-label-sm font-medium text-on-surface-variant">
                          <Lock size={11} aria-hidden="true" />
                          Coming soon
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-body-sm text-on-surface-variant">
                      {reward.description}
                    </p>
                  </div>
                  <span
                    className={[
                      "shrink-0 rounded-full px-3 py-1.5 text-label-md font-bold tabular-nums",
                      affordable
                        ? "bg-on-tertiary-container/10 text-on-tertiary-container"
                        : "bg-surface-container text-on-surface-variant",
                    ].join(" ")}
                  >
                    {reward.cost}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-space-xs px-1 text-label-sm text-on-surface-variant">
            Business quest rewards — vouchers, free sessions and the like — are claimed on
            the quest itself and funded by the business running it.
          </p>
        </section>

        {/* ── History ─────────────────────────────────────────────────── */}
        <section aria-label="Recent activity">
          <h2 className="mb-space-xs text-headline-sm text-on-surface">Recent activity</h2>
          {history.length === 0 ? (
            <div className="rounded-xl bg-surface-container-lowest px-space-md py-space-lg text-center shadow-sm">
              <p className="text-body-md text-on-surface">No coins earned yet.</p>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Open the app tomorrow and you&apos;ll have your first.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant rounded-xl bg-surface-container-lowest px-space-md shadow-sm">
              {history.map((event) => (
                <li key={event.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate text-body-md text-on-surface">
                      {COIN_REASON_LABEL[event.reason] ?? event.reason}
                    </p>
                    <p className="text-label-sm text-on-surface-variant">
                      {new Date(event.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <span
                    className={[
                      "shrink-0 text-label-lg font-bold tabular-nums",
                      event.delta > 0 ? "text-on-tertiary-container" : "text-on-surface-variant",
                    ].join(" ")}
                  >
                    {event.delta > 0 ? `+${event.delta}` : event.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Required for this to remain a loyalty programme rather than a
            financial product — see the migration's design contract. */}
        <p className="px-1 pb-space-md text-label-sm text-on-surface-variant/80">
          StrivCoins have no cash value, cannot be bought, transferred or exchanged for
          money, and may expire or change.
        </p>
      </div>
    </div>
  );
}
