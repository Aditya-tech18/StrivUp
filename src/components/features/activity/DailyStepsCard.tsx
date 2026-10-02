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
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Today&apos;s steps
          </p>
          <p className="mt-0.5 flex items-baseline gap-2 text-3xl font-bold tabular-nums text-gray-900">
            <Footprints className="h-6 w-6 text-blue-600" />
            {data.today_steps.toLocaleString("en-IN")}
          </p>
        </div>
        {data.streak > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
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
                  isToday ? "bg-blue-600" : "bg-blue-200"
                }`}
                style={{ height: `${heightPct}%` }}
                title={`${d.steps.toLocaleString("en-IN")} steps`}
              />
              <span className="text-[10px] text-gray-400">
                {new Date(`${d.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "narrow" })}
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400">This week</p>
          <p className="text-sm font-semibold tabular-nums text-gray-900">
            {data.week_steps.toLocaleString("en-IN")} steps
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400">Active days</p>
          <p className="text-sm font-semibold tabular-nums text-gray-900">
            {data.active_days} / {data.days.length}
          </p>
        </div>
      </div>
    </div>
  );
}
