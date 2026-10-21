/**
 * src/lib/data/strivy.ts
 *
 * The queries STRIVY is allowed to run. Server-safe: accepts a SupabaseClient
 * per the src/lib/data/* convention.
 *
 * Rules every function here follows:
 *  - Filter by the caller's own user id. RLS alone is not enough: it lets any
 *    signed-in user read other people's approved proofs on public challenges,
 *    public profiles and follower lists, so an unfiltered query could leak
 *    someone else's data into a reply.
 *  - Select named columns only. Never profile_private, moderation fields,
 *    file hashes or admin_* columns.
 *  - Return null on a query error, so the context builder can report the
 *    data as unavailable instead of treating a failure as "you have none".
 *
 * Reads only. Nothing here writes to the database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AvailableRewardFact,
  ChallengeFact,
  ProofFact,
  QuestFact,
  RewardFact,
  WeekFact,
} from "@/lib/strivy/types";

type Joined<T> = T | T[] | null;

/** PostgREST returns a to-one join as an object, but types it loosely. */
function one<T>(value: Joined<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getStrivyFirstName(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, username")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const full = (data.full_name as string | null)?.trim();
  if (full) return full.split(/\s+/)[0];
  return (data.username as string | null) ?? null;
}

/** Every challenge the person has joined, with streak and consistency. */
export async function getStrivyChallenges(
  supabase: SupabaseClient,
  userId: string
): Promise<ChallengeFact[] | null> {
  const { data, error } = await supabase
    .from("profile_challenge_stats")
    .select(
      "challenge_id, title, status, current_day, duration_days, current_streak, longest_streak, consistency_pct, joined_at"
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (error || !data) {
    if (error) console.error("[strivy] challenges", error.message);
    return null;
  }

  return data.map((row) => ({
    challengeId: row.challenge_id as string,
    title: (row.title as string | null) ?? "Untitled challenge",
    status: (row.status as ChallengeFact["status"]) ?? "active",
    currentDay: (row.current_day as number | null) ?? null,
    durationDays: (row.duration_days as number | null) ?? null,
    currentStreak: Number(row.current_streak ?? 0),
    longestStreak: Number(row.longest_streak ?? 0),
    consistencyPct:
      row.consistency_pct === null || row.consistency_pct === undefined
        ? null
        : Number(row.consistency_pct),
  }));
}

/** Quests the person has joined, with their own task progress. */
export async function getStrivyQuests(
  supabase: SupabaseClient,
  userId: string
): Promise<QuestFact[] | null> {
  const { data: parts, error } = await supabase
    .from("quest_participants")
    .select(
      "quest_id, verification_status, completed_at, joined_at, quest:quests!quest_id(title, business_name, location_name, ends_at, end_date)"
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (error || !parts) {
    if (error) console.error("[strivy] quests", error.message);
    return null;
  }
  if (parts.length === 0) return [];

  const questIds = parts.map((p) => p.quest_id as string);

  const [tasksRes, subsRes] = await Promise.all([
    supabase.from("quest_tasks").select("id, quest_id, is_required").in("quest_id", questIds),
    supabase
      .from("quest_task_submissions")
      .select("quest_id, task_id, verification_status, submitted_at")
      .eq("user_id", userId)
      .in("quest_id", questIds)
      .order("submitted_at", { ascending: false }),
  ]);

  if (tasksRes.error || subsRes.error) {
    console.error("[strivy] quest tasks", tasksRes.error?.message ?? subsRes.error?.message);
    return null;
  }

  // Latest submission per task decides that task's state.
  const latestByTask = new Map<string, string>();
  for (const s of subsRes.data ?? []) {
    const key = s.task_id as string;
    if (!latestByTask.has(key)) latestByTask.set(key, s.verification_status as string);
  }

  const tasksByQuest = new Map<string, string[]>();
  for (const t of tasksRes.data ?? []) {
    const list = tasksByQuest.get(t.quest_id as string) ?? [];
    list.push(t.id as string);
    tasksByQuest.set(t.quest_id as string, list);
  }

  const facts: QuestFact[] = [];
  for (const p of parts) {
    const quest = one(
      p.quest as Joined<{
        title: string | null;
        business_name: string | null;
        location_name: string | null;
        ends_at: string | null;
        end_date: string | null;
      }>
    );
    // The quest row can be hidden by RLS once it is no longer active. Without
    // a title there is nothing truthful to say about it, so leave it out.
    if (!quest?.title) continue;

    const taskIds = tasksByQuest.get(p.quest_id as string) ?? [];
    let approved = 0;
    let pending = 0;
    let needAction = 0;
    for (const id of taskIds) {
      const status = latestByTask.get(id);
      if (status === "approved") approved++;
      else if (status === "pending") pending++;
      else needAction++;
    }

    const status = (p.verification_status as QuestFact["verificationStatus"]) ?? "pending";
    facts.push({
      questId: p.quest_id as string,
      title: quest.title,
      businessName: quest.business_name,
      locationName: quest.location_name,
      verificationStatus: status,
      completed: p.completed_at !== null || status === "approved",
      endsAt: quest.end_date ?? quest.ends_at ?? null,
      tasksTotal: taskIds.length,
      tasksApproved: approved,
      tasksPending: pending,
      tasksNeedAction: needAction,
    });
  }
  return facts;
}

/** The person's most recent proofs across challenges and quests, newest first. */
export async function getStrivyRecentProofs(
  supabase: SupabaseClient,
  userId: string,
  limit = 5
): Promise<ProofFact[] | null> {
  const [challengeRes, questRes] = await Promise.all([
    supabase
      .from("proof_submissions")
      .select(
        "challenge_id, day_number, verification_status, rejection_reason, submitted_at, admin_removed, challenge:challenges!challenge_id(title)"
      )
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(limit),
    supabase
      .from("quest_task_submissions")
      .select(
        "quest_id, verification_status, rejection_reason, submitted_at, task:quest_tasks!task_id(title), quest:quests!quest_id(title)"
      )
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(limit),
  ]);

  if (challengeRes.error || questRes.error) {
    console.error("[strivy] proofs", challengeRes.error?.message ?? questRes.error?.message);
    return null;
  }

  const proofs: ProofFact[] = [];

  for (const r of challengeRes.data ?? []) {
    const challenge = one(r.challenge as Joined<{ title: string | null }>);
    proofs.push({
      kind: "challenge",
      parentId: r.challenge_id as string,
      parentTitle: challenge?.title ?? "your challenge",
      label: `Day ${r.day_number as number}`,
      status: r.admin_removed ? "removed" : (r.verification_status as ProofFact["status"]),
      rejectionReason: (r.rejection_reason as string | null) ?? null,
      submittedAt: r.submitted_at as string,
    });
  }

  for (const r of questRes.data ?? []) {
    const task = one(r.task as Joined<{ title: string | null }>);
    const quest = one(r.quest as Joined<{ title: string | null }>);
    proofs.push({
      kind: "quest",
      parentId: r.quest_id as string,
      parentTitle: quest?.title ?? "your quest",
      label: task?.title ?? "Quest task",
      status: r.verification_status as ProofFact["status"],
      rejectionReason: (r.rejection_reason as string | null) ?? null,
      submittedAt: r.submitted_at as string,
    });
  }

  proofs.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return proofs.slice(0, limit);
}

/** Quest rewards the person has a claim on. */
export async function getStrivyRewards(
  supabase: SupabaseClient,
  userId: string
): Promise<RewardFact[] | null> {
  const { data, error } = await supabase
    .from("quest_reward_claims")
    .select("quest_id, status, reward:quest_rewards!reward_id(title), quest:quests!quest_id(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    if (error) console.error("[strivy] rewards", error.message);
    return null;
  }

  return data.map((r) => ({
    questId: r.quest_id as string,
    questTitle: one(r.quest as Joined<{ title: string | null }>)?.title ?? "a quest",
    rewardTitle: one(r.reward as Joined<{ title: string | null }>)?.title ?? "a reward",
    status: r.status as string,
  }));
}

/**
 * Rewards the person could still earn: rewards offered by quests they've
 * joined and not finished, plus reward descriptions on their active
 * challenges (free text written by the challenge's creator).
 */
export async function getStrivyAvailableRewards(
  supabase: SupabaseClient,
  userId: string
): Promise<AvailableRewardFact[] | null> {
  const [questPartsRes, challengePartsRes] = await Promise.all([
    supabase
      .from("quest_participants")
      .select("quest_id, completed_at, verification_status")
      .eq("user_id", userId),
    supabase
      .from("challenge_participants")
      .select("challenge_id, challenge:challenges!challenge_id(title, reward_description)")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  if (questPartsRes.error || challengePartsRes.error) {
    console.error(
      "[strivy] available rewards",
      questPartsRes.error?.message ?? challengePartsRes.error?.message
    );
    return null;
  }

  const openQuestIds = (questPartsRes.data ?? [])
    .filter((p) => p.completed_at === null && p.verification_status !== "approved")
    .map((p) => p.quest_id as string);

  const facts: AvailableRewardFact[] = [];

  if (openQuestIds.length > 0) {
    const { data, error } = await supabase
      .from("quest_rewards")
      .select("quest_id, title, quest:quests!quest_id(title)")
      .in("quest_id", openQuestIds);
    if (error) {
      console.error("[strivy] quest rewards", error.message);
      return null;
    }
    for (const r of data ?? []) {
      const quest = one(r.quest as Joined<{ title: string | null }>);
      if (!quest?.title || !r.title) continue;
      facts.push({
        kind: "quest",
        parentId: r.quest_id as string,
        parentTitle: quest.title,
        description: r.title as string,
      });
    }
  }

  for (const p of challengePartsRes.data ?? []) {
    const challenge = one(
      p.challenge as Joined<{ title: string | null; reward_description: string | null }>
    );
    const description = challenge?.reward_description?.trim();
    if (!challenge?.title || !description) continue;
    facts.push({
      kind: "challenge",
      parentId: p.challenge_id as string,
      parentTitle: challenge.title,
      description,
    });
  }

  return facts;
}

/**
 * Approved-proof activity over the last 7 days, today included.
 * Uses the same UTC day boundary as the streaks view, so the two agree.
 */
export async function getStrivyWeek(
  supabase: SupabaseClient,
  userId: string
): Promise<WeekFact | null> {
  const since = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("profile_heatmap")
    .select("submission_date, submission_count")
    .eq("user_id", userId)
    .gte("submission_date", since);

  if (error || !data) {
    if (error) console.error("[strivy] week", error.message);
    return null;
  }

  const days = new Set<string>();
  let approvedProofs = 0;
  for (const r of data) {
    days.add(r.submission_date as string);
    approvedProofs += Number(r.submission_count ?? 0);
  }
  return { activeDays: days.size, approvedProofs };
}
