/**
 * src/lib/data/today.ts
 *
 * "Today's Tasks" — the daily-return surface on the home feed.
 *
 * This is the difference between a browsing app and a habit app: instead of
 * opening StrivUp to look at other people's proofs, you open it to see what
 * YOU still owe today, and a meter that closes.
 *
 * Server-safe: accepts a SupabaseClient per the src/lib/data/* convention.
 *
 * Deliberately 4 fixed queries regardless of how many challenges the person has
 * joined — never one query per challenge.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProofType, SubmissionStatus } from "@/lib/data/tasks";

/** A single thing the person owes today. */
export interface TodayTask {
  /** Stable key: one task per challenge+task pair. */
  key: string;
  challengeId: string;
  challengeTitle: string;
  /** null when the challenge has no task breakdown — one proof per day. */
  taskId: string | null;
  title: string;
  /** e.g. "Day 42 of 100" */
  dayLabel: string;
  dayNumber: number;
  durationDays: number | null;
  proofType: ProofType | null;
  /**
   * done     — approved today
   * pending  — submitted today, awaiting verdict
   * rejected — submitted today and rejected; can resubmit
   * todo     — nothing submitted for today yet
   */
  state: "done" | "pending" | "rejected" | "todo";
}

export interface TodaySummary {
  tasks: TodayTask[];
  /** Counts `done` only — pending is not yet credit. */
  completed: number;
  total: number;
  /** 0–100, rounded. 0 when there is nothing due. */
  percent: number;
  /** Milliseconds until local midnight, for the "resets in" countdown. */
  resetsInMs: number;
  /** Best current streak across the person's active challenges. */
  bestStreak: number;
  /** Challenges that finished since the last visit — drives the celebration. */
  justCompleted: number;
}

/**
 * Day index within a challenge, 1-based.
 * Mirrors calcDayNumber in ChallengeDetailClient so the home feed and the
 * challenge page never disagree about which day it is.
 */
