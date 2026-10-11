"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import type { TodaySummary, TodayTask } from "@/lib/data/today";

/**
 * TodaysTasks — the daily-return surface.
 *
 * A client component only because of the live "resets in" countdown; the data
 * itself is fetched on the server and passed in. The countdown is seeded from
 * the server's `resetsInMs` and then ticks locally, so there is no hydration
 * mismatch from calling Date.now() during render.
 *
 * Tapping a row goes to the challenge page, which owns the upload flow — this
 * component never uploads, so there is one proof-submission path in the app.
 */

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Leading icon per state. Rejected reads as "try again", not as failure. */
function StateIcon({ state, proofType }: { state: TodayTask["state"]; proofType: TodayTask["proofType"] }) {
  if (state === "done") {
    return <CheckCircle2 size={18} className="text-on-tertiary-container" aria-hidden="true" />;
  }
  if (state === "pending") {
    return <Clock size={18} className="text-secondary" aria-hidden="true" />;
  }
  if (state === "rejected") {
    return <RotateCcw size={18} className="text-error" aria-hidden="true" />;
  }
  if (proofType === "photo") {
    return <Camera size={18} className="text-on-surface-variant" aria-hidden="true" />;
  }
  return <BookOpen size={18} className="text-on-surface-variant" aria-hidden="true" />;
}

function TaskRow({ task }: { task: TodayTask }) {
  const isDone = task.state === "done";

  return (
    <Link
      // challengeId carries the quest id on a quest row; `kind` is what routes.
      href={`/${task.kind === "quest" ? "quests" : "challenges"}/${task.challengeId}`}
      className="flex items-center justify-between gap-space-sm rounded-lg bg-surface-container-low p-space-sm transition-transform active:scale-[0.99]"
    >
      <div className="flex min-w-0 items-center gap-space-sm">
        <div
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            isDone
              ? "bg-on-tertiary-container/10"
              : task.state === "pending"
                ? "bg-secondary/10"
                : task.state === "rejected"
                  ? "bg-error-container"
                  : "bg-surface-container",
          ].join(" ")}
        >
          <StateIcon state={task.state} proofType={task.proofType} />
        </div>

        <div className="flex min-w-0 flex-col">
          <span
            className={[
              "truncate text-body-md font-medium",
              isDone ? "text-on-surface-variant" : "text-on-surface",
            ].join(" ")}
          >
            {task.title}
          </span>
          {/* When there is no task breakdown the title IS the challenge name,
              so repeating it here just prints it twice. Only a named task needs
              the challenge for context. */}
          <span className="truncate text-label-sm text-on-surface-variant">
            {task.taskId ? `${task.challengeTitle} · ${task.dayLabel}` : task.dayLabel}
          </span>
        </div>
      </div>

      {/* Trailing affordance — states read differently at a glance */}
      {isDone ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-on-tertiary-container/10 px-2.5 py-1 text-label-sm font-semibold text-on-tertiary-container">
          <Check size={13} aria-hidden="true" />
          Done
        </span>
      ) : task.state === "pending" ? (
        <span className="shrink-0 rounded-full bg-secondary/10 px-2.5 py-1 text-label-sm font-semibold text-secondary">
          Verifying
        </span>
      ) : (
        <span
          className={[
            "flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-label-sm font-semibold elev-1",
            task.state === "rejected"
              ? "bg-error-container text-on-error-container"
              : "bg-surface-container-lowest text-secondary",
          ].join(" ")}
        >
          <Upload size={14} aria-hidden="true" />
          {task.state === "rejected" ? "Retry" : "Upload"}
        </span>
      )}
    </Link>
  );
}

