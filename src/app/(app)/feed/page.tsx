/**
 * app/(app)/feed/page.tsx — Home Feed
 *
 * Server component. Three stacked sections, in deliberate order:
 *
 *   1. Today's Tasks    — what YOU owe today, with a closing meter.
 *   2. Active Challenges — a swipeable carousel of your in-flight sprints.
 *   3. Live Cohort Proof — what everyone else is shipping.
 *
 * The order is the product thesis: the home screen is a to-do list first and a
 * social feed second. A passive wall of other people's proofs gives nobody a
 * reason to open the app on day 9; an unfinished checklist does.
 *
 * All counts are real. Where the design mockups showed large placeholder
 * figures ("4,821 builders grinding"), this renders actual data and leans on
 * early-adopter framing when the numbers are small.
 */

import Link from "next/link";
import { Bell, ChevronRight, Flame, Trophy, User } from "lucide-react";
import { FeedCard } from "@/components/features/FeedCard";
import { TodaysTasks } from "@/components/features/TodaysTasks";
import { createClient } from "@/lib/supabase/server";
import { getFeedPosts } from "@/lib/data/feed";
import { getTodaysTasks, type TodayTask } from "@/lib/data/today";
import { getCoinStateWithCheckin } from "@/lib/data/coins";
import { CoinPill } from "@/components/features/CoinPill";

