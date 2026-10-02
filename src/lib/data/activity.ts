/**
 * src/lib/data/activity.ts — data helpers for the physical activity system.
 *
 * Safe in both server and client components: every function takes a
 * SupabaseClient, matching the existing helpers in this folder.
 *
 * All reads here run under RLS. A user sees only their own activity; a
 * business sees only progress toward quests it created; nobody sees tokens.
 * Writes that matter (activity, progress, completion) are not here at all —
 * they live in SECURITY DEFINER functions, reachable only from the server.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivityConnection,
  ActivityDashboard,
  ActivityRecord,
  PhysicalActivityConfig,
  PhysicalQuestAnalyticsData,
  QuestActivityProgress,
} from "@/lib/activity/types";

/* ── Connections ─────────────────────────────────────────────────────────── */

export async function getActivityConnections(
  supabase: SupabaseClient,
  userId: string
): Promise<ActivityConnection[]> {
  const { data, error } = await supabase
    .from("activity_connections")
    .select(
      "id, user_id, provider, external_user_id, status, scopes, timezone, last_synced_at, last_sync_status, last_sync_error, connected_at"
    )
    .eq("user_id", userId)
    .order("connected_at", { ascending: false });

  if (error) {
    console.error("[getActivityConnections]", error.message);
    return [];
  }
  return (data ?? []) as ActivityConnection[];
}

/** True when the user has at least one live provider. Drives the empty states. */
export async function hasConnectedProvider(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("activity_connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "connected");

  if (error) {
    console.error("[hasConnectedProvider]", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/* ── Dashboard + history ─────────────────────────────────────────────────── */

export async function getActivityDashboard(
  supabase: SupabaseClient,
  days = 7
): Promise<ActivityDashboard | null> {
  const { data, error } = await supabase.rpc("get_activity_dashboard", { p_days: days });

  if (error) {
    console.error("[getActivityDashboard]", error.message);
    return null;
  }
  if (!data || Object.keys(data).length === 0) return null;
  return data as ActivityDashboard;
}

export async function getActivityHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = 30
): Promise<ActivityRecord[]> {
  const { data, error } = await supabase
    .from("activity_records")
    .select(
      "id, provider, source, activity_type, granularity, local_date, started_at, ended_at, steps, distance_m, duration_s, calories, verification_status, activity_status, flagged_reason"
    )
    .eq("user_id", userId)
    .order("local_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getActivityHistory]", error.message);
    return [];
  }
  return (data ?? []) as ActivityRecord[];
}

/* ── Task configuration ──────────────────────────────────────────────────── */

export async function getQuestActivityConfigs(
  supabase: SupabaseClient,
  questId: string
): Promise<Map<string, PhysicalActivityConfig>> {
  const { data, error } = await supabase
    .from("quest_task_activity_config")
    .select("*")
    .eq("quest_id", questId);

  if (error) {
    console.error("[getQuestActivityConfigs]", error.message);
    return new Map();
  }

  const map = new Map<string, PhysicalActivityConfig>();
  for (const row of data ?? []) map.set(row.task_id as string, row as PhysicalActivityConfig);
  return map;
}

/**
 * Create or update the physical configuration attached to one task.
 * Called from the business quest builder after the task row exists.
 */
export async function upsertTaskActivityConfig(
  supabase: SupabaseClient,
  config: PhysicalActivityConfig
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("quest_task_activity_config").upsert(
    {
      task_id: config.task_id,
      quest_id: config.quest_id,
      activity_type: config.activity_type,
      target_value: config.target_value,
      unit: config.unit,
      tracking_mode: config.tracking_mode,
      frequency: config.frequency,
      specific_date: config.specific_date ?? null,
      timezone: config.timezone || "Asia/Kolkata",
      allow_manual_proof: config.allow_manual_proof,
    },
    { onConflict: "task_id" }
  );

  return { error: error?.message ?? null };
}

export async function deleteTaskActivityConfig(
  supabase: SupabaseClient,
  taskId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("quest_task_activity_config")
    .delete()
    .eq("task_id", taskId);
  return { error: error?.message ?? null };
}

/* ── Progress ────────────────────────────────────────────────────────────── */

export async function getQuestActivityProgress(
  supabase: SupabaseClient,
  questId: string,
  userId: string
): Promise<QuestActivityProgress[]> {
  const { data, error } = await supabase
    .from("quest_activity_progress")
    .select("*")
    .eq("quest_id", questId)
    .eq("user_id", userId)
    .order("period_date", { ascending: true });

  if (error) {
    console.error("[getQuestActivityProgress]", error.message);
    return [];
  }
  return (data ?? []) as QuestActivityProgress[];
}

/**
 * The progress row that matters *right now* for a task: today's bucket for a
 * daily task, the single bucket for a total/specific-date task.
 */
export function currentPeriodProgress(
  rows: QuestActivityProgress[],
  taskId: string,
  today: string
): QuestActivityProgress | null {
  const forTask = rows.filter((r) => r.task_id === taskId);
  if (forTask.length === 0) return null;
  return forTask.find((r) => r.period_date === today) ?? forTask[forTask.length - 1];
}

/** Every physical task across the user's active quests, for the dashboard. */
export async function getMyPhysicalTasks(
  supabase: SupabaseClient,
  userId: string
): Promise<
  (QuestActivityProgress & {
    quest_title: string | null;
    task_title: string | null;
    unit: string;
  })[]
> {
  const { data, error } = await supabase
    .from("quest_activity_progress")
    .select(
      `*,
       quests!quest_id ( title ),
       quest_tasks!task_id ( title ),
       quest_task_activity_config!task_id ( unit )`
    )
    .eq("user_id", userId)
    .order("period_date", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[getMyPhysicalTasks]", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const quest = row.quests as unknown as { title: string | null } | null;
    const task = row.quest_tasks as unknown as { title: string | null } | null;
    const cfg = row.quest_task_activity_config as unknown as { unit: string } | null;
    return {
      ...(row as unknown as QuestActivityProgress),
      quest_title: quest?.title ?? null,
      task_title: task?.title ?? null,
      unit: cfg?.unit ?? "steps",
    };
  });
}

/* ── Business analytics ──────────────────────────────────────────────────── */

export async function getPhysicalQuestAnalytics(
  supabase: SupabaseClient,
  questId: string
): Promise<PhysicalQuestAnalyticsData | null> {
  const { data, error } = await supabase.rpc("get_physical_quest_analytics", {
    p_quest_id: questId,
  });

  if (error) {
    console.error("[getPhysicalQuestAnalytics]", error.message);
    return null;
  }
  if (!data || Object.keys(data).length === 0) return null;
  return data as PhysicalQuestAnalyticsData;
}

/**
 * Participant progress for one quest, business facing.
 * RLS restricts this to quests the caller created, and it selects progress
 * columns only — never raw health data (spec §21).
 */
export async function getQuestParticipantActivity(
  supabase: SupabaseClient,
  questId: string
): Promise<
  {
    user_id: string;
    task_id: string;
    period_date: string;
    current_value: number;
    target_value: number;
    percentage: number;
    status: string;
    full_name: string | null;
    avatar_url: string | null;
  }[]
> {
  const { data, error } = await supabase
    .from("quest_activity_progress")
    .select(
      `user_id, task_id, period_date, current_value, target_value, percentage, status,
       profiles!user_id ( full_name, avatar_url )`
    )
    .eq("quest_id", questId)
    .order("percentage", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[getQuestParticipantActivity]", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const p = row.profiles as unknown as {
      full_name: string | null;
      avatar_url: string | null;
    } | null;
    return {
      user_id: row.user_id as string,
      task_id: row.task_id as string,
      period_date: row.period_date as string,
      current_value: Number(row.current_value),
      target_value: Number(row.target_value),
      percentage: Number(row.percentage),
      status: row.status as string,
      full_name: p?.full_name ?? null,
      avatar_url: p?.avatar_url ?? null,
    };
  });
}

