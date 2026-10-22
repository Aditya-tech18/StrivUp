/**
 * src/lib/strivy/push/planner.ts
 *
 * Decides whether one user should get a push right now, and about what.
 * Pure and deterministic: facts + time + history in, one candidate (or a
 * reason for none) out.
 *
 *   facts → candidates (only what the data supports)
 *         → filter by window, dedupe, daily cap, spacing, preferences
 *         → the most important one, or nothing
 *
 * At most one push per window, so a day has at most three and usually fewer.
 * "Nothing useful to say" is a normal outcome, not an error.
 */
import { detectEvents, type StrivyEvent } from "../events";
import type { StrivyFacts } from "../types";
import type { StrivyLang } from "../language";
import {
  DEFAULT_MIN_SPACING_MINUTES,
  MAX_PUSHES_PER_DAY,
  MIN_SPACING_FLOOR_MINUTES,
  istDay,
  type PushWindow,
} from "./config";

export type PushType =
  | "proof_rejected"
  | "streak_at_risk"
  | "quest_deadline"
  | "reward_earned"
  | "proof_verified"
  | "streak_milestone"
  | "pending_task"
  | "morning_checkin"
  | "quest_progress"
  | "inactivity"
  | "proof_in_review"
  | "evening_checkin"
  | "evening_done";

/** Most important first. */
export const PUSH_PRIORITY: readonly PushType[] = [
  "proof_rejected",
  "streak_at_risk",
  "quest_deadline",
  "reward_earned",
  "proof_verified",
  "streak_milestone",
  "pending_task",
  "morning_checkin",
  "quest_progress",
  "inactivity",
  "proof_in_review",
  "evening_checkin",
  "evening_done",
];

const ALL: readonly PushWindow[] = ["morning", "afternoon", "evening"];

/** When each kind of push may go out. */
export const PUSH_WINDOWS_FOR: Record<PushType, readonly PushWindow[]> = {
  proof_rejected: ALL,
  streak_at_risk: ["evening"],
  quest_deadline: ALL,
  reward_earned: ALL,
  proof_verified: ALL,
  streak_milestone: ALL,
  pending_task: ["afternoon", "evening"],
  morning_checkin: ["morning"],
  quest_progress: ["afternoon"],
  inactivity: ["morning", "afternoon"],
  proof_in_review: ["afternoon"],
  evening_checkin: ["evening"],
  evening_done: ["evening"],
};

/** Values a message may use. Strings and numbers only, all from the database. */
export type PushVars = Record<string, string | number>;

export interface PushCandidate {
  type: PushType;
  /** userId is implied (per-user rows); the key is unique per user. */
  dedupeKey: string;
  entityId: string | null;
  /** Same-site path opened on click. */
  url: string;
  vars: PushVars;
}

export interface PushPreferences {
  /** Daily nudges on/off (push_enabled in the database). */
  enabled: boolean;
  maxPerDay: number;
  minSpacingMinutes: number;
  /** Language to write in: the user's choice, else their chat's, else null (mixed). */
  language: StrivyLang | null;
}

export const DEFAULT_PREFERENCES: PushPreferences = {
  enabled: true,
  maxPerDay: MAX_PUSHES_PER_DAY,
  minSpacingMinutes: DEFAULT_MIN_SPACING_MINUTES,
  language: null,
};

/** One push already claimed or sent today. */
export interface SentRecord {
  dedupeKey: string;
  window: PushWindow;
  tone: string;
  body: string;
  status: "claimed" | "sent" | "failed";
  createdAt: string;
}

const q = (s: string) => `'${s}'`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function fromEvent(e: StrivyEvent): PushCandidate | null {
  const url = e.entityId
    ? e.entityKind === "quest"
      ? `/quests/${e.entityId}`
      : `/challenges/${e.entityId}`
    : "/feed";
  const f = e.facts;
  const base = { entityId: e.entityId, url };
  const proofLabel = () => (f.kind === "quest" ? q(String(f.label)) : String(f.label));
  switch (e.type) {
    case "proof_rejected":
      return {
        ...base,
        type: "proof_rejected",
        dedupeKey: e.dedupeKey,
        vars: { label: proofLabel(), parent: q(String(f.parentTitle)) },
      };
    case "proof_verified":
      return {
        ...base,
        type: "proof_verified",
        dedupeKey: e.dedupeKey,
        vars: { label: proofLabel(), parent: q(String(f.parentTitle)) },
      };
    case "challenge_streak_at_risk":
      return {
        ...base,
        type: "streak_at_risk",
        dedupeKey: e.dedupeKey,
        vars: {
          streak: `${f.streak}-day`,
          streakN: Number(f.streak),
          days: plural(Number(f.streak), "day"),
          challenge: q(String(f.challengeTitle)),
        },
      };
    case "challenge_streak_milestone":
      return {
        ...base,
        type: "streak_milestone",
        dedupeKey: e.dedupeKey,
        vars: {
          streak: `${f.streak}-day`,
          streakN: Number(f.streak),
          days: plural(Number(f.streak), "day"),
          challenge: q(String(f.challengeTitle)),
        },
      };
    case "quest_deadline_approaching":
      return {
        ...base,
        type: "quest_deadline",
        dedupeKey: e.dedupeKey,
        vars: {
          quest: q(String(f.questTitle)),
          hours: plural(Number(f.hoursLeft), "hour"),
          hoursN: Number(f.hoursLeft),
          tasks: plural(Number(f.tasksLeft), "task"),
          tasksN: Number(f.tasksLeft),
        },
      };
    case "reward_earned":
      return {
        ...base,
        type: "reward_earned",
        dedupeKey: e.dedupeKey,
        vars: {
          reward: String(f.rewardTitle),
          quest: q(String(f.questTitle)),
          status: String(f.status),
        },
      };
    case "inactivity_detected":
      return {
        ...base,
        type: "inactivity",
        dedupeKey: e.dedupeKey,
        vars: { challenge: q(String(f.challengeTitle)) },
      };
    default:
      return null;
  }
}

