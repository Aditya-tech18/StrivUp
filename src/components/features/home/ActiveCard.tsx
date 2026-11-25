import Image from "next/image";
import Link from "next/link";
import { ChevronRight, MapPin, Trophy } from "lucide-react";
import type { TodayTask } from "@/lib/data/today";
import { Facepile } from "@/components/features/people/Facepile";
import type { Facepile as FacepileData } from "@/lib/data/social";

const status = {
  done: { label: "Logged today", color: "text-streak-ink" },
  pending: { label: "Under review", color: "text-secondary" },
  rejected: { label: "Needs a new proof", color: "text-error" },
  todo: { label: "To do", color: "text-on-surface-variant" },
};

export function ActiveCard({ task, pile }: { task: TodayTask; pile?: FacepileData }) {
  const isQuest = task.kind === "quest";
  const Icon = isQuest ? MapPin : Trophy;
  const current = status[task.state];

  return (
    <Link
      href={`/${isQuest ? "quests" : "challenges"}/${task.challengeId}`}
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3.5 hover:border-secondary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
    >
      <div className="flex items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary/12 text-secondary">
          {task.thumbnailUrl ? (
            <Image src={task.thumbnailUrl} alt="" fill sizes="44px" className="object-cover" />
          ) : (
            <Icon size={20} aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-on-surface">{task.challengeTitle}</h3>
          <p className="mt-0.5 text-xs text-on-surface-variant">{task.dayLabel}</p>
        </div>
        <ChevronRight size={17} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
      </div>
      {task.consistencyPct !== null && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-on-surface-variant">
            <span>Consistency</span>
            <span className="font-semibold tabular-nums text-streak-ink">
              {task.consistencyPct}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`${task.challengeTitle} consistency`}
            aria-valuenow={task.consistencyPct}
            className="h-1.5 overflow-hidden rounded-full bg-surface-container-high"
          >
            <div
              className="h-full rounded-full bg-streak-ink"
              style={{ width: `${task.consistencyPct}%` }}
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${current.color}`}>{current.label}</span>
        {pile && pile.total > 0 ? (
          <Facepile
            people={pile.people}
            total={pile.total}
            verb="Joined by"
            noun="person"
            size={20}
          />
        ) : null}
      </div>
    </Link>
  );
}
