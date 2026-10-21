/**
 * src/lib/strivy/events.ts
 *
 * STRIVY's event model: accountability-worthy moments derived from the facts
 * STRIVY already loads (context.ts). Detection is pure and deterministic, so
 * the same facts at the same moment always give the same events.
 *
 * Only events that the existing data can support are implemented:
 *
 *   challenge_streak_milestone   profile_challenge_stats.current_streak hits 3, 7, 14…
 *   challenge_streak_at_risk     a streak ≥ 2 with today's task still to do, evening IST
 *   quest_deadline_approaching   an open quest ending within 48h with tasks left
 *   proof_verified / rejected    the latest proof, reviewed in the last 24h
 *   reward_earned                a quest reward claim that is earned or received
 *   inactivity_detected          active challenges but no approved proof in 7 days
 *
 * Not implemented, because nothing in the data marks them reliably, or the DB
 * already announces them with its own notification triggers:
 * challenge_started, challenge_day_completed, challenge_completed,
 * challenge_failed, quest_started, quest_completed, proof_submitted.
 *
 * Every event carries its own facts. Messages about an event may use only
 * those facts (see accountability.ts); nothing here invents a value. A fact
 * that failed to load produces no event, never a "zero" event.
 */
import type { StrivyFacts } from "./types";

export type StrivyEventType =
  | "challenge_streak_milestone"
  | "challenge_streak_at_risk"
  | "quest_deadline_approaching"
  | "proof_verified"
  | "proof_rejected"
  | "reward_earned"
  | "inactivity_detected";

export const EVENT_TYPES: readonly StrivyEventType[] = [
  "challenge_streak_milestone",
  "challenge_streak_at_risk",
  "quest_deadline_approaching",
  "proof_verified",
  "proof_rejected",
  "reward_earned",
  "inactivity_detected",
];

/** Facts an event may carry. Strings and numbers only, all from the DB. */
export type EventFacts = Record<string, string | number>;

export interface StrivyEvent {
  type: StrivyEventType;
  /** Always the session's user; set by the caller, never by the client. */
  userId: string;
  /** Challenge or quest id the event is about, if any. */
  entityId: string | null;
  entityKind: "challenge" | "quest" | null;
  occurredAt: string;
  /** Deterministic: the same situation always gives the same key. */
  dedupeKey: string;
  facts: EventFacts;
}

/** Streak lengths worth celebrating. */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

const HOUR = 3_600_000;
export const DEADLINE_WINDOW_MS = 48 * HOUR;
export const RECENT_REVIEW_MS = 24 * HOUR;
/** Streak-at-risk nudges start at this local hour (IST), not in the morning. */
export const AT_RISK_FROM_HOUR_IST = 18;

/** YYYY-MM-DD in India time, used for once-a-day dedupe keys. */
export function istDate(now: Date): string {
  return new Date(now.getTime() + 5.5 * HOUR).toISOString().slice(0, 10);
}

function istHour(now: Date): number {
  return new Date(now.getTime() + 5.5 * HOUR).getUTCHours();
}

/** A 7-day bucket number, so "inactive" is announced at most once a week. */
function weekBucket(now: Date): number {
  return Math.floor(now.getTime() / (7 * 24 * HOUR));
}