/**
 * Everything worth a push for this user right now, before limits. Only facts
 * that loaded produce candidates; a failed load produces none, never "zero".
 */
export function pushCandidates(facts: StrivyFacts, userId: string, now: Date): PushCandidate[] {
  if (!userId) return [];
  const day = istDay(now);
  const out: PushCandidate[] = [];

  for (const e of detectEvents(facts, userId, now)) {
    const c = fromEvent(e);
    if (c) out.push(c);
  }

  const today = facts.today;
  const todo = today ? today.tasks.filter((t) => t.state === "todo") : [];
  const openQuests = (facts.quests ?? [])
    .filter((x) => !x.completed && x.tasksNeedAction > 0)
    .sort((a, b) => (a.endsAt ?? "9999").localeCompare(b.endsAt ?? "9999"));

  if (todo.length > 0) {
    const t = todo[0];
    out.push({
      type: "pending_task",
      dedupeKey: `pending_task:${t.challengeId}:${day}`,
      entityId: t.challengeId,
      url: `/challenges/${t.challengeId}`,
      vars: { task: q(t.title === t.challengeTitle ? t.challengeTitle : t.title) },
    });
  }

  const openCount = todo.length + openQuests.reduce((n, x) => n + x.tasksNeedAction, 0);
  if (openCount > 0) {
    const first = todo[0];
    const url = first ? `/challenges/${first.challengeId}` : `/quests/${openQuests[0].questId}`;
    out.push({
      type: "morning_checkin",
      dedupeKey: `morning_checkin:${day}`,
      entityId: null,
      url,
      vars: { count: plural(openCount, "task"), countN: openCount },
    });
    out.push({
      type: "evening_checkin",
      dedupeKey: `evening_checkin:${day}`,
      entityId: null,
      url,
      vars: { count: plural(openCount, "task"), countN: openCount },
    });
  }

  const quest = openQuests[0];
  if (quest && quest.tasksTotal > 0) {
    out.push({
      type: "quest_progress",
      dedupeKey: `quest_progress:${quest.questId}:${day}`,
      entityId: quest.questId,
      url: `/quests/${quest.questId}`,
      vars: { quest: q(quest.title), approved: quest.tasksApproved, total: quest.tasksTotal },
    });
  }

  const inReview = facts.proofs?.find((p) => p.status === "pending");
  if (inReview) {
    out.push({
      type: "proof_in_review",
      dedupeKey: `proof_in_review:${inReview.kind}:${inReview.parentId}:${inReview.label}`,
      entityId: inReview.parentId,
      url:
        inReview.kind === "quest"
          ? `/quests/${inReview.parentId}`
          : `/challenges/${inReview.parentId}`,
      vars: {
        label: inReview.kind === "quest" ? q(inReview.label) : inReview.label,
        parent: q(inReview.parentTitle),
      },
    });
  }

  if (today && today.total > 0 && today.completed === today.total) {
    out.push({
      type: "evening_done",
      dedupeKey: `evening_done:${day}`,
      entityId: null,
      url: "/feed",
      vars: { total: today.total },
    });
  }

  const rank = (c: PushCandidate) => PUSH_PRIORITY.indexOf(c.type);
  return out.sort((a, b) => rank(a) - rank(b));
}

export type SelectResult =
  { candidate: PushCandidate; reason: null } | { candidate: null; reason: string };

/**
 * The one push to send in `window`, or why not. `sentKeys` holds any of the
 * candidates' keys already used on any day (one-off events never repeat).
 */
export function selectPush(input: {
  candidates: PushCandidate[];
  window: PushWindow | null;
  today: SentRecord[];
  sentKeys: ReadonlySet<string>;
  prefs: PushPreferences;
  now: Date;
}): SelectResult {
  const { candidates, window, today, sentKeys, prefs, now } = input;
  if (!prefs.enabled) return { candidate: null, reason: "notifications disabled" };
  if (!window) return { candidate: null, reason: "outside the push windows" };

  const counted = today.filter((r) => r.status !== "failed");
  const cap = Math.min(Math.max(0, prefs.maxPerDay), MAX_PUSHES_PER_DAY);
  if (counted.length >= cap) return { candidate: null, reason: "daily limit" };
  if (counted.some((r) => r.window === window))
    return { candidate: null, reason: "window already used" };

  const spacing = Math.max(prefs.minSpacingMinutes, MIN_SPACING_FLOOR_MINUTES) * 60_000;
  const last = Math.max(0, ...counted.map((r) => Date.parse(r.createdAt)));
  if (last && now.getTime() - last < spacing) return { candidate: null, reason: "too soon" };

  const usedToday = new Set(today.map((r) => r.dedupeKey));
  const pick = candidates.find(
    (c) =>
      PUSH_WINDOWS_FOR[c.type].includes(window) &&
      !sentKeys.has(c.dedupeKey) &&
      !usedToday.has(c.dedupeKey)
  );
  return pick
    ? { candidate: pick, reason: null }
    : { candidate: null, reason: "nothing useful to say" };
}
