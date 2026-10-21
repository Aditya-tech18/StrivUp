/**
 * src/lib/strivy/companion/serious.ts
 *
 * Whether a chat message is serious or low (a crisis, a bad mood, "main
 * bekaar hoon", "I can't do this"). After one, STRIVY plays no jokes: the
 * chat already answers with support (never a roast), and companion popups go
 * quiet for a while (see recordSerious in engine.ts).
 *
 * Kept apart from engine.ts so the always-loaded launcher doesn't carry the
 * intent rules; only the chat panel, which already sends messages, uses it.
 */
import { classifyIntent } from "../intents";

export function isSeriousMessage(text: string): boolean {
  const result = classifyIntent(text);
  return (
    result.intent === "crisis" ||
    result.intent === "motivation" ||
    result.matched.includes("general-mood")
  );
}
