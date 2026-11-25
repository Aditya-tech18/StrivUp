import Link from "next/link";
import { ArrowRight, Flame, Search, Trophy, User } from "lucide-react";
import { FeedCard } from "@/components/features/FeedCard";
import { ActiveCard } from "@/components/features/home/ActiveCard";
import { DiscoverList } from "@/components/features/home/DiscoverList";
import { TodaySpotlight } from "@/components/features/home/TodaySpotlight";
import { TodaysTasks } from "@/components/features/TodaysTasks";
import { SuggestedAccountsRail } from "@/components/features/people/SuggestedAccountsRail";
import { CoinPill } from "@/components/features/CoinPill";
import { AlertsBell, BrandMark, MobileMenu } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getPopularOngoing } from "@/lib/data/discover";
import { getFeedPosts } from "@/lib/data/feed";
import {
  getTodaysTasks,
  getTodaysQuestTasks,
  pickHomeTasks,
  type TodayTask,
} from "@/lib/data/today";
import { getProfileSuggestions, getFacepiles } from "@/lib/data/social";
import { getCoinStateWithCheckin } from "@/lib/data/coins";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Kolkata",
});

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    getFeedPosts(supabase, { limit: 3, viewerId: user?.id }),
    // The daily check-in is deduplicated on the IST calendar date in Postgres.
    user
      ? getCoinStateWithCheckin(supabase, user.id)
      : Promise.resolve({ balance: 0, earnedToday: 0 }),
    user ? getTodaysQuestTasks(supabase, user.id) : Promise.resolve([]),
    user ? getProfileSuggestions(supabase, 12) : Promise.resolve([]),
  ]);

  const activeChallenges = Array.from(
    new Map(today.tasks.map((task) => [task.challengeId, task])).values()
  );
  const activeQuests = Array.from(
    new Map(questTasks.map((task) => [task.challengeId, task])).values()
  );
  const activeItems: TodayTask[] = [];
  for (let i = 0; i < Math.max(activeChallenges.length, activeQuests.length); i += 1) {
    if (activeChallenges[i]) activeItems.push(activeChallenges[i]);
    if (activeQuests[i]) activeItems.push(activeQuests[i]);
  }

  const [discover, challengePiles, questPiles] = await Promise.all([
    activeItems.length === 0 && user ? getPopularOngoing(supabase, 8) : Promise.resolve([]),
    getFacepiles(
      supabase,
      "challenge_participants",
      activeChallenges.map((task) => task.challengeId),
      3
    ),
    getFacepiles(
      supabase,
      "quest_participants",
      activeQuests.map((task) => task.challengeId),
      3
    ),
  ]);
  const homeSummary = { ...today, tasks: pickHomeTasks(today.tasks) };
  const allTasks = [...today.tasks, ...questTasks];
  const spotlight =
    allTasks.find((task) => task.state === "todo" || task.state === "rejected") ??
    allTasks.find((task) => task.state === "pending") ??
    allTasks[0];

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface-container-lowest/95 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileMenu />
            <BrandMark variant="mark" height={24} priority className="shrink-0" />
            <span className="truncate font-display text-lg font-extrabold text-on-surface">
              StrivUp
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/search"
              aria-label="Search"
              data-tour="nav-search"
              className="grid size-11 place-items-center rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-secondary focus-visible:outline-2 focus-visible:outline-secondary"
            >
              <Search size={19} aria-hidden="true" />
            </Link>
            <AlertsBell />
            <Link
              href="/profile"
              aria-label="Profile"
              data-tour="nav-profile"
              className="grid size-11 place-items-center rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-secondary focus-visible:outline-2 focus-visible:outline-secondary"
            >
              <User size={20} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pt-5 pb-8 sm:px-6 sm:pt-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-on-surface-variant">
              {dateFormat.format(new Date())}
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
              Today
            </h1>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {today.bestStreak > 0 ? (
              <Link
                href="/profile#consistency"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-streak px-3 text-xs font-bold text-on-streak focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                <Flame size={16} aria-hidden="true" /> {today.bestStreak}-day streak
              </Link>
            ) : null}
            <CoinPill balance={coins.balance} earnedToday={coins.earnedToday} />
          </div>
        </div>

        {today.justCompleted > 0 ? (
          <section
            aria-label="Challenge completed"
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-streak/40 bg-streak/15 p-4"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-streak text-on-streak">
              <Trophy size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-on-surface">
                You finished{" "}
                {today.justCompleted === 1 ? "a challenge" : `${today.justCompleted} challenges`}.
              </p>
              <p className="text-sm text-on-surface-variant">
                See what you achieved on your profile.
              </p>
            </div>
            <Link
              href="/profile"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-secondary hover:underline"
            >
              View profile <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </section>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            {spotlight ? <TodaySpotlight task={spotlight} /> : null}
            <TodaysTasks summary={homeSummary} questTasks={questTasks} />
          </div>

          <aside
            aria-label="Challenges and quests"
            className="flex min-w-0 flex-col gap-4 lg:row-span-2"
          >
            {activeItems.length > 0 ? (
              <section
                aria-labelledby="active-tracker-heading"
                className="flex min-w-0 flex-col gap-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="active-tracker-heading" className="text-lg font-bold text-on-surface">
                    Active trackers
                  </h2>
                  <Link
                    href="/challenges"
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-secondary hover:underline"
                  >
                    All challenges <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
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
              </section>
            ) : (
              <DiscoverList items={discover} />
            )}

            <Link
              href="/how-quests-work"
              className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 text-sm font-bold text-secondary hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              How local quests work <ArrowRight size={16} aria-hidden="true" />
            </Link>
            {user && suggestions.length > 0 ? (
              <SuggestedAccountsRail people={suggestions} viewerId={user.id} />
            ) : null}
          </aside>

          <section
            aria-labelledby="community-proof-heading"
            className="flex min-w-0 flex-col gap-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="community-proof-heading" className="text-xl font-extrabold text-on-surface">
                Community proof
              </h2>
              <Link
                href="/feed/community"
                className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-secondary hover:underline focus-visible:outline-2 focus-visible:outline-secondary"
              >
                View community feed <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
            {posts.length > 0 ? (
              posts.map((post) => (
                <FeedCard key={post.id} post={post} viewerId={user?.id ?? null} />
              ))
            ) : (
              <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 text-center">
                <p className="font-display text-base font-bold text-on-surface">
                  No proof posted yet
                </p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-on-surface-variant">
                  Verified proof from your challenges will show up here.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
