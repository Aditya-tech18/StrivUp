/**
 * src/lib/strivy/accountability.ts
 *
 * The accountability engine: turns detected events into check-in messages in
 * Strivy's voice, decides which deserve a notification, and checks every
 * message against the event's own facts before it goes anywhere.
 *
 * Rules:
 *  - Messages are templates filled only from `event.facts` (grounded).
 *  - checkEventMessage() rejects any message with a number, quoted name, link
 *    or shaming word the facts don't support; a rejected message is dropped.
 *  - Only events the database does NOT already announce may become
 *    notifications. Proof verdicts, rewards and completions are already sent
 *    by DB triggers (notify_proof_review_result, notify_quest_task_reviewed,
 *    quest_reward_earned…), so those stay chat-only to avoid duplicates.
 *  - At most MAX_CHECKINS check-ins per run, most urgent first.
 *
 * The tone rules come from persona.ts (the same ones the chat replies follow).
 */
import type { StrivyEvent, StrivyEventType } from "./events";
import { BANNED_WORDS } from "./persona";
import type { StrivyIntent, StrivyLink, StrivyReply } from "./types";

/** notifications.type values STRIVY may write (see the Phase 3 migration). */
export type StrivyNotificationType =
  | "strivy_streak_milestone"
  | "strivy_streak_at_risk"
  | "strivy_quest_deadline"
  | "strivy_inactivity";

export interface NotificationDraft {
  type: StrivyNotificationType;
  dedupeKey: string;
  title: string;
  message: string;
  relatedChallengeId: string | null;
  relatedQuestId: string | null;
}

export interface CheckIn {
  event: StrivyEvent;
  /** Shown in the Strivy panel. */
  reply: StrivyReply;
  /** Set when this event is worth a notification in Alerts. */
  notification: NotificationDraft | null;
}

export const MAX_CHECKINS = 3;
export const MAX_NOTIFICATION_CHARS = 300;

/** Most urgent first. */
const PRIORITY: StrivyEventType[] = [
  "proof_rejected",
  "challenge_streak_at_risk",
  "quest_deadline_approaching",
  "proof_verified",
  "challenge_streak_milestone",
  "reward_earned",
  "inactivity_detected",
];

/** Which events may notify, and as what. Everything else is chat-only. */
const NOTIFY: Partial<Record<StrivyEventType, { type: StrivyNotificationType; title: string }>> = {
  challenge_streak_milestone: { type: "strivy_streak_milestone", title: "Streak milestone 🔥" },
  challenge_streak_at_risk: {
    type: "strivy_streak_at_risk",
    title: "Your streak needs today's proof",
  },
  quest_deadline_approaching: { type: "strivy_quest_deadline", title: "Quest ending soon" },
  inactivity_detected: { type: "strivy_inactivity", title: "Ready to get back on track?" },
};

/** The chat intent each event belongs to, so follow-ups ("why?") work. */
const INTENT: Record<StrivyEventType, StrivyIntent> = {
  challenge_streak_milestone: "streak",
  challenge_streak_at_risk: "streak",
  quest_deadline_approaching: "quests",
  proof_verified: "proof_status",
  proof_rejected: "proof_status",
  reward_earned: "rewards",
  inactivity_detected: "challenges",
};

