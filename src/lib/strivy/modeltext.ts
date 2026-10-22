/**
 * src/lib/strivy/modeltext.ts
 *
 * Provider-neutral pieces every text model shares: the two errors the
 * pipeline understands, and the clean-up applied to whatever a model returns
 * before the grounding check sees it.
 */

/** The provider is on but can't be used right now; the pipeline falls back. */
export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

/** The model answered, but not with something usable. */
export class MalformedModelResponseError extends Error {
  constructor(message = "malformed response") {
    super(message);
    this.name = "MalformedModelResponseError";
  }
}

/**
 * A reply that hit the token cap mid-sentence, cut back to its last complete
 * sentence. Returns "" when not even one sentence finished.
 */
export function trimToSentence(text: string): string {
  const m = text.match(
    /^[\s\S]*[.!?…।](?:[\s"'”’)]*[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+)?/u
  );
  return m ? m[0].trim() : "";
}

/** Removes reasoning blocks, speaker labels, wrapping quotes and markdown. */
export function cleanModelText(raw: string): string {
  let text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();
  text = text.replace(/^(strivy|assistant)\s*:\s*/i, "");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
  if (/^["“][\s\S]*["”]$/.test(text)) text = text.slice(1, -1).trim();
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
