/**
 * /dev/heatmap-preview — dev-only harness for the activity heatmap.
 *
 * The real one lives on /profile, behind auth. 404s in production.
 */

import { notFound } from "next/navigation";
import { ActivityHeatmap } from "@/components/ui/ActivityHeatmap";

function sample() {
  const days: { date: string; count: number }[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280);
  for (let i = 181; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const r = rand();
    const count = r > 0.74 ? Math.ceil(r * 6) : r > 0.45 ? Math.ceil(r * 2) : 0;
    if (count) days.push({ date: d, count });
  }
  return days;
}

export default function HeatmapPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-surface p-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-1">
        <h3 className="mb-3 text-body-lg font-bold text-on-surface">Consistency</h3>
        <ActivityHeatmap
          days={sample()}
          label="Your activity over the last six months"
          period="the last 6 months"
          actions={<span className="text-label-sm font-semibold text-secondary">9-day streak</span>}
        />
      </div>
    </div>
  );
}
