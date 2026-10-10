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
  /** Creator-uploaded cover, for the Active rail. Null when none was set. */
  thumbnailUrl: string | null;
  /**
   * How much of this challenge the person has actually kept up, 0-100.
   * Read from profile_challenge_stats. Drives which three challenges the
   * home screen shows; null when the view has nothing on them yet.
   */
  consistencyPct: number | null;
  /** Quest tasks and challenge tasks share this shape and this list. */
  kind: "challenge" | "quest";
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
    .select("challenge_id, joined_at, status, challenges!challenge_id(title, duration_days, thumbnail_url)")
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
      thumbnail_url: string | null;
    } | null;
    return {
      challengeId: row.challenge_id as string,
      joinedAt: (row.joined_at as string | null) ?? null,
      title: challenge?.title ?? "Untitled challenge",
      durationDays: challenge?.duration_days ?? null,
      thumbnailUrl: challenge?.thumbnail_url ?? null,
      dayNumber: calcDayNumber((row.joined_at as string | null) ?? null),
    };
  });

  const challengeIds = participations.map((p) => p.challengeId);

  // ── 2–4. Tasks, this user's submissions, and streaks — all in parallel ────
  const [tasksRes, subsRes, streaksRes, statsRes] = await Promise.all([
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
    // Consistency per challenge, for the home screen's choice of which three
    // to surface. Joined here rather than computed in the loop so the cost
    // stays one query regardless of how many challenges someone is in.
    supabase
      .from("profile_challenge_stats")
      .select("challenge_id, consistency_pct")
      .eq("user_id", userId)
      .in("challenge_id", challengeIds),
  ]);

  const consistencyByChallenge = new Map(
    ((statsRes.data ?? []) as Array<{ challenge_id: string; consistency_pct: number | null }>)
      .map((r) => [r.challenge_id, r.consistency_pct])
  );

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
        thumbnailUrl: p.thumbnailUrl,
        consistencyPct: consistencyByChallenge.get(p.challengeId) ?? null,
        kind: "challenge",
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
        thumbnailUrl: p.thumbnailUrl,
        consistencyPct: consistencyByChallenge.get(p.challengeId) ?? null,
        kind: "challenge",
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

/* ── Quests ──────────────────────────────────────────────────────────────── */

/**
 * The quest equivalent of getTodaysTasks.
 *
 * Quests are not daily: a quest task is owed from the moment you join until
 * you complete it, so there is no day number and nothing resets at midnight.
 * The shape is shared with challenge tasks anyway, because the home screen
 * shows them in the same list behind a toggle, and two shapes there would
 * mean two of every card.
 *
 * dayLabel carries the quest's own framing ("3 of 5 done") rather than a day
 * count, which is the honest label for something with no schedule.
 */
