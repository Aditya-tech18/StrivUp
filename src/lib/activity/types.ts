/**
 * src/lib/activity/types.ts — shared types for the physical activity system.
 *
 * These mirror the CHECK constraints in
 * supabase/migrations/20260928_physical_activity.sql. If you widen one there,
 * widen it here too — the database is the enforcement point, this file is only
 * the compile-time echo of it.
 */

/* ── Providers and sources ───────────────────────────────────────────────── */

/** A connectable activity provider. */
export type ActivityProviderId =
  | "fitbit"
  | "strava"
  | "google_fit"
  | "health_connect"
  | "healthkit"
  | "device_sensor"
  | "manual";

/**
 * Where a record physically came from. Kept distinct from the provider id
 * because it is the trust signal (spec §11): HEALTHKIT + VERIFIED is a
 * fundamentally different claim from MANUAL + SELF_REPORTED.
 */
export type ActivitySource =
  | "FITBIT"
  | "STRAVA"
  | "GOOGLE_FIT"
  | "HEALTH_CONNECT"
  | "HEALTHKIT"
  | "DEVICE_SENSOR"
  | "STRIVUP_NATIVE"
  | "MANUAL";

export type ConnectionStatus = "connected" | "disconnected" | "expired" | "error";

/* ── Activity ────────────────────────────────────────────────────────────── */

export type ActivityType =
  | "steps"
  | "walking"
  | "running"
  | "jogging"
  | "cycling"
  | "distance"
  | "duration"
  | "workout";

export type Granularity = "daily" | "session";

/** Never set VERIFIED for a value a human typed in (spec §10). */
export type VerificationStatus = "VERIFIED" | "SELF_REPORTED" | "UNVERIFIED";

/** Fraud triage state (spec §29). One odd reading suspends counting, not the user. */
export type ActivityStatus = "VALID" | "SUSPICIOUS" | "REJECTED" | "UNDER_REVIEW";

/* ── Task configuration ──────────────────────────────────────────────────── */

export type TrackingMode = "device_verified" | "self_reported";
export type ActivityFrequency = "daily" | "total" | "specific_date";
export type ProgressStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface PhysicalActivityConfig {
  id?: string;
  task_id: string;
  quest_id: string;
  activity_type: ActivityType;
  target_value: number;
  unit: string;
  tracking_mode: TrackingMode;
  frequency: ActivityFrequency;
  specific_date?: string | null;
  timezone: string;
  allow_manual_proof: boolean;
}

export interface ActivityConnection {
  id: string;
  user_id: string;
  provider: ActivityProviderId;
  external_user_id: string | null;
  status: ConnectionStatus;
  scopes: string[];
  timezone: string;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  connected_at: string;
}

export interface ActivityRecord {
  id: string;
  provider: ActivityProviderId;
  source: ActivitySource;
  activity_type: ActivityType;
  granularity: Granularity;
  local_date: string;
  started_at: string;
  ended_at: string;
  steps: number;
  distance_m: number;
  duration_s: number;
  calories: number;
  verification_status: VerificationStatus;
  activity_status: ActivityStatus;
  flagged_reason: string | null;
}

export interface QuestActivityProgress {
  id: string;
  quest_id: string;
  task_id: string;
  user_id: string;
  period_date: string;
  current_value: number;
  target_value: number;
  percentage: number;
  status: ProgressStatus;
  completed_at: string | null;
}

export interface ActivityDashboard {
  timezone: string;
  today: string;
  today_steps: number;
  week_steps: number;
  active_days: number;
  streak: number;
  days: { date: string; steps: number }[];
}

export interface PhysicalQuestAnalyticsData {
  participants: number;
  started: number;
  completed: number;
  completion_rate: number;
  average_value: number;
  suspicious: number;
}

/* ── Normalized payload handed to the database ───────────────────────────── */

/**
 * One normalized activity row, ready for ingest_activity_records().
 *
 * `dedupe_key` is what makes sync idempotent (spec §28). It must be stable for
 * the same real-world activity across every sync: use the provider's own
 * activity id where one exists, and `<type>:<date>` for daily summaries.
 */
export interface NormalizedActivity {
  dedupe_key: string;
  external_id?: string | null;
  activity_type: ActivityType;
  granularity: Granularity;
  local_date: string;
  started_at: string;
  ended_at: string;
  steps: number;
  distance_m: number;
  duration_s: number;
  calories: number;
  raw?: unknown;
}

/* ── UI labels ───────────────────────────────────────────────────────────── */

export const ACTIVITY_TYPES: { value: ActivityType; label: string; unit: string; icon: string }[] = [
  { value: "steps",    label: "Steps",    unit: "steps", icon: "🚶" },
  { value: "walking",  label: "Walking",  unit: "steps", icon: "🚶" },
  { value: "running",  label: "Running",  unit: "km",    icon: "🏃" },
  { value: "jogging",  label: "Jogging",  unit: "km",    icon: "🏃" },
  { value: "cycling",  label: "Cycling",  unit: "km",    icon: "🚴" },
  { value: "distance", label: "Distance", unit: "km",    icon: "📍" },
  { value: "duration", label: "Duration", unit: "min",   icon: "⏱" },
  { value: "workout",  label: "Workout",  unit: "min",   icon: "💪" },
];

export const ACTIVITY_FREQUENCIES: { value: ActivityFrequency; label: string; hint: string }[] = [
  { value: "daily",         label: "Daily",         hint: "Resets every day at midnight IST" },
  { value: "total",         label: "Entire quest",  hint: "Accumulates across the whole quest window" },
  { value: "specific_date", label: "Specific date", hint: "Counts on one chosen day only" },
];

/** Only 'steps' is production-ready for now (spec §3, §36). */
export const PRODUCTION_ACTIVITY_TYPES: ActivityType[] = ["steps"];

export function activityIcon(type: ActivityType): string {
  return ACTIVITY_TYPES.find((a) => a.value === type)?.icon ?? "🔥";
}

export function activityLabel(type: ActivityType): string {
  return ACTIVITY_TYPES.find((a) => a.value === type)?.label ?? type;
}

export function defaultUnitFor(type: ActivityType): string {
  return ACTIVITY_TYPES.find((a) => a.value === type)?.unit ?? "steps";
}

/** Format a value with its unit, e.g. 3842 -> "3,842 steps". */
export function formatActivityValue(value: number, unit: string): string {
  const rounded = unit === "km" ? value.toFixed(2) : Math.round(value).toLocaleString("en-IN");
  return `${rounded} ${unit}`;
}
