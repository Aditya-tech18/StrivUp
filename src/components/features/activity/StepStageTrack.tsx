import { Flag } from "lucide-react";

/**
 * StepStageTrack — a walking track the shoe moves along as steps come in.
 *
 * A single bar tells you how far along you are but not how far along it
 * *feels*. Splitting the target into three legs gives a walk intermediate
 * wins: clearing the first marker happens early and quickly, which is the
 * point at which most people decide whether to keep going.
 *
 * The split is proportional, so it reads the same whatever the target is:
 *
 *     target 50      ->  0-10,    10-30,    30-50
 *     target 20,000  ->  0-4,000  4,000-12,000  12,000-20,000
 *
 * The shoe is positioned by percentage and clamped at 100, so going past the
 * target parks it on the finish line rather than sliding off the end.
 */

/** Proportional stage boundaries: first leg 20%, second 60%, finish 100%. */
const STAGE_FRACTIONS = [0.2, 0.6, 1] as const;

export function stageBoundaries(target: number): number[] {
  return STAGE_FRACTIONS.map((f) => Math.max(1, Math.round(target * f)));
}

function formatSteps(n: number): string {
  return n.toLocaleString("en-IN");
}

export function StepStageTrack({
  current,
  target,
  className = "",
}: {
  current: number;
  target: number;
  className?: string;
}) {
  if (target <= 0) return null;

  const bounds = stageBoundaries(target);
  const pct = Math.min(100, Math.max(0, (current / target) * 100));
  const done = current >= target;

  /* Which leg the walker is on, and how far through it. */
  const stageIndex = bounds.findIndex((b) => current < b);
  const currentStage = stageIndex === -1 ? bounds.length : stageIndex + 1;

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
          {done ? "Finished" : `Stage ${currentStage} of ${bounds.length}`}
        </span>
        <span className="text-[11px] tabular-nums text-on-surface-variant">
          {formatSteps(Math.min(current, target))} / {formatSteps(target)}
        </span>
      </div>

      {/* The track. Extra top padding leaves room for the shoe to sit on the
          rail without being clipped. */}
      <div className="relative pt-6">
        <div className="h-2 w-full rounded-full bg-surface-container">
          <div
            className={`h-2 rounded-full transition-[width] duration-700 ease-out ${
              done ? "bg-success" : "bg-secondary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Stage markers. The last one is the finish, so it gets a flag. */}
        {bounds.map((b, i) => {
          const left = (b / target) * 100;
          const reached = current >= b;
          const isFinish = i === bounds.length - 1;
          return (
            <span
              key={b}
              className="absolute top-6 -translate-x-1/2 -translate-y-[3px]"
              style={{ left: `${Math.min(100, left)}%` }}
              aria-hidden="true"
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 transition-colors ${
                  reached
                    ? "border-success bg-success"
                    : "border-outline-variant bg-surface-container-lowest"
                }`}
              >
                {isFinish && (
                  <Flag
                    size={8}
                    className={reached ? "text-on-success" : "text-on-surface-variant"}
                  />
                )}
              </span>
            </span>
          );
        })}

        {/* The walker. Steps along the rail as the count rises. */}
        <span
          className="absolute top-0 -translate-x-1/2 text-lg transition-[left] duration-700 ease-out"
          style={{ left: `${pct}%` }}
          role="img"
          aria-label={`${formatSteps(current)} of ${formatSteps(target)} steps`}
        >
          👟
        </span>
      </div>

      {/* Leg labels, so the stages are readable rather than implied. */}
      <ul className="mt-2 flex justify-between gap-1">
        {bounds.map((b, i) => {
          const from = i === 0 ? 0 : bounds[i - 1];
          const reached = current >= b;
          const active = !reached && current >= from;
          return (
            <li
              key={b}
              className={`text-[10px] tabular-nums ${
                reached
                  ? "font-semibold text-on-success-container"
                  : active
                    ? "font-semibold text-secondary"
                    : "text-on-surface-variant"
              }`}
            >
              {formatSteps(from)}–{formatSteps(b)}
              {reached && " ✓"}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
