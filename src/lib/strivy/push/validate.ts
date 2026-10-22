/**
 * src/lib/strivy/push/validate.ts
 *
 * Every push is checked before it is claimed or sent, whichever generator
 * wrote it:
 *
 *  - grounded: every number and every quoted name comes from the candidate's
 *    own database values, so no invented streak, quest, reward or deadline;
 *  - safe: cheeky is fine, explicit is not. No sexual content, insults,
 *    threats, guilt trips or fake AI claims;
 *  - short: a title and one or two sentences.
 */
import { BANNED_WORDS, FAKE_AI_CLAIMS } from "../persona";
import { containsInternalMetadata } from "../sanitize";
import { MAX_BODY_CHARS } from "./config";
import type { PushMessage } from "./messages";
import type { PushCandidate } from "./planner";

const NUMBER = /\d+(?:[.,]\d+)?/g;
const DOUBLE_QUOTED = /["“”]([^"“”]{1,160})["“”]/g;
const SINGLE_QUOTED = /(?:^|[\s(:])['‘]([^'‘’\n]{1,160})['’](?=[\s.,!?;:)…]|$)/g;
const URL_OR_EMAIL = /\bhttps?:\/\/|\bwww\.|\b[\w.+-]+@[\w-]+\.[\w.]+\b/i;

/** Explicit, abusive or threatening words. "Sexy plan" style slang is allowed; this isn't. */
const UNSAFE =
  /\b(sex|sexual|nude|nudes|naked|horny|porn|boobs?|dick|pussy|fuck\w*|bitch|slut|whore|chut\w*|lund|bhosd\w*|madarchod|behenchod|bc|mc|randi|kill you|hurt you|or else|you('| a)re worthless|kutt[ae]|kamine?)\b/i;

/** Guilt trips and pressure. */
const MANIPULATIVE =
  /\b(you (will|are going to) regret|disappoint(ed|ing)? (me|us)|last chance|everyone else is|shame)\b/i;

export function validatePushMessage(msg: PushMessage, candidate: PushCandidate): string[] {
  const reasons: string[] = [];
  const body = msg.body.trim();
  if (!body) return ["empty"];
  if (!msg.title.trim() || msg.title.length > 60) reasons.push("bad title");
  if (body.length > MAX_BODY_CHARS) reasons.push("too long");
  const sentences = body.split(/(?<=[.!?…])\s+/).filter((s) => /\p{L}/u.test(s));
  if (sentences.length > 3) reasons.push("too many sentences");

  const values = Object.values(candidate.vars).map((v) => String(v).toLowerCase());
  const valueText = values.join("\n");
  const allowedNumbers = new Set(valueText.match(NUMBER) ?? []);
  const newNumbers = (body.match(NUMBER) ?? []).filter((n) => !allowedNumbers.has(n));
  if (newNumbers.length) reasons.push(`unsupported numbers: ${newNumbers.join(", ")}`);

  for (const m of [...body.matchAll(DOUBLE_QUOTED), ...body.matchAll(SINGLE_QUOTED)]) {
    const name = m[1].trim().toLowerCase();
    if (name && !valueText.includes(name)) reasons.push(`unknown name: ${m[1]}`);
  }

  const lower = `${msg.title}\n${body}`.toLowerCase();
  const banned = BANNED_WORDS.filter(
    (w) => new RegExp(`\\b${w}\\b`).test(lower) && !valueText.includes(w)
  );
  if (banned.length) reasons.push(`banned words: ${banned.join(", ")}`);
  if (UNSAFE.test(body) && !UNSAFE.test(valueText)) reasons.push("unsafe content");
  if (MANIPULATIVE.test(body)) reasons.push("manipulative");
  if (FAKE_AI_CLAIMS.test(body)) reasons.push("fake AI claim");
  if (URL_OR_EMAIL.test(body) && !URL_OR_EMAIL.test(valueText)) reasons.push("link or email");
  if (/\{\w+\}/.test(body)) reasons.push("unfilled placeholder");
  // A notification is only ever the message: no safety verdicts or debug labels.
  if (containsInternalMetadata(`${msg.title}\n${body}`)) reasons.push("internal metadata");

  // Bad news is never teased.
  if (candidate.type === "proof_rejected" && /😏|suggest/.test(body + msg.tone))
    reasons.push("teasing bad news");

  return reasons;
}
