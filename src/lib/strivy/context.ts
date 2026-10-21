/**
 * src/lib/strivy/context.ts
 *
 * The context builder: gathers exactly what one reply needs and nothing more.
 *
 *  - User data: only the queries the intent needs, each scoped to the signed-in
 *    user by src/lib/data/strivy.ts. A query that fails is recorded in
 *    `unavailable` rather than treated as empty — "you have no quests" and "I
 *    couldn't load your quests" are different answers, and only the first is
 *    a claim about the user.
 *  - Product knowledge: only the entries relevant to the message.
 *
 * toModelContext() produces the smaller, id-free view that a future model may
 * see. Nothing outside it is ever sent to a model.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTodaysTasks } from "@/lib/data/today";
import {
  getStrivyAvailableRewards,
  getStrivyChallenges,
  getStrivyFirstName,
  getStrivyQuests,
  getStrivyRecentProofs,
  getStrivyRewards,
  getStrivyWeek,
} from "@/lib/data/strivy";
import { selectKnowledge } from "./knowledge";
import type { StrivyLang } from "./language";
import type {
  IntentResult,
  StrivyContext,
  StrivyFacts,
  StrivyIntent,
  StrivyModelContext,
} from "./types";

export type Need =
  "name" | "today" | "challenges" | "quests" | "proofs" | "rewards" | "availableRewards" | "week";

/** The data each intent may read. Anything not listed is never queried. */
export const NEEDS: Record<StrivyIntent, Need[]> = {
  // Greetings are small talk too: no read at all, not even the name.
  greeting: [],
  thanks: [],
  today: ["today", "quests"],
  focus: ["today", "challenges", "quests"],
  streak: ["challenges"],
  proof_status: ["proofs"],
  progress: ["week", "challenges", "quests"],
  challenges: ["challenges"],
  quests: ["quests"],
  rewards: ["rewards", "availableRewards"],
  motivation: ["name", "today"],
  how_it_works: [],
  // Company facts come from knowledge.ts, never from the person's data.
  company_info: [],
  help: [],
  strivy_info: [],
  // Small talk and "what can you do?" read no personal data at all.
  capabilities: [],
  general_chat: [],
  general_question: [],
  // A roast may tease with the real streak or quest, so it reads those two.
  banter: ["challenges", "quests"],
  action_request: [],
  create: [],
  not_built: [],
  off_topic: [],
  crisis: [],
  unknown: [],
};

/**
 * The data one classified message may read. "How many days are left?" with no
 * quest or challenge in view answers from both, so it reads both.
 */
export function needsFor(intent: IntentResult): Need[] {
  const base = NEEDS[intent.intent];
  if (intent.detail === "deadline" && !intent.topic) {
    return [...new Set<Need>([...base, "challenges", "quests"])];
  }
  return base;
}

export async function buildStrivyContext(
  supabase: SupabaseClient,
  userId: string,
  intent: IntentResult,
  message: string,
  lang: StrivyLang = "en"
): Promise<StrivyContext> {
  return {
    intent,
    facts: await loadFacts(supabase, userId, needsFor(intent)),
    knowledge: selectKnowledge(intent.intent, message),
    lang,
  };
}

export async function buildFacts(
  supabase: SupabaseClient,
  userId: string,
  intent: StrivyIntent
): Promise<StrivyFacts> {
  return loadFacts(supabase, userId, NEEDS[intent]);
}