/** "Thursday, 24 May" — matches the design's date eyebrow. */
function todayLabel(): string {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Greeting keyed to progress rather than time of day. "Good morning" is filler;
 * "2 left today" is information.
 */
function greeting(completed: number, total: number): string {
  if (total === 0) return "Start Something";
  if (completed === total) return "Fully Locked In";
  if (completed === 0) return "Stay Locked In";
  return `${total - completed} Left Today`;
}

/* ── Active challenge card (carousel item) ───────────────────────────────── */
function ChallengeCard({ task }: { task: TodayTask }) {
  const progress =
    task.durationDays && task.durationDays > 0
      ? Math.min(100, Math.round((task.dayNumber / task.durationDays) * 100))
      : 0;

  return (
    <Link
      href={`/challenges/${task.challengeId}`}
      className="relative flex w-[280px] shrink-0 snap-start flex-col justify-between gap-space-md overflow-hidden rounded-xl bg-surface-container-lowest p-space-md shadow-sm"
    >
      <div
        className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-secondary/5"
        aria-hidden="true"
      />

      <div className="flex flex-col gap-space-sm">
        <span className="flex w-fit items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 text-label-sm font-medium text-on-surface">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
          Challenge
        </span>
        <h4 className="text-headline-sm text-on-surface">{task.challengeTitle}</h4>
      </div>

      <div className="flex flex-col gap-2 pt-space-xs">
        <div className="flex items-baseline justify-between text-label-sm">
          <span className="font-semibold text-on-surface">
            Day {task.dayNumber}
            {task.durationDays ? (
              <span className="font-normal text-on-surface-variant">/{task.durationDays}</span>
            ) : null}
          </span>
          <span
            className={
              task.state === "done"
                ? "font-semibold text-on-tertiary-container"
                : "font-medium text-on-surface-variant"
            }
          >
            {task.state === "done"
              ? "Logged today"
              : task.state === "pending"
                ? "Verifying"
                : "Not logged yet"}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </Link>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default async function FeedPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts guards this route, so `user` is present in practice; the fallback
  // keeps the page renderable rather than throwing if that ever changes.
  const [today, posts, coins] = await Promise.all([
    user
      ? getTodaysTasks(supabase, user.id)
      : Promise.resolve({
          tasks: [],
          completed: 0,
          total: 0,
          percent: 0,
          resetsInMs: 0,
          bestStreak: 0,
          justCompleted: 0,
        }),
    getFeedPosts(supabase, { limit: 20, viewerId: user?.id }),
    // Claims the daily check-in as a side effect. Deduped on the IST calendar
    // date in Postgres, so opening the feed twice earns one coin, not two.
    user
      ? getCoinStateWithCheckin(supabase, user.id)
      : Promise.resolve({ balance: 0, earnedToday: 0 }),
  ]);

  // One card per challenge, not per task.
  const activeChallenges = Array.from(
    new Map(today.tasks.map((t) => [t.challengeId, t])).values()
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Sticky header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-surface/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-gutter">
          <div className="flex items-center gap-space-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Flame size={20} className="text-secondary" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="text-headline-sm tracking-tight text-on-surface">StrivUp</span>
              <span className="text-label-sm font-medium text-on-surface-variant">Home Feed</span>
            </div>
          </div>

          <div className="flex items-center gap-space-xs">
            <Link
              href="/alerts"
              aria-label="Alerts"
              className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-on-surface"
            >
              <Bell size={22} strokeWidth={1.75} aria-hidden="true" />
            </Link>
            <Link
              href="/profile"
              aria-label="Profile"
              className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-on-surface"
            >
              <User size={22} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-space-lg px-gutter pb-space-xl">
        {/* ── Date + streak pill ─────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-space-sm">
          <div className="flex flex-col">
            <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">
              {todayLabel()}
            </span>
            <h2 className="text-headline-lg-mobile text-on-surface">
              {greeting(today.completed, today.total)}
            </h2>
          </div>

          {/* Reward and consistency read in one glance. */}
          <div className="flex shrink-0 items-center gap-space-xs">
            {today.bestStreak > 0 ? (
              <Link
                href="/profile#consistency"
                aria-label={`${today.bestStreak} day streak. See your consistency heatmap.`}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container-high px-space-md py-1.5 shadow-sm transition-transform active:scale-95"
              >
                <Flame size={15} className="text-secondary" aria-hidden="true" />
                <span className="text-label-md font-bold text-on-surface">
                  {today.bestStreak}
                </span>
              </Link>
            ) : null}
            <CoinPill balance={coins.balance} earnedToday={coins.earnedToday} />
          </div>
        </div>

        {/* ── Completion celebration ─────────────────────────────────────
            Shown once, on the first visit after a challenge finishes. This is
            the payoff the product had no way of delivering before — and the
            moment most likely to make someone tell a friend. */}
        {today.justCompleted > 0 ? (
          <section
            aria-label="Challenge completed"
            className="flex items-center gap-space-md rounded-xl bg-primary p-space-md text-on-primary shadow-sm"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-on-tertiary-container/20">
              <Trophy size={22} className="text-tertiary-fixed" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-label-lg font-bold">
                You finished{" "}
                {today.justCompleted === 1
                  ? "a challenge"
                  : `${today.justCompleted} challenges`}
                .
              </p>
              <p className="text-body-sm text-primary-fixed-dim">
                Every day of it is on your profile. Go and look.
              </p>
            </div>
            <Link
              href="/profile"
              className="ml-auto shrink-0 rounded-lg bg-on-primary px-space-md py-2 text-label-md font-semibold text-primary"
            >
              View
            </Link>
          </section>
        ) : null}

        {/* ── 1. Today's Tasks ───────────────────────────────────────── */}
        <TodaysTasks summary={today} />

        {/* ── 2. Active challenges ───────────────────────────────────── */}
        {activeChallenges.length > 0 ? (
          <section className="flex flex-col gap-space-sm" aria-label="Active challenges">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <h3 className="text-headline-sm text-on-surface">Active Challenges</h3>
                <span className="text-label-sm font-medium text-on-surface-variant">
                  ({activeChallenges.length})
                </span>
              </div>
              <Link
                href="/explore"
                className="flex items-center text-label-md font-medium text-secondary hover:underline"
              >
                Explore
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>

            <div className="no-scrollbar -mx-gutter flex snap-x snap-mandatory gap-space-md overflow-x-auto px-gutter pb-2">
              {activeChallenges.map((task) => (
                <ChallengeCard key={task.challengeId} task={task} />
              ))}
            </div>
          </section>
        ) : null}

        {/* ── 3. Live cohort proof ───────────────────────────────────── */}
        <section className="flex flex-col gap-space-sm" aria-label="Community proof feed">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <span
                className="h-2 w-2 rounded-full bg-on-tertiary-container"
                aria-hidden="true"
              />
              <h3 className="text-headline-sm text-on-surface">Live Cohort Proof</h3>
            </div>
            {posts.length > 0 ? (
              <span className="text-label-sm text-on-surface-variant">
                {posts.length} verified {posts.length === 1 ? "proof" : "proofs"}
              </span>
            ) : null}
          </div>

          {posts.length > 0 ? (
            <div className="flex flex-col gap-space-md">
              {posts.map((post) => (
                <FeedCard key={post.id} post={post} viewerId={user?.id ?? null} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-surface-container-lowest px-space-md py-space-xl text-center shadow-sm">
              <p className="text-headline-sm text-on-surface">No proof posted yet</p>
              <p className="mx-auto mt-1 max-w-xs text-body-sm text-on-surface-variant">
                This is where verified proof from everyone in your challenges shows up. Be
                the first to put something here.
              </p>
              {/* A quiet link, not a second dark slab — Today's Tasks above
                  already owns the primary call to action on an empty home, and
                  two identical buttons pointing at /explore read as a mistake. */}
              <Link
                href="/explore"
                className="mt-space-sm inline-block text-label-md font-semibold text-secondary hover:underline"
              >
                Browse challenges
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