function pick<T>(options: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function link(e: StrivyEvent, label: string): StrivyLink[] {
  if (!e.entityId || !e.entityKind) return [];
  return [
    {
      label,
      href: e.entityKind === "quest" ? `/quests/${e.entityId}` : `/challenges/${e.entityId}`,
    },
  ];
}

/** The check-in text for an event, filled only from its facts. */
export function eventMessage(e: StrivyEvent): { text: string; links: StrivyLink[] } | null {
  const f = e.facts;
  const s = (k: string) => String(f[k]);
  const n = (k: string) => Number(f[k]);

  switch (e.type) {
    case "challenge_streak_milestone":
      return {
        text: pick(
          [
            `${n("streak")} days straight on "${s("challengeTitle")}" 🔥 You're building something here.`,
            `${n("streak")}-day streak on "${s("challengeTitle")}". Don't break the chain now 👀`,
          ],
          e.dedupeKey
        ),
        links: link(e, `Open "${s("challengeTitle")}"`),
      };
    case "challenge_streak_at_risk":
      return {
        text: `Your ${n("streak")}-day streak on "${s("challengeTitle")}" is still alive, but today's proof isn't in yet 👀`,
        links: link(e, `Open "${s("challengeTitle")}"`),
      };
    case "quest_deadline_approaching":
      return {
        text: `Your quest "${s("questTitle")}" ends in about ${plural(n("hoursLeft"), "hour")}, with ${plural(n("tasksLeft"), "task")} still needing proof. You've still got time.`,
        links: link(e, `Open "${s("questTitle")}"`),
      };
    case "proof_verified":
      return {
        text:
          f.kind === "quest"
            ? `Proof verified ✅ "${s("label")}" for your quest "${s("parentTitle")}" is in. Nice.`
            : `Proof verified ✅ ${s("label")} of "${s("parentTitle")}" counts. Nice.`,
        links: link(e, `Open "${s("parentTitle")}"`),
      };
    case "proof_rejected": {
      const reason = f.reason ? ` The reason given: ${s("reason")}.` : "";
      const what = f.kind === "quest" ? `"${s("label")}"` : s("label");
      return {
        text: `Your proof for ${what} of "${s("parentTitle")}" needs another go.${reason} Happens to everyone. Fix it and resubmit.`,
        links: link(e, `Open "${s("parentTitle")}"`),
      };
    }
    case "reward_earned":
      return {
        text:
          f.status === "fulfilled"
            ? `You received ${s("rewardTitle")} from "${s("questTitle")}" 🎉`
            : `You earned ${s("rewardTitle")} from "${s("questTitle")}" 🎉 It's waiting to be issued.`,
        links: link(e, `Open "${s("questTitle")}"`),
      };
    case "inactivity_detected":
      return {
        text: `No approved proof in the last ${plural(n("days"), "day")}. "${s("challengeTitle")}" is still waiting for you. Ready to get back on track?`,
        links: link(e, `Open "${s("challengeTitle")}"`),
      };
    default:
      return null;
  }
}

const NUMBER = /\d+(?:[.,]\d+)?/g;
const QUOTED = /["“”]([^"“”]{1,160})["“”]/g;
const URL_OR_EMAIL = /\bhttps?:\/\/|\bwww\.|\b[\w.+-]+@[\w-]+\.[\w.]+\b/i;

/**
 * Grounding for the proactive path: every number and quoted name in a
 * message must come from the event's facts, and the message must be kind and
 * short. Returns the reasons it failed; empty means safe to show.
 */
export function checkEventMessage(text: string, event: StrivyEvent): string[] {
  const reasons: string[] = [];
  const factValues = Object.values(event.facts).map((v) => String(v).toLowerCase());
  const factText = factValues.join("\n");
  const allowedNumbers = new Set(factText.match(NUMBER) ?? []);

  if (!text.trim()) return ["empty"];
  if (text.length > MAX_NOTIFICATION_CHARS) reasons.push("too long");
  const newNumbers = (text.match(NUMBER) ?? []).filter((x) => !allowedNumbers.has(x));
  if (newNumbers.length) reasons.push(`unsupported numbers: ${newNumbers.join(", ")}`);
  for (const m of text.matchAll(QUOTED)) {
    if (!factText.includes(m[1].trim().toLowerCase())) reasons.push(`unknown name: "${m[1]}"`);
  }
  const lower = text.toLowerCase();
  const banned = BANNED_WORDS.filter(
    (w) => new RegExp(`\\b${w}\\b`).test(lower) && !factText.includes(w)
  );
  if (banned.length) reasons.push(`banned words: ${banned.join(", ")}`);
  if (URL_OR_EMAIL.test(text) && !URL_OR_EMAIL.test(factText)) reasons.push("link or email");
  return reasons;
}

/**
 * Turns events into at most MAX_CHECKINS grounded check-ins, most urgent
 * first. Events whose message fails checkEventMessage() are dropped.
 */
export function decideCheckIns(events: StrivyEvent[]): CheckIn[] {
  const seen = new Set<string>();
  const ordered = [...events]
    .filter((e) => (seen.has(e.dedupeKey) ? false : (seen.add(e.dedupeKey), true)))
    .sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));

  const out: CheckIn[] = [];
  for (const event of ordered) {
    if (out.length >= MAX_CHECKINS) break;
    const msg = eventMessage(event);
    if (!msg || checkEventMessage(msg.text, event).length > 0) continue;

    const notify = NOTIFY[event.type];
    out.push({
      event,
      reply: {
        intent: INTENT[event.type],
        text: msg.text,
        chips: [],
        links: msg.links,
        suggestions: [],
      },
      notification: notify
        ? {
            type: notify.type,
            dedupeKey: event.dedupeKey,
            title: notify.title,
            message: msg.text,
            relatedChallengeId: event.entityKind === "challenge" ? event.entityId : null,
            relatedQuestId: event.entityKind === "quest" ? event.entityId : null,
          }
        : null,
    });
  }
  return out;
}