/* ── Admin ───────────────────────────────────────────────────────────────── */

export async function getFlaggedActivity(
  supabase: SupabaseClient,
  limit = 50
): Promise<(ActivityRecord & { user_id: string })[]> {
  const { data, error } = await supabase
    .from("activity_records")
    .select(
      "id, user_id, provider, source, activity_type, granularity, local_date, started_at, ended_at, steps, distance_m, duration_s, calories, verification_status, activity_status, flagged_reason"
    )
    .neq("activity_status", "VALID")
    .order("local_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getFlaggedActivity]", error.message);
    return [];
  }
  return (data ?? []) as (ActivityRecord & { user_id: string })[];
}

export async function reviewActivityRecord(
  supabase: SupabaseClient,
  recordId: string,
  action: "approve" | "reject" | "review",
  note?: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("admin_review_activity_record", {
    p_record_id: recordId,
    p_action: action,
    p_note: note ?? null,
  });
  return { error: error?.message ?? null };
}

/** Recent audit trail, for the admin activity monitor (spec §31). */
export async function getActivityEvents(
  supabase: SupabaseClient,
  limit = 100
): Promise<
  { id: string; user_id: string | null; quest_id: string | null; event_type: string; metadata: Record<string, unknown> | null; created_at: string }[]
> {
  const { data, error } = await supabase
    .from("activity_verification_events")
    .select("id, user_id, quest_id, event_type, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getActivityEvents]", error.message);
    return [];
  }
  return data ?? [];
}
