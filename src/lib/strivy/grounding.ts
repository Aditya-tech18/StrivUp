/**
 * src/lib/strivy/grounding.ts
 *
 * The safety net between a model and the person. A candidate reply (a model's
 * rephrase of the draft) is accepted only if it adds nothing the draft and the
 * facts don't already contain. Any failed check means the pipeline shows the
 * grounded draft instead.
 *
 * The checks are deliberately strict and simple. A false rejection costs a
 * little style (the draft is shown); a false acceptance could show the person
 * a streak, reward or date that isn't real.
 */
import { BANNED_WORDS, FAKE_AI_CLAIMS, MAX_REPLY_CHARS } from "./persona";
import { containsInternalMetadata } from "./sanitize";
import type { StrivyModelContext, StrivyReply } from "./types";

export interface GroundingResult {
  ok: boolean;
  /** Why the candidate was rejected; empty when ok. */
  reasons: string[];
}

const MONTH =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
/** "12 Oct", "Oct 12", full month and weekday names, tomorrow, yesterday. */
const DATES = new RegExp(
  `\\b\\d{1,2} (?:${MONTH})\\b|\\b(?:${MONTH}) \\d{1,2}\\b|\\b(?:january|february|march|april|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|yesterday)\\b`,
  "gi"
);
const NUMBER = /\d+(?:[.,]\d+)?/g;
const QUOTED = /["“”]([^"“”]{1,120})["“”]/g;
/** 'Veer Ji Chaap' style names. The quote must open after a space, so "you're" isn't one. */
const SINGLE_QUOTED = /(?:^|[\s(:])['‘]([^'‘’\n]{1,120})['’](?=[\s.,!?;:)।]|$)/g;
const URL_OR_EMAIL = /\bhttps?:\/\/|\bwww\.|\b[\w.+-]+@[\w-]+\.[\w.]+\b/i;
const UNAVAILABLE = /\b(couldn'?t|could not|can'?t|cannot|unable|wasn'?t able|not able)\b/i;
const NOT_BUILT =
  /\b(points?|xp|coins?|badges?|levels?|crews?|marketplace|shop|store|subscriptions?|subscribe|premium|pro plan)\b/gi;

/** Status and reward claims: a rewrite may repeat these, never introduce them. */
const CLAIMS =
  /\b(verified|approved|rejected|pending|completed|finished|earned|won|received|claimed|unlocked|rewards?|vouchers?|prizes?|discounts?|deadline|expired?|overdue)\b/gi;

const DEVANAGARI_LETTER = /[\u0900-\u097F]/g;
const LATIN_LETTER = /[a-z]/gi;
/** Devanagari digits slip past NUMBER (\d is ASCII only), so they are checked on their own. */
const DEVANAGARI_DIGIT = /[\u0966-\u096F]+/g;

/** "2/3", "2 of 3", "3 में से 2": a progress figure, checked as a pair. */
const FRACTION =
  /(\d+)\s*(?:\/|out of|of)\s*(\d+)|(\d+)\s*(?:में से|मे से|me se|mein se)\s*(\d+)/gi;

/** Wording that exposes the machinery or sounds like a report, not a friend. */
const TECHNICAL =
  /\b(database|data ?base|according to (your|the) (data|records)|your data (shows|says|indicates|suggests)|based on (your|the) data|system prompt|my (instructions|prompt)|as an ai|language model|llm|ollama|openrouter|openai|chatgpt|gpt-?\d*|anthropic|qwen|llama|mistral|gemma|deepseek|nemotron|supabase|json)\b|डेटाबेस/i;

/** "Done!", "kar diya": claims that something was just done for the person. */
const ACTION_DONE =
  /\b(done|marked|submitted|completed|approved|verified|claimed|redeemed|finished|ho gaya|hogaya|ho gya|kar diya|kar dia|kr diya|kr dia)\b|हो गया|कर दिया|हो गइल|क दिहनी|भइल/i;

/** In small talk the model has no data, so it may not describe the person's. */
const DATA_STATEMENT =
  /\b(your|ur|tera|teri|tere|tumhara|tumhari|tumhare)\s+(current\s+|active\s+)?(streaks?|quests?|proofs?|rewards?|challenges?|tasks?|progress)\s+(is|are|was|looks?|hai|h|he|hain|chal|bach|khatam)\b|(तुम्हारा|तुम्हारी|तेरा|तेरी|तोहार|रउआ के)\s*(streak|quest|proof|reward|challenge|task|स्ट्रीक|क्वेस्ट)\S*\s+(है|बा|चल)/i;

/**
 * Sexual or explicit wording and slurs. Light double meanings are fine; this
 * catches the ones that aren't. Checked in every mode.
 */
const EXPLICIT =
  /\b(sex|sexy|sexual|nude|nudes|naked|porn|horny|boobs?|dick|penis|vagina|orgasm|condom|fuck\w*|bitch|slut|whore|chutiy[aeo]|chut|lund|lauda|gaand|bhosd\w*|randi|chudai|madarchod|behenchod|bhenchod|mc|bc)\b|सेक्स|चुदाई|चूतिय|लंड|गांड|भोसड|रंडी/i;

/** STRIVUP data words. Small talk that mentions one is held to the data rules. */
const DATA_WORD =
  /\b(streaks?|quests?|proofs?|rewards?|challenges?|tasks?|progress|vouchers?|points?|days? in a row)\b|स्ट्रीक|क्वेस्ट|टास्क|प्रूफ/i;

/** Small talk may run a little longer than its fallback line (a joke has a punchline). */
const CHAT_MAX_CHARS = 280;
const CHAT_MAX_SENTENCES = 4;

function wordsOf(text: string): string[] {
  return lower(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * True when `candidate` says the same thing as `previous` in nearly the same
 * words, so Strivy doesn't repeat itself turn after turn.
 */
export function repeatsPrevious(candidate: string, previous: string | null | undefined): boolean {
  if (!previous) return false;
  const a = wordsOf(candidate);
  const b = wordsOf(previous);
  if (a.length === 0 || b.length === 0) return false;
  if (a.join(" ") === b.join(" ")) return true;
  const setA = new Set(a);
  const setB = new Set(b);
  const shared = [...setA].filter((w) => setB.has(w)).length;
  return shared / Math.max(setA.size, setB.size) >= 0.8;
}

function fractions(text: string): string[] {
  return [...text.matchAll(FRACTION)].map((m) =>
    m[1] !== undefined ? `${Number(m[1])}/${Number(m[2])}` : `${Number(m[4])}/${Number(m[3])}`
  );
}

/** Every progress pair the facts support: quest tasks, today's tasks, challenge days. */
function factFractions(context: StrivyModelContext): Set<string> {
  const out = new Set<string>();
  const f = context.facts as {
    quests?: { tasksApproved?: number; tasksTotal?: number; tasksPending?: number }[];
    today?: { completed?: number; total?: number };
    challenges?: { currentDay?: number | null; durationDays?: number | null }[];
    week?: { activeDays?: number; approvedProofs?: number };
  };
  for (const q of f.quests ?? []) {
    if (q.tasksTotal != null) {
      out.add(`${q.tasksApproved ?? 0}/${q.tasksTotal}`);
      out.add(`${(q.tasksApproved ?? 0) + (q.tasksPending ?? 0)}/${q.tasksTotal}`);
    }
  }
  if (f.today?.total != null) out.add(`${f.today.completed ?? 0}/${f.today.total}`);
  for (const c of f.challenges ?? []) {
    if (c.currentDay != null && c.durationDays != null)
      out.add(`${c.currentDay}/${c.durationDays}`);
  }
  if (f.week) out.add(`${f.week.activeDays ?? 0}/7`);
  return out;
}

export interface GroundingOptions {
  /**
   * "chat": small talk with no personal data. The model writes its own line,
   * so it may be a bit longer and use everyday numbers or words ("2 minute
   * mein", "won"), but only while it says nothing about STRIVUP data; any
   * streak, quest, proof or reward talk gets the full data checks.
   */
  mode?: "rewrite" | "chat";
  /** Strivy's previous reply, to catch a near-copy. */
  previous?: string | null;
}

function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?…।])\s+|\n+/).filter((s) => /\p{L}/u.test(s)).length;
}

/** Share of letters written in Devanagari, 0 to 1. */
function devanagariShare(text: string): number {
  const dev = (text.match(DEVANAGARI_LETTER) ?? []).length;
  const lat = (text.match(LATIN_LETTER) ?? []).length;
  return dev + lat === 0 ? 0 : dev / (dev + lat);
}

function lower(s: string): string {
  return s.toLowerCase().replace(/[’‘]/g, "'");
}

function matches(text: string, pattern: RegExp): string[] {
  return (text.match(pattern) ?? []).map((m) => lower(m));
}

export function checkGrounding(
  candidate: string,
  context: StrivyModelContext,
  draft: StrivyReply,
  options: GroundingOptions = {}
): GroundingResult {
  const reasons: string[] = [];
  const text = candidate.trim();
  const draftText = lower(draft.text);
  // Small talk is sent no facts, so none may back up what it says.
  const factsText = options.mode === "chat" ? "" : lower(JSON.stringify(context));
  const known = `${draftText}\n${factsText}`;

  if (!text) return { ok: false, reasons: ["empty"] };
  // Belt and braces: the pipeline strips these first, so this only fires if
  // a new label format slips past stripInternalMetadata.
  if (containsInternalMetadata(text)) reasons.push("internal metadata");
  if (text.length > MAX_REPLY_CHARS) reasons.push("too long");

  const chat = options.mode === "chat";
  // Small talk that stays off STRIVUP data: everyday numbers and words are fine.
  const casual = chat && !DATA_WORD.test(text);

  // Length: a rewrite stays about as short as the draft (1–3 sentences by
  // default); small talk stays a few short lines.
  if (chat) {
    if (text.length > Math.max(draft.text.length * 2, CHAT_MAX_CHARS))
      reasons.push("too long for small talk");
    if (sentenceCount(text) > CHAT_MAX_SENTENCES) reasons.push("too many sentences");
  } else {
    if (text.length > Math.max(draft.text.length * 2, 160))
      reasons.push("much longer than the draft");
    if (sentenceCount(text) > Math.max(sentenceCount(draft.text) + 1, 3)) {
      reasons.push("too many sentences");
    }
  }

  if (EXPLICIT.test(text) && !EXPLICIT.test(draftText)) reasons.push("explicit or abusive wording");
  if (repeatsPrevious(text, options.previous)) reasons.push("repeats the last reply");

  // Language: Hindi and Bhojpuri replies stay in Devanagari; English and
  // Hinglish replies stay in Roman script.
  const share = devanagariShare(text);
  if ((context.language === "hi" || context.language === "bho") && share < 0.3) {
    reasons.push("wrong language");
  }
  if ((context.language === "en" || context.language === "hinglish") && share > 0.2) {
    reasons.push("wrong language");
  }

  if (!casual) {
    const newDigits = matches(text, DEVANAGARI_DIGIT).filter((d) => !draftText.includes(d));
    if (newDigits.length > 0) reasons.push(`new numbers: ${newDigits.join(", ")}`);

    // Numbers: streak lengths, counts, percentages, dates, phone numbers.
    const allowedNumbers = new Set([...matches(draftText, NUMBER), ...matches(factsText, NUMBER)]);
    const newNumbers = matches(text, NUMBER).filter((n) => !allowedNumbers.has(n));
    if (newNumbers.length > 0) reasons.push(`new numbers: ${[...new Set(newNumbers)].join(", ")}`);

    // Quoted names: challenge, quest, task and reward titles.
    for (const m of [...text.matchAll(QUOTED), ...text.matchAll(SINGLE_QUOTED)]) {
      const name = lower(m[1].trim());
      if (name && !known.includes(name)) reasons.push(`unknown name: "${m[1].trim()}"`);
    }

    // Dates: a month or weekday the draft didn't mention.
    const draftDates = new Set(matches(draftText, DATES));
    const newDates = matches(text, DATES).filter((d) => !draftDates.has(d));
    if (newDates.length > 0) reasons.push(`new dates: ${[...new Set(newDates)].join(", ")}`);
  }

  // The thing the answer is about must stay the thing it's about: a rewrite
  // that drops the draft's quest or challenge name (and so could swap a quest
  // for a challenge) is rejected.
  if (!chat) {
    const lowerCandidate = lower(text);
    for (const m of [...draft.text.matchAll(QUOTED), ...draft.text.matchAll(SINGLE_QUOTED)]) {
      const name = lower(m[1].trim());
      // The reason names no title: it may be logged, and titles are user data.
      if (name.length >= 3 && !lowerCandidate.includes(name)) {
        reasons.push("dropped the quest/challenge name");
        break;
      }
    }
  }

  // "I couldn't load X" must survive a data rewrite. (Small talk has no data,
  // and its fallback line may say "can't" without being a data notice.)
  if (!chat && UNAVAILABLE.test(draftText) && !UNAVAILABLE.test(text)) {
    reasons.push("dropped an unavailable-data notice");
  }

  // Tone: never shaming.
  const lowerText = lower(text);
  const banned = BANNED_WORDS.filter(
    (w) => new RegExp(`\\b${w}\\b`).test(lowerText) && !new RegExp(`\\b${w}\\b`).test(draftText)
  );
  if (banned.length > 0) reasons.push(`banned words: ${banned.join(", ")}`);

  // Features STRIVUP doesn't have (or that aren't live) the draft didn't raise.
  const draftFeatures = new Set(matches(draftText, NOT_BUILT));
  const newFeatures = matches(text, NOT_BUILT).filter((f) => !draftFeatures.has(f));
  if (newFeatures.length > 0)
    reasons.push(`feature claims: ${[...new Set(newFeatures)].join(", ")}`);

  // Status and reward claims (e.g. "verified", "you earned a voucher").
  if (!casual) {
    const draftClaims = new Set(matches(draftText, CLAIMS));
    const newClaims = matches(text, CLAIMS).filter((c) => !draftClaims.has(c));
    if (newClaims.length > 0) reasons.push(`new claims: ${[...new Set(newClaims)].join(", ")}`);
  }

  // No pretending to be an AI that analysed the person.
  if (FAKE_AI_CLAIMS.test(text) && !FAKE_AI_CLAIMS.test(draftText)) reasons.push("fake AI claim");

  // Links and contact details only come from the reply's own link buttons.
  if (URL_OR_EMAIL.test(text) && !URL_OR_EMAIL.test(draftText)) reasons.push("link or email");

  // Progress pairs ("2/3 done") must be ones the facts or the draft support.
  if (!casual) {
    const allowedFractions = new Set([
      ...fractions(draft.text),
      ...(chat ? [] : factFractions(context)),
    ]);
    const newFractions = fractions(text).filter((f) => !allowedFractions.has(f));
    if (newFractions.length > 0)
      reasons.push(`new progress: ${[...new Set(newFractions)].join(", ")}`);
  }

  // Talking like a system ("according to your database", "as an AI model").
  if (TECHNICAL.test(text) && !TECHNICAL.test(draftText)) reasons.push("technical wording");

  // "Complete my quest" → the model must not say it did.
  if (
    context.intent === "action_request" &&
    ACTION_DONE.test(text) &&
    !ACTION_DONE.test(draftText)
  ) {
    reasons.push("claims an action it can't do");
  }

  // Small talk: no data was given, so nothing may be said about the person's data.
  if (chat && DATA_STATEMENT.test(text) && !DATA_STATEMENT.test(draftText)) {
    reasons.push("talks about data it wasn't given");
  }

  return { ok: reasons.length === 0, reasons };
}
