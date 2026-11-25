import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Coins,
  Flag,
  Gift,
  History,
  Lock,
  MapPin,
  Snowflake,
  Sparkles,
  Trophy,
  Users,
  UserRound,
} from "lucide-react";
import {
  COIN_REASON_LABEL,
  type CoinEvent,
  type CoinReward,
  type CoinRules,
} from "@/lib/data/coins";

const coinNumber = new Intl.NumberFormat("en-IN");

const REWARD_ICONS: Record<string, typeof Gift> = {
  streak_freeze: Snowflake,
  profile_frame: UserRound,
  challenge_boost: Sparkles,
};

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
      <span className="shrink-0 rounded-full bg-coin/15 px-2.5 py-1 text-label-sm font-bold text-coin-ink">
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
      icon: <BadgeCheck size={17} className="text-streak-ink" aria-hidden="true" />,
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
      icon: <Trophy size={17} className="text-streak-ink" aria-hidden="true" />,
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
      icon: <Flag size={17} className="text-streak-ink" aria-hidden="true" />,
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
  const availableRewards = rewards.filter((reward) => reward.available).length;
  const card = "rounded-2xl border border-outline-variant bg-surface-container-lowest";

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/95 pt-safe backdrop-blur-sm">
        <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/feed"
            aria-label="Back to Today"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          <h1 className="font-display text-headline-md font-bold text-on-surface">StrivCoins</h1>
        </div>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6">
        <section
          aria-labelledby="coin-balance-title"
          className={`${card} bg-[radial-gradient(ellipse_at_top_right,color-mix(in_srgb,var(--color-coin)_14%,transparent),transparent_65%)] p-4 sm:p-5`}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <h2 id="coin-balance-title" className="text-body-sm font-semibold text-on-surface-variant">
              Available balance
            </h2>
            <a
              href="#coin-earning"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-label-md font-bold text-coin-ink transition-colors hover:bg-coin/15"
            >
              How StrivCoins work <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
          <p className="flex items-center gap-2.5 font-display text-display-mobile font-extrabold tabular-nums text-coin-ink">
            <Coins size={29} aria-hidden="true" />
            {coinNumber.format(balance)}
            <span aria-hidden="true" className="text-headline-sm font-bold">SC</span>
            <span className="sr-only">{balance === 1 ? "StrivCoin" : "StrivCoins"}</span>
          </p>
        </section>

        <nav aria-label="StrivCoins sections" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-container p-1">
          <a
            href="#coin-perks"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-2 text-center text-label-lg font-bold text-on-secondary transition-colors hover:bg-secondary/85"
          >
            <Gift size={16} aria-hidden="true" /> Perks catalog
          </a>
          <a
            href="#coin-activity"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-center text-label-lg font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
          >
            <History size={16} aria-hidden="true" /> Coin activity
          </a>
        </nav>

        <section id="coin-perks" aria-labelledby="coin-perks-title" className="scroll-mt-20">
          <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h2 id="coin-perks-title" className="font-display text-headline-md font-bold text-on-surface">Perks catalog</h2>
            {availableRewards > 0 && (
              <span className="rounded-full bg-streak px-2 py-1 text-label-sm font-bold text-on-streak">
                {availableRewards} available
              </span>
            )}
          </div>
          <ul className="grid gap-3">
            {rewards.map((reward) => {
              const Icon = REWARD_ICONS[reward.id] ?? Gift;
              const needed = Math.max(0, reward.cost - balance);
              return (
                <li key={reward.id} className={`${card} p-4`}>
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-coin/12 text-coin-ink">
                      <Icon size={21} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1">
                        <h3 className="text-body-lg font-bold leading-tight text-on-surface">{reward.name}</h3>
                        <span className="shrink-0 text-body-md font-bold tabular-nums text-coin-ink">
                          {coinNumber.format(reward.cost)} SC
                        </span>
                      </div>
                      <p className="mt-1 text-body-sm text-on-surface-variant">{reward.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-label-md font-semibold text-on-surface-variant">
                    {!reward.available ? (
                      <><Lock size={14} aria-hidden="true" /> Coming soon</>
                    ) : needed > 0 ? (
                      <><Lock size={14} aria-hidden="true" /> {coinNumber.format(needed)} SC to go</>
                    ) : (
                      <><BadgeCheck size={15} className="text-streak-ink" aria-hidden="true" /> Balance sufficient</>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 px-1 text-label-sm text-on-surface-variant">
            Claim business vouchers, free sessions and other quest rewards from their quest pages.
          </p>
        </section>

        <section id="coin-activity" aria-labelledby="coin-activity-title" className={`${card} scroll-mt-20 p-4 sm:p-5`}>
          <h2 id="coin-activity-title" className="mb-3 flex items-center gap-2 font-display text-headline-md font-bold text-on-surface">
            <History size={19} className="shrink-0 text-secondary" aria-hidden="true" />
            Recent coin activity
          </h2>
          {history.length === 0 ? (
            <div className="rounded-xl bg-surface-container-low px-4 py-5 text-center">
              <p className="text-body-md font-semibold text-on-surface">No coin activity yet.</p>
              <p className="mt-1 text-body-sm text-on-surface-variant">Coins you earn will appear here.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {history.map((event) => (
                <li key={event.id} className="flex items-center gap-3 rounded-xl bg-surface-container-low px-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-coin/12 text-coin-ink">
                    <Coins size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-md font-medium text-on-surface">
                      {COIN_REASON_LABEL[event.reason] ?? event.reason}
                    </p>
                    <time dateTime={event.createdAt} className="text-label-sm text-on-surface-variant">
                      {new Date(event.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </time>
                  </div>
                  <span className={`shrink-0 text-label-lg font-bold tabular-nums ${event.delta > 0 ? "text-streak-ink" : "text-on-surface-variant"}`}>
                    {event.delta > 0 && "+"}{coinNumber.format(event.delta)} SC
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="coin-earning" aria-labelledby="coin-earning-title" className="scroll-mt-20">
          <h2 id="coin-earning-title" className="mb-3 font-display text-headline-md font-bold text-on-surface">How you earn</h2>
          {rules ? (
            <>
              <ul className={`${card} divide-y divide-outline-variant px-4`}>
                {earnRows(rules).map((row) => (
                  <EarnRow key={row.title} {...row} />
                ))}
              </ul>
              <p className="mt-3 px-1 text-label-sm text-on-surface-variant">
                Earn up to {rules.daily_global_cap} coins a day from everyday actions, plus extra for
                finishing challenges and quests. Challenges you create yourself pay {Math.round(rules.self_created_multiplier * 100)}%.
              </p>
            </>
          ) : (
            <p className={`${card} p-4 text-body-sm text-on-surface-variant`}>
              Couldn&apos;t load the earning rates right now.
            </p>
          )}
        </section>

        <p className="px-1 pb-6 text-label-sm text-on-surface-variant">
          StrivCoins have no cash value, cannot be bought, transferred or exchanged for money, and may expire or change.
        </p>
      </div>
    </div>
  );
}
