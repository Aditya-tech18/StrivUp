import { Flame, Footprints } from "lucide-react";
import type { ActivityDashboard } from "@/lib/activity/types";

/**
 * DailyStepsCard — today's steps, the weekly bars and the activity streak
 * (spec §14, §15).
 *
 * The streak shown here is the *physical activity* streak. It deliberately
 * does not touch the existing challenge streak logic — spec §15 asks to
 * integrate with the existing streak architecture rather than duplicate or
 * silently modify it, so this is presented as its own figure.
 */
export function DailyStepsCard({ data }: { data: ActivityDashboard }) {
  const max = Math.max(1, ...data.days.map((d) => d.steps));

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
            Today&apos;s steps
          </p>
          <p className="mt-0.5 flex items-baseline gap-2 text-3xl font-bold tabular-nums text-on-surface">
            <Footprints className="h-6 w-6 text-secondary" />
            {data.today_steps.toLocaleString("en-IN")}
          </p>
        </div>
        {data.streak > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-container px-2.5 py-1 text-xs font-semibold text-on-warning-container">
            <Flame className="h-3.5 w-3.5" />
            {data.streak} day{data.streak === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="mb-3 flex items-end gap-1.5" style={{ height: 64 }}>
        {data.days.map((d) => {
          const heightPct = Math.max(4, Math.round((d.steps / max) * 100));
          const isToday = d.date === data.today;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-t transition-all ${
                  isToday ? "bg-secondary" : "bg-secondary-fixed-dim"
                }`}
                style={{ height: `${heightPct}%` }}
                title={`${d.steps.toLocaleString("en-IN")} steps`}
              />
              <span className="text-label-sm text-on-surface-variant">
                {new Date(`${d.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "narrow" })}
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-outline-variant pt-3">
        <div>
          <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">This week</p>
          <p className="text-sm font-semibold tabular-nums text-on-surface">
            {data.week_steps.toLocaleString("en-IN")} steps
          </p>
        </div>
        <div>
          <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Active days</p>
          <p className="text-sm font-semibold tabular-nums text-on-surface">
            {data.active_days} / {data.days.length}
          </p>
        </div>
      </div>
    </div>
  );
}
