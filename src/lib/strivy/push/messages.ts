/**
 * src/lib/strivy/push/messages.ts
 *
 * The push message library and the generator interface.
 *
 *   candidate (type + database values) → generator → message → validate
 *
 * Today the deterministic generator picks one of several hand-written
 * variants and fills in the candidate's values. A local model (for example
 * Ollama) can later implement PushMessageGenerator to write fresh lines; its
 * output goes through the same validation, and the deterministic library is
 * the fallback whenever it fails, is slow or is switched off.
 *
 * Voice: playful, cheeky, short, sometimes a harmless double meaning. Tones
 * are mixed so the day doesn't read the same, and at most one "suggestive"
 * line goes out per day. Bad news (a rejected proof) is never teased.
 */
import type { StrivyLang } from "../language";
import { count, spanOf } from "../phrases";
import { LANGUAGE_LIBRARIES, type PushTone, type Variant } from "./library";
import type { PushCandidate, PushType, PushVars } from "./planner";

export type { PushTone, Variant } from "./library";

export interface PushMessage {
  title: string;
  body: string;
  tone: PushTone;
}

/** The mixed English/Hinglish library, for users whose language isn't known yet. */
export const LIBRARY: Record<PushType, Variant[]> = {
  morning_checkin: [
    { tone: "info", text: "Good morning 👀 {count} on your plate today." },
    { tone: "motivational", text: "Rise and grind 😌 {count} waiting for you today." },
    { tone: "suggestive", text: "Plan toh sexy hai, ab action bhi dikha de. 👀 {count} today." },
    { tone: "funny", text: "Subah ho gayi 🌞 Aaj ka menu: {count}." },
  ],
  pending_task: [
    { tone: "cheeky", text: "Aaj ka proof abhi pending hai 😏 {task} is waiting." },
    {
      tone: "suggestive",
      text: "Proof dikha de… progress tabhi maanenge 😏 {task} is still open.",
    },
    { tone: "motivational", text: "{task} is still open today. A few minutes, go 💪" },
    { tone: "info", text: "Reminder: {task} hasn't got today's proof yet." },
    { tone: "cheeky", text: "Today's proof is pending. You know what to do. 😏 {task}" },
  ],
  streak_at_risk: [
    {
      tone: "cheeky",
      text: "Streak ko itna tease mat kar… aaj ka proof daal de 👀 {streak} streak on {challenge}.",
    },
    {
      tone: "suggestive",
      text: "Streak ko touch-and-go mat bana. 🔥 Your {streak} streak on {challenge} needs today's proof.",
    },
    { tone: "info", text: "Your {streak} streak on {challenge} needs today's proof 🔥" },
  ],
  quest_deadline: [
    { tone: "info", text: "{quest} ends in about {hours}, with {tasks} left ⏳" },
    { tone: "cheeky", text: "Quest ko itna wait mat karwa 👀 {quest} ends in about {hours}." },
  ],
  quest_progress: [
    { tone: "cheeky", text: "Your {quest} quest is still waiting 👀 {approved}/{total} done." },
    {
      tone: "suggestive",
      text: "Quest ko itna wait mat karwa 👀 {quest}: {approved}/{total} done.",
    },
    { tone: "motivational", text: "{quest}: {approved}/{total} tasks done. One more today? 💪" },
    { tone: "cheeky", text: "{quest} is still waiting. Don't keep it waiting 👀" },
  ],
  reward_earned: [
    { tone: "funny", text: "Cha-ching 👀 You earned {reward} from {quest}." },
    { tone: "milestone", text: "{reward} from {quest} is yours 🎉" },
  ],
  proof_verified: [
    { tone: "milestone", text: "Proof verified ✅ {label} on {parent} counts." },
    { tone: "cheeky", text: "Approved ✅ {label} on {parent}. Dekha? Ho gaya na 😏" },
    { tone: "funny", text: "Proof verified. Nice one. 👀 {label} on {parent} counts." },
  ],
  proof_rejected: [
    {
      tone: "info",
      text: "Your proof for {label} on {parent} needs another go. Fix it and resubmit.",
    },
    { tone: "motivational", text: "{parent}: {label} needs a resubmit. Happens to everyone 💪" },
  ],
  streak_milestone: [
    { tone: "milestone", text: "{streak} streak on {challenge} 🔥 Legend behaviour." },
    { tone: "funny", text: "{streak} streak on {challenge}. Ab kaun rokega? 🔥" },
    { tone: "motivational", text: "{days} strong on {challenge}. Keep the streak alive 🔥" },
  ],
  proof_in_review: [
    { tone: "info", text: "Your proof for {label} on {parent} is in review 👀 Hang tight." },
  ],
  inactivity: [
    { tone: "motivational", text: "{challenge} misses you 👀 One proof today and you're back." },
    { tone: "cheeky", text: "Itna gap? 👀 {challenge} is still waiting for you." },
  ],
  evening_checkin: [
    { tone: "cheeky", text: "Kaam pending hai... aur din khatam hone wala hai 👀 {count} left." },
    { tone: "motivational", text: "Still time tonight 🌙 {count} left today." },
  ],
  evening_done: [
    { tone: "milestone", text: "All {total} done today ✅ Rest easy, legend." },
    { tone: "funny", text: "Aaj ka kaam khatam ✅ All {total} done. Ab chill allowed 😌" },
  ],
};