/** Loads exactly the listed facts for the user. Shared by chat and check-ins. */
export async function loadFacts(
  supabase: SupabaseClient,
  userId: string,
  need: readonly Need[],
  /** readOnly: never trigger write side effects (used by the push scheduler). */
  options: { readOnly?: boolean } = {}
): Promise<StrivyFacts> {
  const needs = new Set(need);
  const facts: StrivyFacts = { firstName: null, unavailable: [] };

  const [firstName, today, challenges, quests, proofs, rewards, availableRewards, week] =
    await Promise.all([
      needs.has("name") ? getStrivyFirstName(supabase, userId) : null,
      needs.has("today") ? loadToday(supabase, userId, options.readOnly === true) : undefined,
      needs.has("challenges") ? getStrivyChallenges(supabase, userId) : undefined,
      needs.has("quests") ? getStrivyQuests(supabase, userId) : undefined,
      needs.has("proofs") ? getStrivyRecentProofs(supabase, userId) : undefined,
      needs.has("rewards") ? getStrivyRewards(supabase, userId) : undefined,
      needs.has("availableRewards") ? getStrivyAvailableRewards(supabase, userId) : undefined,
      needs.has("week") ? getStrivyWeek(supabase, userId) : undefined,
    ]);

  facts.firstName = firstName;

  if (today === null) facts.unavailable.push("today's tasks");
  else if (today) facts.today = today;

  if (challenges === null) facts.unavailable.push("your challenges");
  else if (challenges) facts.challenges = challenges;

  if (quests === null) facts.unavailable.push("your quests");
  else if (quests) facts.quests = quests;

  if (proofs === null) facts.unavailable.push("your proofs");
  else if (proofs) facts.proofs = proofs;

  if (rewards === null) facts.unavailable.push("your rewards");
  else if (rewards) facts.rewards = rewards;

  if (availableRewards === null) facts.unavailable.push("rewards you can earn");
  else if (availableRewards) facts.availableRewards = availableRewards;

  if (week === null) facts.unavailable.push("this week's activity");
  else if (week) facts.week = week;

  return facts;
}

/**
 * Reuses the home feed's own "Today's Tasks" logic so STRIVY and the feed can
 * never disagree about what is due today.
 */
async function loadToday(
  supabase: SupabaseClient,
  userId: string,
  readOnly = false
): Promise<StrivyFacts["today"] | null> {
  try {
    const summary = await getTodaysTasks(supabase, userId, { settle: !readOnly });
    return {
      tasks: summary.tasks.map((t) => ({
        challengeId: t.challengeId,
        challengeTitle: t.challengeTitle,
        title: t.title,
        dayLabel: t.dayLabel,
        state: t.state,
      })),
      completed: summary.completed,
      total: summary.total,
      bestStreak: summary.bestStreak,
    };
  } catch (err) {
    console.error("[strivy] today", err instanceof Error ? err.message : err);
    return null;
  }
}

/** "12 Oct": the only date form a model sees (no ISO timestamps to mine numbers from). */
function modelDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * The id-free, minimal view of a context for a model. Record ids, links and
 * anything the reply doesn't need are dropped here.
 */
export function toModelContext(context: StrivyContext): StrivyModelContext {
  const f = context.facts;
  const facts: Record<string, unknown> = {};

  if (f.today) {
    facts.today = {
      completed: f.today.completed,
      total: f.today.total,
      bestStreak: f.today.bestStreak,
      tasks: f.today.tasks.map((t) => ({
        challenge: t.challengeTitle,
        task: t.title,
        day: t.dayLabel,
        state: t.state,
      })),
    };
  }
  if (f.challenges) {
    facts.challenges = f.challenges.map((c) => ({
      title: c.title,
      status: c.status,
      currentDay: c.currentDay,
      durationDays: c.durationDays,
      currentStreak: c.currentStreak,
      longestStreak: c.longestStreak,
      consistencyPct: c.consistencyPct === null ? null : Math.round(c.consistencyPct),
    }));
  }
  if (f.quests) {
    facts.quests = f.quests.map((q) => ({
      title: q.title,
      place: q.businessName ?? q.locationName,
      completed: q.completed,
      endsAt: q.endsAt ? modelDate(q.endsAt) : null,
      tasksTotal: q.tasksTotal,
      tasksApproved: q.tasksApproved,
      tasksPending: q.tasksPending,
    }));
  }
  if (f.proofs) {
    facts.proofs = f.proofs.map((p) => ({
      kind: p.kind,
      parent: p.parentTitle,
      label: p.label,
      status: p.status,
      reason: p.rejectionReason,
      submittedAt: p.submittedAt ? modelDate(p.submittedAt) : null,
    }));
  }
  if (f.rewards) {
    facts.rewards = f.rewards.map((r) => ({
      quest: r.questTitle,
      reward: r.rewardTitle,
      status: r.status,
    }));
  }
  if (f.availableRewards) {
    facts.availableRewards = f.availableRewards.map((r) => ({
      from: r.kind,
      title: r.parentTitle,
      reward: r.description,
    }));
  }
  if (f.week) facts.week = { ...f.week };

  return {
    intent: context.intent.intent,
    language: context.lang ?? "en",
    firstName: f.firstName,
    facts,
    knowledge: context.knowledge.map((k) => ({ title: k.title, status: k.status, body: k.body })),
    unavailable: [...f.unavailable],
  };
}
