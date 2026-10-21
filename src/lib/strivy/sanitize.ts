/**
 * src/lib/strivy/sanitize.ts
 *
 * The last gate before any STRIVY text reaches a person (chat bubble, voice,
 * push). It removes internal metadata from the payload itself, not just from
 * the screen: safety-classifier labels ("User Safety: safe", "Response
 * Safety: safe"), routing/debug lines ("intent:", "provider:", "model:",
 * "latency:"…) and raw JSON wrappers ({"response": "…"}).
 *
 * Why this exists: OpenRouter's free router can hand a request to, or mix in
 * output from, a content-safety model (Nemotron Safety Guard / Llama Guard
 * style). Those answer in exactly that "User Safety: safe" format. Small talk
 * with no STRIVUP words passed the grounding check, so the label went straight
 * into the chat. STRIVY's own code never writes these strings.
 *
 * Pure and dependency-free, so the server, the panel and tests share it.
 */

/** A whole line that is only an internal label ("intent: streak", "Safety: safe"). */
const META_LINE =
  /^\s*[*_#>`•-]*\s*["']?(user[ _-]?safety|response[ _-]?safety|prompt[ _-]?safety|content[ _-]?safety|safety(?:[ _-]?(?:score|categor(?:y|ies)|rating|label|check|status|level|result))?|unsafe[ _-]?categor(?:y|ies)|violated[ _-]?categor(?:y|ies)|intent|provider|model|latency|debug|routing|route|classification|classifier|confidence|grounding|internal|raw[ _-]?response|served[ _-]?by|finish[ _-]?reason|usage|tokens?|fallback(?:[ _-]?reason)?|mode|timings?)["']?\s*[*_]*\s*[:=]/i;

/** The same labels inline: "User Safety: safe 🔥 1 day" keeps only "🔥 1 day". */
const META_INLINE =
  /["']?\b(?:user|response|prompt|content)[ _-]?safety["']?\s*[:=]\s*["']?(?:safe|unsafe|needs[ _-]?caution|controversial)\b["']?[.,;|]*\s*/gi;

/** A guard model's bare verdict: the whole line is "safe", "unsafe" or "unsafe S1". */
const VERDICT_ONLY =
  /^\s*[*_`"']*(safe|unsafe|needs caution)(\s+[sS]\d{1,2}(\s*,\s*[sS]\d{1,2})*)?[*_`"']*[.!]?\s*$/i;

/** Hazard codes a guard model lists: "S1", "S10, S12". */
const HAZARD_CODES = /^\s*[sS]\d{1,2}(\s*,\s*[sS]\d{1,2})*\s*$/;

/** Fields a JSON-wrapped model reply may keep its text in. */
const TEXT_FIELDS = ["response", "reply", "text", "message", "answer", "content", "output"];

/** Pulls the reply out of a JSON wrapper; null when the text isn't JSON. */
function unwrapJson(text: string): string | null {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  if (!/^[{[]/.test(t)) return null;
  try {
    const value: unknown = JSON.parse(t);
    const obj = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
    if (obj && typeof obj === "object") {
      for (const key of TEXT_FIELDS) {
        const v = obj[key];
        if (typeof v === "string" && v.trim()) return v;
        if (v && typeof v === "object") {
          const nested = unwrapJson(JSON.stringify(v));
          if (nested) return nested;
        }
      }
    }
    // JSON with no reply text in it (a safety verdict, debug data): nothing to show.
    return "";
  } catch {
    return null;
  }
}

/**
 * The text with every internal label removed. Returns "" when nothing but
 * metadata was there (the caller then uses its grounded fallback).
 */
export function stripInternalMetadata(raw: string): string {
  if (typeof raw !== "string") return "";
  let text = raw;
  const unwrapped = unwrapJson(text);
  if (unwrapped !== null) text = unwrapped;
  text = text.replace(META_INLINE, "");
  const lines = text
    .split(/\r?\n/)
    .filter(
      (line) => !META_LINE.test(line) && !VERDICT_ONLY.test(line) && !HAZARD_CODES.test(line)
    );
  return lines
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when any internal label is present (tests, push validation, grounding). */
export function containsInternalMetadata(text: string): boolean {
  if (typeof text !== "string" || !text) return false;
  if (unwrapJson(text) !== null) return true;
  META_INLINE.lastIndex = 0;
  if (META_INLINE.test(text)) return true;
  META_INLINE.lastIndex = 0;
  return text
    .split(/\r?\n/)
    .some((line) => META_LINE.test(line) || VERDICT_ONLY.test(line) || HAZARD_CODES.test(line));
}

interface ReplyLike {
  text: string;
  chips?: { label: string }[];
  links?: { label: string }[];
  suggestions?: string[];
}

/**
 * A reply with its text, chips, link labels and suggestions cleaned. Chips,
 * links and suggestions that were only metadata are dropped. When the text
 * itself was only metadata, `fallback` (the grounded draft's text) is used.
 */
export function sanitizeReply<T extends ReplyLike>(reply: T, fallback?: string): T {
  const text =
    stripInternalMetadata(reply.text) || (fallback ? stripInternalMetadata(fallback) : "");
  const clean = <X extends { label: string }>(xs: X[] | undefined) =>
    (xs ?? []).map((x) => ({ ...x, label: stripInternalMetadata(x.label) })).filter((x) => x.label);
  return {
    ...reply,
    text,
    ...(reply.chips ? { chips: clean(reply.chips) } : {}),
    ...(reply.links ? { links: clean(reply.links) } : {}),
    ...(reply.suggestions
      ? { suggestions: reply.suggestions.map(stripInternalMetadata).filter(Boolean) }
      : {}),
  };
}
