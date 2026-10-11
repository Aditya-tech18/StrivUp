"use client";

import { CheckCircle2 } from "lucide-react";
import { LiveStepTracker } from "./LiveStepTracker";
import { ActivityProgressCard } from "./ActivityProgressCard";
import { activityIcon } from "@/lib/activity/types";
import type { PhysicalActivityConfig, QuestActivityProgress } from "@/lib/activity/types";

/**
 * PhysicalTaskCard — one physical activity task inside a quest (spec §6, §26).
 *
 * For a steps task this embeds the in-app pedometer directly, so the flow is:
 * open the quest, tap Start, walk. Progress is pushed while walking and the
 * task completes itself once the target is reached — no upload, no photo, no
 * external account.
 *
 * There is deliberately no "type in your step count" box. If a business allows
 * manual proof, that runs through the existing proof upload flow and is
 * recorded as self-reported, never as verified (spec §39).
 */
export function PhysicalTaskCard({
  taskTitle,
  taskDescription,
  config,
  progress,
  questTitle,
}: {
  taskTitle: string;
  taskDescription?: string | null;
  config: PhysicalActivityConfig;
  progress: QuestActivityProgress | null;
  /** Kept for callers that pass it; the in-app counter needs no connection. */
  isConnected?: boolean;
  questTitle?: string;
  businessName?: string | null;
}) {
  const current = progress ? Number(progress.current_value) : 0;
  const target = Number(config.target_value);
  const done = progress?.status === "COMPLETED";
  const isSteps = config.activity_type === "steps" || config.unit === "steps";

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        done ? "border-success-outline bg-success-container/40" : "border-outline-variant bg-surface-container-lowest"
      }`}
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="text-xl leading-none" aria-hidden>
          {activityIcon(config.activity_type)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-on-surface">{taskTitle}</h3>
            {done && <CheckCircle2 className="h-4 w-4 shrink-0 text-on-success-container" />}
          </div>
          {taskDescription && (
            <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">{taskDescription}</p>
          )}
          <p className="mt-1 text-label-sm uppercase tracking-wide text-on-surface-variant">
            {config.frequency === "daily"
              ? "Resets daily"
              : config.frequency === "total"
                ? "Across the whole quest"
                : `On ${config.specific_date}`}
          </p>
        </div>
      </div>

      {done ? (
        <>
          <ActivityProgressCard
            current={current}
            target={target}
            unit={config.unit}
            label={config.frequency === "daily" ? "Today" : "Progress"}
          />
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-on-success-container">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Task completed
            {progress?.completed_at && (
              <span className="font-normal text-on-success-container">
                ·{" "}
                {new Date(progress.completed_at).toLocaleString("en-IN", {
                  hour: "numeric",
                  minute: "2-digit",
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
          </p>
        </>
      ) : isSteps ? (
        <LiveStepTracker targetSteps={target} timezone={config.timezone || "Asia/Kolkata"} />
      ) : (
        /* Distance / duration quests have no in-app counter yet — show the
           progress the server has and leave it at that, rather than offering a
           Start button that cannot do anything. */
        <ActivityProgressCard
          current={current}
          target={target}
          unit={config.unit}
          label="Progress"
        />
      )}
    </div>
  );
}
