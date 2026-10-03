/**
 * /dev/feed-preview — dev-only visual harness for the home-feed sections.
 *
 * The home feed sits behind auth, so its components could never be eyeballed
 * without a live session. This renders them against fabricated data in every
 * state that matters, so layout and spacing can be reviewed and iterated on
 * directly.
 *
 * 404s in production, like /dev/components. Nothing here reaches real data.
 */

import { notFound } from "next/navigation";
import { TodaysTasks } from "@/components/features/TodaysTasks";
import { CoinPill } from "@/components/features/CoinPill";
import { Flame } from "lucide-react";
import type { TodaySummary, TodayTask } from "@/lib/data/today";

function task(over: Partial<TodayTask> & { key: string }): TodayTask {
  return {
    challengeId: "c1",
    challengeTitle: "100 Days of LeetCode",
    taskId: null,
    title: "100 Days of LeetCode",
    dayLabel: "Day 42 of 100",
    dayNumber: 42,
    durationDays: 100,
    proofType: null,
    state: "todo",
    ...over,
  };
}

function summary(over: Partial<TodaySummary>): TodaySummary {
  return {
    tasks: [],
    completed: 0,
    total: 0,
    percent: 0,
    resetsInMs: 6 * 3600_000 + 12 * 60_000,
    bestStreak: 0,
    justCompleted: 0,
    ...over,
  };
}

const MIXED = [
  task({ key: "a", title: "Solve 1 hard problem", taskId: "t1", state: "done" }),
  task({
    key: "b",
    title: "Morning run 5KM",
    taskId: "t2",
    challengeTitle: "Winter Arc",
    state: "todo",
    proofType: "photo",
  }),
  task({ key: "c", title: "Read 20 pages", taskId: "t3", state: "rejected" }),
];

const CASES: Array<{ label: string; note: string; data: TodaySummary }> = [
  {
    label: "Empty — nothing joined",
    note: "The activation moment. This is what a brand-new user sees.",
    data: summary({}),
  },
  {
    label: "Mixed states",
    note: "done / todo / retry, with the segmented Discipline Index.",
    data: summary({ tasks: MIXED, completed: 1, total: 3, percent: 33, bestStreak: 14 }),
  },
  {
    label: "One task, pending review",
    note: "Single-task challenge awaiting the AI verdict.",
    data: summary({
      tasks: [task({ key: "d", state: "pending" })],
      completed: 0,
      total: 1,
      percent: 0,
      bestStreak: 3,
    }),
  },
  {
    label: "All done",
    note: "The reward state — everything logged.",
    data: summary({
      tasks: [
        task({ key: "e", title: "Solve 1 hard problem", taskId: "t1", state: "done" }),
        task({ key: "f", title: "Morning run 5KM", taskId: "t2", state: "done" }),
      ],
      completed: 2,
      total: 2,
      percent: 100,
      bestStreak: 21,
    }),
  },
];

export default function FeedPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto flex max-w-md flex-col gap-space-xl px-gutter py-space-lg">
        <header>
          <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
            Dev harness
          </p>
          <h1 className="text-headline-lg-mobile text-on-surface">Home feed sections</h1>
          <p className="mt-space-xs text-body-sm text-on-surface-variant">
            Fabricated data. Not reachable in production.
          </p>
        </header>

        {/* Header pills, as they sit in the feed */}
        <section className="flex flex-col gap-space-sm">
          <div className="border-l-2 border-secondary pl-space-sm">
            <h2 className="text-label-lg text-on-surface">Header pills</h2>
            <p className="text-body-sm text-on-surface-variant">
              Streak + StrivCoin. Second row shows the first-visit-of-day flourish.
            </p>
          </div>
          <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-lowest p-space-md elev-1 surface-raised">
            <div className="flex items-center justify-end gap-space-xs">
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container-high px-space-md py-1.5 elev-1">
                <Flame size={15} className="text-secondary" aria-hidden="true" />
                <span className="text-label-md font-bold text-on-surface">14</span>
              </div>
              <CoinPill balance={248} earnedToday={0} />
            </div>
            <div className="flex items-center justify-end gap-space-xs">
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container-high px-space-md py-1.5 elev-1">
                <Flame size={15} className="text-secondary" aria-hidden="true" />
                <span className="text-label-md font-bold text-on-surface">14</span>
              </div>
              <CoinPill balance={249} earnedToday={1} />
            </div>
            <div className="flex items-center justify-end gap-space-xs">
              <CoinPill balance={0} earnedToday={0} />
            </div>
          </div>
        </section>

        {CASES.map((c) => (
          <section key={c.label} className="flex flex-col gap-space-sm">
            <div className="border-l-2 border-secondary pl-space-sm">
              <h2 className="text-label-lg text-on-surface">{c.label}</h2>
              <p className="text-body-sm text-on-surface-variant">{c.note}</p>
            </div>
            <TodaysTasks summary={c.data} />
          </section>
        ))}
      </div>
    </div>
  );
}
