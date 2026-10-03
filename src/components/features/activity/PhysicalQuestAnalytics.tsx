import { Activity, ShieldAlert, TrendingUp, Users } from "lucide-react";
import type { PhysicalQuestAnalyticsData } from "@/lib/activity/types";

/**
 * PhysicalQuestAnalytics — the business-facing panel (spec §20, §53).
 *
 * Every figure here is an aggregate. There is deliberately no drill-down to a
 * participant's raw health data: a restaurant running a steps quest gets
 * completion rates, not a health history (spec §21).
 */
export function PhysicalQuestAnalytics({
  data,
  unit = "steps",
}: {
  data: PhysicalQuestAnalyticsData;
  unit?: string;
}) {
  const tiles = [
    {
      label: "Participants",
      value: data.participants.toLocaleString("en-IN"),
      icon: Users,
      tone: "text-secondary",
    },
    {
      label: "Started",
      value: data.started.toLocaleString("en-IN"),
      icon: Activity,
      tone: "text-chart-3",
    },
    {
      label: "Completed",
      value: data.completed.toLocaleString("en-IN"),
      icon: TrendingUp,
      tone: "text-on-success-container",
    },
    {
      label: "Flagged",
      value: data.suspicious.toLocaleString("en-IN"),
      icon: ShieldAlert,
      tone: data.suspicious > 0 ? "text-on-warning-container" : "text-on-surface-variant",
    },
  ];

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised">
      <h3 className="mb-3 text-sm font-semibold text-on-surface">Physical quest performance</h3>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-surface-container-low p-3">
            <t.icon className={`mb-1 h-4 w-4 ${t.tone}`} />
            <p className="text-lg font-bold tabular-nums text-on-surface">{t.value}</p>
            <p className="text-label-sm text-on-surface-variant">{t.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-outline-variant pt-3">
        <div>
          <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Completion rate</p>
          <p className="text-sm font-semibold tabular-nums text-on-surface">
            {data.completion_rate}%
          </p>
        </div>
        <div>
          <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Average {unit}</p>
          <p className="text-sm font-semibold tabular-nums text-on-surface">
            {Number(data.average_value).toLocaleString("en-IN")}
          </p>
        </div>
      </div>
    </div>
  );
}