function calcDayNumber(joinedAt: string | null): number {
  if (!joinedAt) return 1;
  const ms = Date.now() - new Date(joinedAt).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

/** Milliseconds from now until the next local midnight. */
function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

export async function getTodaysTasks(
  supabase: SupabaseClient,
  userId: string
): Promise<TodaySummary> {
  const empty: TodaySummary = {
    tasks: [],
    completed: 0,
    total: 0,
    percent: 0,
    resetsInMs: msUntilMidnight(),
    bestStreak: 0,
    justCompleted: 0,
  };

  // ── 0. Settle anything that finished since the last visit ─────────────────
  // Lazily invoked rather than scheduled: pg_cron isn't installed, and the
  // function's guard clause makes this a cheap no-op on almost every call. It
  // runs before the queries below so a challenge that ended overnight drops out
  // of today's list instead of lingering as a task the person can't complete.
  //
  // A failure here must not take the home feed down — worst case a finished
  // challenge settles on the next visit instead.
  let justCompleted = 0;
  const { data: settled, error: settleError } = await supabase.rpc(
    "settle_challenge_completions",
    { p_user_id: userId }
  );
  if (settleError) {
    console.error("[getTodaysTasks] settle", settleError.message);
  } else {
    justCompleted = (settled as number | null) ?? 0;
  }

  // ── 1. Active participations, with the challenge joined in ────────────────
  const { data: partRows, error: partError } = await supabase
    .from("challenge_participants")
    .select("challenge_id, joined_at, status, challenges!challenge_id(title, duration_days)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (partError || !partRows || partRows.length === 0) {
    if (partError) console.error("[getTodaysTasks] participants", partError.message);
    return { ...empty, justCompleted };
  }

  const participations = partRows.map((row) => {
    const challenge = row.challenges as unknown as {
      title: string | null;
      duration_days: number | null;
    } | null;
    return {
      challengeId: row.challenge_id as string,
      joinedAt: (row.joined_at as string | null) ?? null,
      title: challenge?.title ?? "Untitled challenge",
      durationDays: challenge?.duration_days ?? null,
      dayNumber: calcDayNumber((row.joined_at as string | null) ?? null),
    };
  });

  const challengeIds = participations.map((p) => p.challengeId);

  // ── 2–4. Tasks, this user's submissions, and streaks — all in parallel ────
  const [tasksRes, subsRes, streaksRes] = await Promise.all([
    supabase
      .from("challenge_tasks")
      .select("id, challenge_id, title, proof_type, sort_order")
      .in("challenge_id", challengeIds)
      .order("sort_order", { ascending: true }),
    supabase
      .from("proof_submissions")
      .select("challenge_id, task_id, day_number, verification_status")
      .eq("user_id", userId)
      .in("challenge_id", challengeIds),
    supabase
      .from("streaks")
      .select("challenge_id, current_streak")
      .eq("user_id", userId)
      .in("challenge_id", challengeIds),
  ]);

  const taskRows = (tasksRes.data ?? []) as Array<{
    id: string;
    challenge_id: string;
    title: string;
    proof_type: string | null;
    sort_order: number | null;
  }>;

  const subRows = (subsRes.data ?? []) as Array<{
    challenge_id: string;
    task_id: string | null;
    day_number: number;
    verification_status: string;
  }>;

  const streakRows = (streaksRes.data ?? []) as Array<{
    challenge_id: string;
    current_streak: number | null;
  }>;

  // Index submissions by challenge|task|day so lookup below is O(1).
  const subIndex = new Map<string, SubmissionStatus>();
  for (const s of subRows) {
    const k = `${s.challenge_id}|${s.task_id ?? "main"}|${s.day_number}`;
    const status = s.verification_status as SubmissionStatus;
    // Approved wins over pending wins over rejected, so a resubmission that
    // was approved is not masked by the earlier rejected row.
    const existing = subIndex.get(k);
    if (
      !existing ||
      status === "approved" ||
      (status === "pending" && existing === "rejected")
    ) {
      subIndex.set(k, status);
    }
  }

  const tasksByChallenge = new Map<string, typeof taskRows>();
  for (const t of taskRows) {
    const list = tasksByChallenge.get(t.challenge_id) ?? [];
    list.push(t);
    tasksByChallenge.set(t.challenge_id, list);
  }

  const stateFor = (status: SubmissionStatus | undefined): TodayTask["state"] => {
    if (status === "approved") return "done";
    if (status === "pending") return "pending";
    if (status === "rejected") return "rejected";
    return "todo";
  };

  const tasks: TodayTask[] = [];

  for (const p of participations) {
    // Past the finish line — nothing owed today.
    if (p.durationDays !== null && p.dayNumber > p.durationDays) continue;

    const dayLabel = p.durationDays
      ? `Day ${p.dayNumber} of ${p.durationDays}`
      : `Day ${p.dayNumber}`;

    const challengeTasks = tasksByChallenge.get(p.challengeId) ?? [];

    if (challengeTasks.length === 0) {
      // No task breakdown: the challenge itself is one daily proof.
      tasks.push({
        key: `${p.challengeId}|main`,
        challengeId: p.challengeId,
        challengeTitle: p.title,
        taskId: null,
        title: p.title,
        dayLabel,
        dayNumber: p.dayNumber,
        durationDays: p.durationDays,
        proofType: null,
        state: stateFor(subIndex.get(`${p.challengeId}|main|${p.dayNumber}`)),
      });
      continue;
    }

    for (const t of challengeTasks) {
      tasks.push({
        key: `${p.challengeId}|${t.id}`,
        challengeId: p.challengeId,
        challengeTitle: p.title,
        taskId: t.id,
        title: t.title,
        dayLabel,
        dayNumber: p.dayNumber,
        durationDays: p.durationDays,
        proofType: (t.proof_type as ProofType | null) ?? null,
        state: stateFor(subIndex.get(`${p.challengeId}|${t.id}|${p.dayNumber}`)),
      });
    }
  }

  // Unfinished work first — the point of the list is what still needs doing.
  const order: Record<TodayTask["state"], number> = {
    rejected: 0,
    todo: 1,
    pending: 2,
    done: 3,
  };
  tasks.sort((a, b) => order[a.state] - order[b.state]);

  const completed = tasks.filter((t) => t.state === "done").length;
  const total = tasks.length;

  return {
    tasks,
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    resetsInMs: msUntilMidnight(),
    bestStreak: streakRows.reduce((max, r) => Math.max(max, r.current_streak ?? 0), 0),
    justCompleted,
  };
}
