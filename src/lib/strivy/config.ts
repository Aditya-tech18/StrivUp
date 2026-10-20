/**
 * STRIVY settings shared by the server and the chat UI.
 *
 * The on/off switch is only evaluated on the server (the (app) layout and the
 * chat route). STRIVY is off unless STRIVY_ENABLED=true, so deploying the code
 * alone changes nothing.
 */
export function isStrivyEnabled(): boolean {
  return process.env.STRIVY_ENABLED === "true";
}

/** Suggested prompts on Strivy's opening screen. */
export const STARTER_PROMPTS = [
  "What's my streak?",
  "What's my quest?",
  "What's pending?",
  "What should I do today?",
  "Did I earn anything?",
  "How's my progress?",
];
