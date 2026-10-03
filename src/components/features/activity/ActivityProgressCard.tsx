import { CheckCircle2 } from "lucide-react";
import { formatActivityValue } from "@/lib/activity/types";

/**
 * ActivityProgressCard — the progress readout used by both the task card and
 * the dashboard (spec §12).
 *
 * Renders current / target / percentage / remaining from one place so the four
 * numbers can never disagree with each other across screens.
 */
export function ActivityProgressCard({
  current,
  target,
  unit,
  label,
  compact = false,
}: {
  current: number;
  target: number;
  unit: string;
  label?: string;
  compact?: boolean;
}) {
  const safeTarget = target > 0 ? target : 1;
  const pct = Math.min(100, Math.round((current / safeTarget) * 1000) / 10);
  const remaining = Math.max(0, target - current);
  const done = current >= target;

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-on-surface-variant">{label}</span>
          {done && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Complete
            </span>
          )}
        </div>
      )}

      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold tabular-nums text-on-surface">
          {formatActivityValue(current, unit)}
        </span>
        <span className="text-sm text-on-surface-variant tabular-nums">
          / {formatActivityValue(target, unit)}
        </span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Activity progress"}
      >
        <div
          className={`h-2 rounded-full transition-all duration-700 ${
            done ? "bg-green-500" : "bg-secondary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {!compact && (
        <div className="mt-1.5 flex items-center justify-between text-xs text-on-surface-variant">
          <span className="tabular-nums">{pct}%</span>
          <span className="tabular-nums">
            {done ? "Target reached" : `${formatActivityValue(remaining, unit)} to go`}
          </span>
        </div>
      )}
    </div>
  );
}
