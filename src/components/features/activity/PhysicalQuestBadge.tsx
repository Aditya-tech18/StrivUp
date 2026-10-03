import { activityIcon, formatActivityValue } from "@/lib/activity/types";
import type { ActivityType } from "@/lib/activity/types";

/**
 * PhysicalQuestBadge — the discovery badge on a quest card (spec §24, §25).
 *
 * Kept tiny and text-first so it drops into the existing Explore and Quests
 * cards without a layout change.
 */
export function PhysicalQuestBadge({
  activityType,
  target,
  unit,
  className = "",
}: {
  activityType: ActivityType;
  target?: number;
  unit?: string;
  className?: string;
}) {
  const label =
    target && unit
      ? formatActivityValue(target, unit)
      : activityType === "steps"
        ? "Steps"
        : activityType;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-warning-container px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-on-warning-container ${className}`}
    >
      <span aria-hidden>{activityIcon(activityType)}</span>
      {label}
    </span>
  );
}