/** A received (not just earned) reward reads differently. */
const REWARD_RECEIVED: Variant[] = [
  { tone: "milestone", text: "You received {reward} from {quest} 🎉" },
  { tone: "funny", text: "Cha-ching 👀 {reward} from {quest} has landed." },
  { tone: "milestone", text: "Your reward just landed. 🏆 {reward} from {quest}." },
];

/**
 * Re-words counts, hours and streak lengths in the push's language, from the
 * raw numbers the planner stored next to the English wording.
 */
export function localizeVars(vars: PushVars, lang: StrivyLang | null | undefined): PushVars {
  if (!lang) return vars;
  const out: PushVars = { ...vars };
  if (typeof vars.countN === "number") out.count = count(lang, vars.countN, "task");
  if (typeof vars.tasksN === "number") out.tasks = count(lang, vars.tasksN, "task");
  if (typeof vars.hoursN === "number") out.hours = count(lang, vars.hoursN, "hour");
  if (typeof vars.streakN === "number") {
    out.streak = spanOf(lang, vars.streakN);
    out.days = count(lang, vars.streakN, "day");
  }
  return out;
}

export function fill(text: string, vars: PushCandidate["vars"]): string {
  return text.replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole));
}

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

export interface GenerateContext {
  /** Varies the pick per user and day. */
  seed: string;
  title: string;
  /** Bodies already sent today: never repeated. */
  avoidBodies: ReadonlySet<string>;
  /** Tones already used today. */
  usedTones: readonly string[];
  /** Bodies sent in the last week: allowed, but only when nothing fresher fits. */
  recentBodies?: ReadonlySet<string>;
  /** The user's language; null or missing means the mixed library. */
  lang?: StrivyLang | null;
}

export interface PushMessageGenerator {
  name: string;
  /** Returns null when it has nothing valid to offer. */
  generate(candidate: PushCandidate, ctx: GenerateContext): Promise<PushMessage | null>;
}

/**
 * All usable messages for a candidate, best first: a tone not used today
 * first, never a second suggestive line in a day, never a repeat body.
 */
export function rankedMessages(candidate: PushCandidate, ctx: GenerateContext): PushMessage[] {
  const received = candidate.type === "reward_earned" && candidate.vars.status === "fulfilled";
  const library = ctx.lang ? LANGUAGE_LIBRARIES[ctx.lang] : null;
  const variants = library
    ? library[received ? "reward_received" : candidate.type]
    : received
      ? REWARD_RECEIVED
      : LIBRARY[candidate.type];
  const vars = localizeVars(candidate.vars, ctx.lang);
  const suggestiveUsed = ctx.usedTones.includes("suggestive");
  const start = hash(`${ctx.seed}|${candidate.dedupeKey}`) % variants.length;
  const rotated = [...variants.slice(start), ...variants.slice(0, start)];
  const usable = rotated
    .filter((v) => !(v.tone === "suggestive" && suggestiveUsed))
    .map((v) => ({ title: ctx.title, body: fill(v.text, vars), tone: v.tone }))
    .filter((m) => !ctx.avoidBodies.has(m.body));
  // Best first: not sent this week, then a tone not used today. The sort is
  // stable, so the per-user/day rotation decides among equals.
  const recent = ctx.recentBodies ?? new Set<string>();
  const cost = (m: PushMessage) =>
    (recent.has(m.body) ? 2 : 0) + (ctx.usedTones.includes(m.tone) ? 1 : 0);
  return usable
    .map((m, i) => ({ m, i, c: cost(m) }))
    .sort((a, b) => a.c - b.c || a.i - b.i)
    .map((x) => x.m);
}

export const deterministicGenerator: PushMessageGenerator = {
  name: "deterministic",
  async generate(candidate, ctx) {
    return rankedMessages(candidate, ctx)[0] ?? null;
  },
};

/**
 * The generator in use. Only "deterministic" exists; a local Ollama
 * generator would be added here behind STRIVY_PUSH_GENERATOR=ollama.
 * No hosted AI provider is ever used.
 */
export function getPushGenerator(): PushMessageGenerator {
  return deterministicGenerator;
}
