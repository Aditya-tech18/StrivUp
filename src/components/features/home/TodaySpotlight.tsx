import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Camera, Clock3, Flag, MapPin, Target } from "lucide-react";
import type { TodayTask } from "@/lib/data/today";

const stateLabels = {
  todo: "To do",
  pending: "Under review",
  rejected: "Needs a new proof",
  done: "Complete",
};

const stateColors = {
  todo: "bg-secondary/10 text-secondary",
  pending: "bg-warning-container text-on-warning-container",
  rejected: "bg-error-container text-on-error-container",
  done: "bg-streak text-on-streak",
};

export function TodaySpotlight({ task }: { task: TodayTask }) {
  const isQuest = task.kind === "quest";
  const Icon = isQuest ? MapPin : Target;

  return (
    <section
      aria-labelledby="next-task-heading"
      className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest"
    >
      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-secondary">
            <Flag size={15} aria-hidden="true" />
            {task.state === "todo" || task.state === "rejected" ? "Next task" : "Today’s progress"}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${stateColors[task.state]}`}>
            {stateLabels[task.state]}
          </span>
        </div>
        <h2
          id="next-task-heading"
          className="text-xl leading-tight font-extrabold text-on-surface sm:text-2xl"
        >
          {task.title}
        </h2>
        <p className="text-sm text-on-surface-variant">
          {task.title === task.challengeTitle
            ? task.dayLabel
            : `${task.challengeTitle} · ${task.dayLabel}`}
        </p>
      </div>

      {task.thumbnailUrl ? (
        <div className="relative mx-4 aspect-[2/1] overflow-hidden rounded-xl bg-surface-container sm:mx-5">
          <Image
            src={task.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 1023px) calc(100vw - 64px), 640px"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="mx-4 flex min-h-24 items-center gap-3 rounded-xl bg-linear-to-br from-secondary/15 to-surface-container px-4 py-3 sm:mx-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary/12 text-secondary">
            <Icon size={21} aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-on-surface">
            {isQuest ? "Local quest" : "Daily challenge"}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {task.state === "pending" ? (
          <p className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Clock3 size={16} className="shrink-0 text-secondary" aria-hidden="true" />
            Proof submitted. You can come back for the result.
          </p>
        ) : task.proofType === "photo" && task.state !== "done" ? (
          <p className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Camera size={16} className="shrink-0 text-secondary" aria-hidden="true" />
            Photo proof required
          </p>
        ) : null}
        <Link
          href={isQuest ? `/quests/${task.challengeId}` : `/challenges/${task.challengeId}#proof`}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-on-secondary hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          {isQuest ? "Open quest" : "Open challenge"} <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
