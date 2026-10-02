import { ActivityVerificationStatus } from "./ActivityVerificationStatus";
import { activityIcon, activityLabel } from "@/lib/activity/types";
import type { ActivityRecord } from "@/lib/activity/types";

/**
 * ActivityHistory — the user's own activity log (spec §37).
 *
 * Shows the source and verification state on every row, because a row that
 * did not count toward a quest should visibly say why.
 */
export function ActivityHistory({ records }: { records: ActivityRecord[] }) {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-500">No activity recorded yet.</p>
        <p className="mt-1 text-xs text-gray-400">
          Connect a provider and your daily activity will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {records.map((r) => (
        <li key={r.id} className="flex items-center gap-3 p-3">
          <span className="text-lg" aria-hidden>
            {activityIcon(r.activity_type)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-semibold tabular-nums text-gray-900">
                {r.activity_type === "steps" || r.steps > 0
                  ? `${r.steps.toLocaleString("en-IN")} steps`
                  : r.distance_m > 0
                    ? `${(r.distance_m / 1000).toFixed(2)} km`
                    : `${Math.round(r.duration_s / 60)} min`}
              </p>
              <span className="text-xs text-gray-400">{activityLabel(r.activity_type)}</span>
            </div>
            <p className="text-[11px] text-gray-400">
              {new Date(`${r.local_date}T00:00:00`).toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </p>
          </div>

          <ActivityVerificationStatus
            source={r.source}
            verification={r.verification_status}
            activityStatus={r.activity_status}
          />
        </li>
      ))}
    </ul>
  );
}