export function TodaysTasks({
  summary,
  questTasks = [],
}: {
  summary: TodaySummary;
  /** Outstanding quest tasks. Empty for anyone not on a quest, which hides
   *  the toggle entirely rather than offering an empty tab. */
  questTasks?: TodayTask[];
}) {
  const [view, setView] = useState<"challenges" | "quests">("challenges");
  // Initial value comes from the server so first paint matches the markup and
  // there is no hydration mismatch from calling Date.now() during render.
  // The interval then recomputes from the real clock rather than decrementing,
  // so it cannot drift and does not need to re-seed from props — which would
  // mean setting state synchronously inside an effect.
  const [remaining, setRemaining] = useState(summary.resetsInMs);

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      setRemaining(Math.max(0, midnight.getTime() - now.getTime()));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Nothing joined yet — this is the activation moment, so make it a CTA
  // rather than an apology.
  if (summary.total === 0 && questTasks.length === 0) {
    return (
      <section className="flex flex-col gap-space-sm" aria-label="Today's tasks">
        <h3 className="text-headline-sm text-on-surface">Today&apos;s Tasks</h3>
        <div className="rounded-xl bg-surface-container-lowest p-space-md elev-1 surface-raised">
          <p className="text-body-md text-on-surface">You have nothing due today.</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Join a challenge and it&apos;ll show up here every day until you finish it.
          </p>

          {/* Both paths out of an empty state: join something that exists, or
              start your own and invite people. Ranked rather than two equal
              slabs — most first-time users should join, not create. */}
          <div className="mt-space-md grid grid-cols-2 gap-space-sm">
            <Link
              href="/explore"
              className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-space-sm text-label-lg text-on-primary elev-1 transition-transform active:scale-[0.99]"
            >
              <Compass size={16} aria-hidden="true" />
              Browse
            </Link>
            <Link
              href="/challenges/new"
              className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-outline bg-surface-container-lowest px-space-sm text-label-lg text-on-surface transition-colors active:bg-surface-container"
            >
              <Plus size={16} aria-hidden="true" />
              Create
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const allDone = summary.total > 0 && summary.completed === summary.total;
  const showQuests = view === "quests" && questTasks.length > 0;
  const rows = showQuests ? questTasks : summary.tasks;
  const questsDone = questTasks.filter((t) => t.state === "done").length;

  return (
    <section className="flex flex-col gap-space-sm" aria-label="Today's tasks">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <h3 className="text-headline-sm text-on-surface">Today&apos;s Tasks</h3>
          <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-label-sm font-semibold text-secondary">
            {showQuests
              ? `${questsDone} of ${questTasks.length}`
              : `${summary.completed} of ${summary.total}`}
          </span>
        </div>
        {/* The countdown belongs to challenges only. Quest tasks are owed
            until they are done, not until midnight, so showing a reset timer
            over them would be a lie. */}
        {!showQuests && (
          <span className="text-label-sm text-on-surface-variant">
            Resets in {formatCountdown(remaining)}
          </span>
        )}
      </div>

      {questTasks.length > 0 && summary.total > 0 && (
        <div
          role="group"
          aria-label="Show challenges or quests"
          className="flex w-fit gap-1 rounded-full bg-surface-container p-0.5"
        >
          {(["challenges", "quests"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={[
                "rounded-full px-3 py-1 text-label-sm font-semibold capitalize transition-colors",
                view === v
                  ? "bg-surface-container-lowest text-on-surface elev-1"
                  : "text-on-surface-variant hover:text-on-surface",
              ].join(" ")}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-md elev-1 surface-raised">
        {/* ── Discipline Index ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-label-sm text-on-surface-variant">
            <span>Daily Discipline Index</span>
            <span className="font-bold text-on-surface">
              {showQuests
                ? `${questTasks.length === 0 ? 0 : Math.round((questsDone / questTasks.length) * 100)}%`
                : allDone
                  ? "Complete"
                  : `${summary.percent}%`}
            </span>
          </div>

          {/* One segment per task, so the bar is legible at any count. */}
          <div
            className="flex w-full gap-1.5"
            role="progressbar"
            aria-valuenow={showQuests ? questsDone : summary.completed}
            aria-valuemin={0}
            aria-valuemax={showQuests ? questTasks.length : summary.total}
            aria-label={`${showQuests ? questsDone : summary.completed} of ${
              showQuests ? questTasks.length : summary.total
            } tasks complete`}
          >
            {rows.map((t) => (
              <div
                key={t.key}
                className={[
                  "h-2 flex-1 rounded-full",
                  t.state === "done"
                    ? "bg-primary"
                    : t.state === "pending"
                      ? "bg-secondary animate-pulse"
                      : "bg-surface-container-highest",
                ].join(" ")}
              />
            ))}
          </div>
        </div>

        {/* ── Task rows ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-space-sm">
          {rows.map((task) => (
            <TaskRow key={task.key} task={task} />
          ))}
        </div>

        {!showQuests && allDone ? (
          <p className="flex items-center justify-center gap-1.5 text-label-md font-semibold text-on-tertiary-container">
            <CheckCircle2 size={16} aria-hidden="true" />
            Everything logged today. Streak protected.
          </p>
        ) : null}
      </div>
    </section>
  );
}
