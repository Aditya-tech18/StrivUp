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

import Image from "next/image";
import Link from "next/link";
import { Bell, ChevronRight, Flame, Trophy, User } from "lucide-react";
import { FeedCard } from "@/components/features/FeedCard";
import { TodaysTasks } from "@/components/features/TodaysTasks";
import { createClient } from "@/lib/supabase/server";
import { getFeedPosts } from "@/lib/data/feed";
import {
  getTodaysTasks,
  getTodaysQuestTasks,
  pickHomeTasks,
  type TodayTask,
} from "@/lib/data/today";
import { getProfileSuggestions, getFacepiles, type Facepile as FacepileData } from "@/lib/data/social";
import { Facepile } from "@/components/features/people/Facepile";
import { SuggestedAccountsRail } from "@/components/features/people/SuggestedAccountsRail";
import { getCoinStateWithCheckin } from "@/lib/data/coins";
import { CoinPill } from "@/components/features/CoinPill";
import { BrandMark, MobileMenu } from "@/components/ui";

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
/**
 * A card in the Active rail. Carries the creator's cover, because a wall of
 * identical text cards is unreadable once someone is in more than two things,
 * and the cover is how people recognise their own challenge at a glance.
 */
function ActiveCard({ task, pile }: { task: TodayTask; pile?: FacepileData }) {
  const isQuest = task.kind === "quest";
  const progress =
    task.durationDays && task.durationDays > 0
      ? Math.min(100, Math.round((task.dayNumber / task.durationDays) * 100))
      : 0;

  return (
    <Link
      href={`/${isQuest ? "quests" : "challenges"}/${task.challengeId}`}
      className="relative flex w-[280px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest elev-1 surface-raised"
    >
      <div className="relative h-28 w-full shrink-0 overflow-hidden bg-surface-container">
        {task.thumbnailUrl ? (
          <Image
            src={task.thumbnailUrl}
            alt=""
            fill
            sizes="280px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-container-high">
            <Trophy size={24} className="text-on-surface-variant opacity-40" aria-hidden="true" />
          </div>
        )}
        <span className="absolute left-2 top-2 flex w-fit items-center gap-1 rounded-full bg-surface-container-lowest/90 px-2 py-0.5 text-label-sm font-medium text-on-surface backdrop-blur-sm">
          <span
            className={`h-1.5 w-1.5 rounded-full ${isQuest ? "bg-tertiary-fixed" : "bg-secondary"}`}
            aria-hidden="true"
          />
          {isQuest ? "Quest" : "Challenge"}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-space-md p-space-md">
      <div className="flex flex-col gap-space-sm">
        <h4 className="line-clamp-2 text-headline-sm text-on-surface">{task.challengeTitle}</h4>
      </div>

      <div className="flex flex-col gap-2 pt-space-xs">
        <div className="flex items-baseline justify-between text-label-sm">
          <span className="font-semibold text-on-surface">
            {isQuest ? (
              task.dayLabel
            ) : (
              <>
                Day {task.dayNumber}
                {task.durationDays ? (
                  <span className="font-normal text-on-surface-variant">/{task.durationDays}</span>
                ) : null}
              </>
            )}
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

        {/* Who else is in it. The faces are the point: a card showing "12
            joined" and a card showing three faces plus a name are the same
            number and a different thing. */}
        {pile && pile.total > 0 && (
          <Facepile
            people={pile.people}
            total={pile.total}
            verb="Joined by"
            noun="person"
            size={20}
          />
        )}
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
  const [today, posts, coins, questTasks, suggestions] = await Promise.all([
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
    user ? getTodaysQuestTasks(supabase, user.id) : Promise.resolve([]),
    user ? getProfileSuggestions(supabase, 12) : Promise.resolve([]),
  ]);

  /* One card per challenge or quest, not per task, and the two interleaved
     so neither kind is buried behind a run of the other. */
  const activeChallenges = Array.from(
    new Map(today.tasks.map((t) => [t.challengeId, t])).values()
  );
  const activeQuests = Array.from(
    new Map(questTasks.map((t) => [t.challengeId, t])).values()
  );
  const activeItems: TodayTask[] = [];
  for (let i = 0; i < Math.max(activeChallenges.length, activeQuests.length); i += 1) {
    if (activeChallenges[i]) activeItems.push(activeChallenges[i]);
    if (activeQuests[i]) activeItems.push(activeQuests[i]);
  }

  /* Home shows three challenges, not everything: two the person is keeping
     up with and one they are slipping on. See pickHomeTasks. */
  const homeSummary = { ...today, tasks: pickHomeTasks(today.tasks) };

  /* Faces for the rail. Two queries for the whole rail rather than two per
     card, and only for the ids actually on screen. */
  const [challengePiles, questPiles] = await Promise.all([
    getFacepiles(
      supabase,
      "challenge_participants",
      activeChallenges.map((t) => t.challengeId),
      3
    ),
    getFacepiles(
      supabase,
      "quest_participants",
      activeQuests.map((t) => t.challengeId),
      3
    ),
  ]);

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Sticky header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-surface/80 pt-safe elev-1 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-gutter">
          <div className="flex items-center gap-space-sm">
            <MobileMenu />
            <BrandMark variant="mark" height={26} priority />
            <div className="flex flex-col">
              <BrandMark variant="wordmark" height={16} />
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
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container-high px-space-md py-1.5 elev-1 transition-transform active:scale-95 tap-target"
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
            className="flex items-center gap-space-md rounded-xl bg-primary p-space-md text-on-primary elev-1"
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
              className="ml-auto shrink-0 rounded-lg bg-on-primary px-space-md py-2 text-label-md font-semibold text-primary tap-target"
            >
              View
            </Link>
          </section>
        ) : null}

        {/* ── 0. People to follow ─────────────────────────────────────
            Above the fold on purpose: a habit app is only worth opening if
            somebody can see you, and an account following nobody has nothing
            in its feed to come back for. Skippable, and it hides itself once
            there is nobody left to suggest. */}
        {user && suggestions.length > 0 ? (
          <SuggestedAccountsRail people={suggestions} viewerId={user.id} />
        ) : null}

        {/* ── 1. Today's Tasks ───────────────────────────────────────── */}
        <TodaysTasks summary={homeSummary} questTasks={questTasks} />

        {/* ── 2. Active challenges ───────────────────────────────────── */}
        {activeItems.length > 0 ? (
          <section
            className="flex flex-col gap-space-sm"
            aria-label="Active challenges and quests"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <h3 className="text-headline-sm text-on-surface">
                  Active Challenges &amp; Quests
                </h3>
                <span className="text-label-sm font-medium text-on-surface-variant">
                  ({activeItems.length})
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
              {activeItems.map((task) => (
                <ActiveCard
                  key={task.key}
                  task={task}
                  pile={
                    task.kind === "quest"
                      ? questPiles.get(task.challengeId)
                      : challengePiles.get(task.challengeId)
                  }
                />
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
            <div className="rounded-xl bg-surface-container-lowest px-space-md py-space-xl text-center elev-1 surface-raised">
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