export function detectEvents(facts: StrivyFacts, userId: string, now: Date): StrivyEvent[] {
  if (!userId) return [];
  const at = now.toISOString();
  const today = istDate(now);
  const events: StrivyEvent[] = [];
  const push = (e: Omit<StrivyEvent, "userId" | "occurredAt"> & { occurredAt?: string }) =>
    events.push({ userId, occurredAt: e.occurredAt ?? at, ...e });

  const active = (facts.challenges ?? []).filter((c) => c.status === "active");

  // Streak milestones: one per challenge per milestone value.
  for (const c of active) {
    if (STREAK_MILESTONES.includes(c.currentStreak)) {
      push({
        type: "challenge_streak_milestone",
        entityId: c.challengeId,
        entityKind: "challenge",
        dedupeKey: `challenge_streak_milestone:${c.challengeId}:${c.currentStreak}`,
        facts: { challengeTitle: c.title, streak: c.currentStreak },
      });
    }
  }

  // Streak at risk: needs today's tasks AND the streaks; evening only.
  if (facts.today && facts.challenges && istHour(now) >= AT_RISK_FROM_HOUR_IST) {
    const streakFor = new Map(active.map((c) => [c.challengeId, c]));
    const seen = new Set<string>();
    for (const t of facts.today.tasks) {
      const c = streakFor.get(t.challengeId);
      if (t.state !== "todo" || !c || c.currentStreak < 2 || seen.has(c.challengeId)) continue;
      seen.add(c.challengeId);
      push({
        type: "challenge_streak_at_risk",
        entityId: c.challengeId,
        entityKind: "challenge",
        dedupeKey: `challenge_streak_at_risk:${c.challengeId}:${today}`,
        facts: { challengeTitle: c.title, streak: c.currentStreak },
      });
    }
  }

  // Quest deadlines within 48h, open, with tasks still needing proof.
  for (const q of facts.quests ?? []) {
    if (q.completed || !q.endsAt || q.tasksNeedAction === 0) continue;
    const msLeft = new Date(q.endsAt).getTime() - now.getTime();
    if (!(msLeft > 0 && msLeft <= DEADLINE_WINDOW_MS)) continue;
    push({
      type: "quest_deadline_approaching",
      entityId: q.questId,
      entityKind: "quest",
      dedupeKey: `quest_deadline_approaching:${q.questId}:${q.endsAt.slice(0, 10)}`,
      facts: {
        questTitle: q.title,
        tasksLeft: q.tasksNeedAction,
        hoursLeft: Math.max(1, Math.floor(msLeft / HOUR)),
      },
    });
  }

  // The latest proof, if it was submitted in the last day and has a verdict.
  const latest = facts.proofs?.[0];
  if (latest && now.getTime() - new Date(latest.submittedAt).getTime() <= RECENT_REVIEW_MS) {
    const base = {
      entityId: latest.parentId,
      entityKind: latest.kind,
      occurredAt: latest.submittedAt,
    } as const;
    const key = `${latest.kind}:${latest.parentId}:${latest.label}`;
    if (latest.status === "approved") {
      push({
        ...base,
        type: "proof_verified",
        dedupeKey: `proof_verified:${key}`,
        facts: { parentTitle: latest.parentTitle, label: latest.label, kind: latest.kind },
      });
    } else if (latest.status === "rejected" || latest.status === "resubmission_required") {
      push({
        ...base,
        type: "proof_rejected",
        dedupeKey: `proof_rejected:${key}`,
        facts: {
          parentTitle: latest.parentTitle,
          label: latest.label,
          kind: latest.kind,
          ...(latest.rejectionReason ? { reason: latest.rejectionReason } : {}),
        },
      });
    }
  }

  // Rewards that are earned or received.
  for (const r of facts.rewards ?? []) {
    if (r.status !== "eligible" && r.status !== "fulfilled") continue;
    push({
      type: "reward_earned",
      entityId: r.questId,
      entityKind: "quest",
      dedupeKey: `reward_earned:${r.questId}:${r.rewardTitle}`,
      facts: { rewardTitle: r.rewardTitle, questTitle: r.questTitle, status: r.status },
    });
  }

  // Inactivity: only when the week actually loaded as empty, and there is
  // something active to come back to. Once per 7-day bucket.
  if (facts.week && facts.week.activeDays === 0 && active.length > 0) {
    push({
      type: "inactivity_detected",
      entityId: active[0].challengeId,
      entityKind: "challenge",
      dedupeKey: `inactivity_detected:${weekBucket(now)}`,
      facts: { challengeTitle: active[0].title, activeChallenges: active.length, days: 7 },
    });
  }

  return events.filter(isValidEvent);
}

/** Rejects malformed events (e.g. from a future caller) before any message. */
export function isValidEvent(e: unknown): e is StrivyEvent {
  if (typeof e !== "object" || e === null) return false;
  const ev = e as Partial<StrivyEvent>;
  if (!EVENT_TYPES.includes(ev.type as StrivyEventType)) return false;
  if (typeof ev.userId !== "string" || !ev.userId) return false;
  if (typeof ev.dedupeKey !== "string" || !ev.dedupeKey.startsWith(`${ev.type}:`)) return false;
  if (typeof ev.occurredAt !== "string" || Number.isNaN(Date.parse(ev.occurredAt))) return false;
  if (typeof ev.facts !== "object" || ev.facts === null) return false;
  const required: Record<StrivyEventType, string[]> = {
    challenge_streak_milestone: ["challengeTitle", "streak"],
    challenge_streak_at_risk: ["challengeTitle", "streak"],
    quest_deadline_approaching: ["questTitle", "tasksLeft", "hoursLeft"],
    proof_verified: ["parentTitle", "label"],
    proof_rejected: ["parentTitle", "label"],
    reward_earned: ["rewardTitle", "questTitle"],
    inactivity_detected: ["challengeTitle"],
  };
  const facts = ev.facts as EventFacts;
  return required[ev.type as StrivyEventType].every(
    (k) => (typeof facts[k] === "string" && facts[k] !== "") || typeof facts[k] === "number"
  );
}
