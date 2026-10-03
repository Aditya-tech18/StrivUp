"use client";

import { Info } from "lucide-react";
import {
  ACTIVITY_FREQUENCIES,
  ACTIVITY_TYPES,
  PRODUCTION_ACTIVITY_TYPES,
  defaultUnitFor,
} from "@/lib/activity/types";
import type {
  ActivityFrequency,
  ActivityType,
  TrackingMode,
} from "@/lib/activity/types";

/**
 * PhysicalActivityConfigFields — shown in the quest builder when a task's
 * proof type is "Physical activity" (spec §45).
 *
 * Activity types beyond steps are rendered but disabled: the schema and the
 * progress engine already handle them, the provider coverage does not yet, and
 * offering a target nobody can satisfy would be worse than not offering it
 * (spec §3, §36).
 */

export interface PhysicalConfigDraft {
  activity_type: ActivityType;
  target_value: number;
  unit: string;
  tracking_mode: TrackingMode;
  frequency: ActivityFrequency;
  specific_date: string | null;
  allow_manual_proof: boolean;
}

/**
 * Defaults to `self_reported` on purpose.
 *
 * The in-app pedometer records its steps as SELF_REPORTED, because a browser
 * sensor can be shaken and calling that "verified" would be a lie. A task set
 * to `device_verified` only counts VERIFIED rows, so with the in-app counter as
 * the only source such a task could never complete. Businesses who later
 * connect a health provider can switch it.
 */
export const DEFAULT_PHYSICAL_CONFIG: PhysicalConfigDraft = {
  activity_type: "steps",
  target_value: 5000,
  unit: "steps",
  tracking_mode: "self_reported",
  frequency: "daily",
  specific_date: null,
  allow_manual_proof: false,
};

export function PhysicalActivityConfigFields({
  value,
  onChange,
}: {
  value: PhysicalConfigDraft;
  onChange: (next: PhysicalConfigDraft) => void;
}) {
  const set = (patch: Partial<PhysicalConfigDraft>) => onChange({ ...value, ...patch });

  return (
    <div className="mt-3 rounded-lg border border-secondary-fixed-dim bg-secondary-fixed/50 p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-on-secondary-fixed">
        Physical activity configuration
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-on-surface-variant">Activity</label>
          <select
            value={value.activity_type}
            onChange={(e) => {
              const type = e.target.value as ActivityType;
              set({ activity_type: type, unit: defaultUnitFor(type) });
            }}
            className="w-full rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-2 text-sm"
          >
            {ACTIVITY_TYPES.map((a) => {
              const ready = PRODUCTION_ACTIVITY_TYPES.includes(a.value);
              return (
                <option key={a.value} value={a.value} disabled={!ready}>
                  {a.icon} {a.label}
                  {ready ? "" : " — coming soon"}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-on-surface-variant">Target</label>
          <input
            type="number"
            min={1}
            value={value.target_value}
            onChange={(e) => set({ target_value: Math.max(1, Number(e.target.value) || 0) })}
            className="w-full rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-2 text-sm tabular-nums"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-on-surface-variant">Unit</label>
          <input
            value={value.unit}
            onChange={(e) => set({ unit: e.target.value })}
            className="w-full rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-on-surface-variant">Frequency</label>
          <select
            value={value.frequency}
            onChange={(e) =>
              set({
                frequency: e.target.value as ActivityFrequency,
                specific_date:
                  e.target.value === "specific_date" ? value.specific_date : null,
              })
            }
            className="w-full rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-2 text-sm"
          >
            {ACTIVITY_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {value.frequency === "specific_date" && (
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-on-surface-variant">Date</label>
            <input
              type="date"
              value={value.specific_date ?? ""}
              onChange={(e) => set({ specific_date: e.target.value || null })}
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-2 text-sm"
            />
          </div>
        )}

        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-on-surface-variant">Verification</label>
          <select
            value={value.tracking_mode}
            onChange={(e) => set({ tracking_mode: e.target.value as TrackingMode })}
            className="w-full rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-2 text-sm"
          >
            <option value="self_reported">
              Phone sensor — counted in the StrivUp app (recommended)
            </option>
            <option value="device_verified">
              Verified devices only — needs a connected health provider
            </option>
          </select>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-on-surface-variant">
        {ACTIVITY_FREQUENCIES.find((f) => f.value === value.frequency)?.hint}
      </p>

      <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-surface-container-lowest/70 p-2 text-[11px] leading-relaxed text-on-surface-variant">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" />
        <span>
          Participants tap start in the StrivUp app and walk — their phone&apos;s motion sensor
          counts the steps and the task completes itself. Counting only runs while the app is
          open, so set a target people can reach in one walk.
        </span>
      </p>
    </div>
  );
}