export async function getTodaysQuestTasks(
  supabase: SupabaseClient,
  userId: string
): Promise<TodayTask[]> {
  const { data: partRows, error: partError } = await supabase
    .from("quest_participants")
    .select("quest_id, joined_at, completed_at, quests!quest_id(title, thumbnail_url, cover_url)")
    .eq("user_id", userId)
    .is("completed_at", null);

  if (partError || !partRows || partRows.length === 0) {
    if (partError) console.error("[getTodaysQuestTasks] participants", partError.message);
    return [];
  }

  const quests = partRows.map((row) => {
    const q = row.quests as unknown as {
      title: string | null;
      thumbnail_url: string | null;
      cover_url: string | null;
    } | null;
    return {
      questId: row.quest_id as string,
      title: q?.title ?? "Untitled quest",
      thumbnailUrl: q?.cover_url ?? q?.thumbnail_url ?? null,
    };
  });

  const questIds = quests.map((q) => q.questId);

  const [tasksRes, subsRes] = await Promise.all([
    supabase
      .from("quest_tasks")
      .select("id, quest_id, title, proof_type, sort_order")
      .in("quest_id", questIds)
      .order("sort_order", { ascending: true }),
    supabase
      .from("quest_task_submissions")
      .select("quest_id, task_id, verification_status")
      .eq("user_id", userId)
      .in("quest_id", questIds),
  ]);

  const taskRows = (tasksRes.data ?? []) as Array<{
    id: string;
    quest_id: string;
    title: string;
    proof_type: string | null;
  }>;

  const subIndex = new Map<string, SubmissionStatus>();
  for (const sub of (subsRes.data ?? []) as Array<{
    quest_id: string;
    task_id: string | null;
    verification_status: string;
  }>) {
    const k = `${sub.quest_id}|${sub.task_id ?? "main"}`;
    const status = sub.verification_status as SubmissionStatus;
    const existing = subIndex.get(k);
    if (
      !existing ||
      status === "approved" ||
      (status === "pending" && existing === "rejected")
    ) {
      subIndex.set(k, status);
    }
  }

  const byQuest = new Map<string, typeof taskRows>();
  for (const t of taskRows) {
    const list = byQuest.get(t.quest_id) ?? [];
    list.push(t);
    byQuest.set(t.quest_id, list);
  }

  const out: TodayTask[] = [];

  for (const q of quests) {
    const list = byQuest.get(q.questId) ?? [];
    if (list.length === 0) continue;

    const doneCount = list.filter(
      (t) => subIndex.get(`${q.questId}|${t.id}`) === "approved"
    ).length;

    for (const t of list) {
      const status = subIndex.get(`${q.questId}|${t.id}`);
      out.push({
        key: `quest|${q.questId}|${t.id}`,
        // challengeId carries the quest id so the card can link somewhere;
        // every consumer routes on `kind`, never on the field name.
        challengeId: q.questId,
        challengeTitle: q.title,
        taskId: t.id,
        title: t.title,
        dayLabel: `${doneCount} of ${list.length} done`,
        dayNumber: doneCount,
        durationDays: list.length,
        proofType: (t.proof_type as ProofType | null) ?? null,
        thumbnailUrl: q.thumbnailUrl,
        // Quests have no streak, so there is no consistency to rank on and
        // the "keeping up / slipping" split below does not apply to them.
        consistencyPct: null,
        kind: "quest",
        state:
          status === "approved"
            ? "done"
            : status === "pending"
              ? "pending"
              : status === "rejected"
                ? "rejected"
                : "todo",
      });
    }
  }

  return out;
}

/* ── Which three to show ─────────────────────────────────────────────────── */

/** How many challenges the home screen surfaces at once. */
export const HOME_TASK_LIMIT = 3;

/**
 * Pick the three challenges worth showing on the home screen.
 *
 * Two that the person is keeping up with and one they are slipping on. Not
 * simply "the three most urgent": a list of only failures reads as a telling
 * off and people stop opening it, and a list of only wins hides the thing
 * that actually needs attention today. Two-and-one is the split that shows
 * momentum and still surfaces the one at risk.
 *
 * Grouped by challenge first, because the unit someone recognises is "my
 * reading challenge", not "task 2 of my reading challenge". Within the
 * chosen challenges every task is returned, so nothing is silently dropped
 * from something already on screen.
 */
export function pickHomeTasks(tasks: TodayTask[], limit = HOME_TASK_LIMIT): TodayTask[] {
  if (tasks.length === 0) return [];

  const byChallenge = new Map<string, TodayTask[]>();
  for (const t of tasks) {
    const list = byChallenge.get(t.challengeId) ?? [];
    list.push(t);
    byChallenge.set(t.challengeId, list);
  }

  const groups = [...byChallenge.entries()].map(([id, list]) => ({
    id,
    list,
    // Unranked challenges sort as middling rather than best or worst, so a
    // challenge the stats view has not caught up with does not take the
    // "slipping" slot on a technicality.
    consistency: list[0]?.consistencyPct ?? 50,
    hasWork: list.some((t) => t.state === "todo" || t.state === "rejected"),
  }));

  if (groups.length <= limit) return groups.flatMap((g) => g.list);

  const ranked = [...groups].sort((a, b) => b.consistency - a.consistency);
  const keepingUp = ranked.slice(0, Math.max(1, limit - 1));

  // The slipping slot goes to the least consistent challenge that still has
  // something outstanding; nagging about one already finished for today
  // helps nobody.
  const slipping =
    [...ranked].reverse().find((g) => g.hasWork && !keepingUp.includes(g)) ??
    ranked[ranked.length - 1];

  const chosen = [...keepingUp];
  if (slipping && !chosen.includes(slipping)) chosen.push(slipping);

  return chosen.flatMap((g) => g.list);
}
