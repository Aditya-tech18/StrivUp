import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, detectIntent, normalizeMessage } from "@/lib/strivy/intents";
import type { StrivyIntent } from "@/lib/strivy/types";

const CASES: [string, StrivyIntent][] = [
  // greetings and thanks
  ["hi", "greeting"],
  ["Hey there", "greeting"],
  ["good morning", "greeting"],
  ["thanks!", "thanks"],
  ["thank you so much", "thanks"],
  // today / focus
  ["What's my quest today?", "today"],
  ["what's due today", "today"],
  ["what do i have left", "today"],
  ["What should I focus on today?", "focus"],
  ["where do I start", "focus"],
  // streak
  ["How's my streak?", "streak"],
  ["how many days in a row have I done it", "streak"],
  // progress
  ["Show my progress", "progress"],
  ["how am I doing this week", "progress"],
  ["what's my consistency", "progress"],
  // proof
  ["Did my proof get verified?", "proof_status"],
  ["why was my proof rejected", "proof_status"],
  ["is my submission approved", "proof_status"],
  // quests and challenges
  ["What's my active quest?", "quests"],
  ["show my current quests", "quests"],
  ["which challenges am i in", "challenges"],
  ["my active challenges", "challenges"],
  // rewards
  ["Did I earn any rewards?", "rewards"],
  ["can I win anything", "rewards"],
  // general STRIVUP knowledge
  ["How does STRIVUP work?", "how_it_works"],
  ["how does verification work", "how_it_works"],
  ["how are streaks counted", "how_it_works"],
  ["what is a quest", "how_it_works"],
  ["difference between a quest and a challenge", "how_it_works"],
  // how-to help
  ["how do I upload proof", "help"],
  ["how can i invite friends", "help"],
  ["how to change my username", "help"],
  // create
  ["Help me create a quest", "create"],
  ["I want to make a new challenge", "create"],
  // about Strivy
  ["who are you", "strivy_info"],
  ["are you an AI?", "strivy_info"],
  // Phase 5: "what can you do" has its own short capabilities answer.
  ["what can you do", "capabilities"],
  // not built
  ["do I have any points?", "not_built"],
  ["can I join a crew", "not_built"],
  ["is there a premium subscription", "not_built"],
  // motivation
  ["I don't feel like doing it today", "motivation"],
  ["motivate me", "motivation"],
  ["I'm so tired, I want to give up", "motivation"],
  // off topic
  ["what's the weather in Delhi", "off_topic"],
  ["write me a poem", "off_topic"],
  ["tell me a joke", "general_chat"],
  // unknown
  ["asdfgh", "unknown"],
  ["bananas", "unknown"],
];

for (const [message, expected] of CASES) {
  test(`"${message}" → ${expected}`, () => {
    assert.equal(detectIntent(message), expected);
  });
}

test("crisis messages always route to the safety reply", () => {
  for (const m of [
    "I want to die",
    "thinking about suicide",
    "I might hurt myself",
    "my streak broke and I want to end my life",
  ]) {
    const r = classifyIntent(m);
    assert.equal(r.intent, "crisis", m);
    assert.equal(r.confidence, "high");
  }
});

test("a greeting with a question answers the question", () => {
  assert.equal(detectIntent("hey, how's my streak?"), "streak");
});

test("empty and whitespace messages are unknown", () => {
  assert.equal(detectIntent(""), "unknown");
  assert.equal(detectIntent("   "), "unknown");
});

test("short follow-ups reuse the previous data intent", () => {
  const history = [
    { role: "user" as const, text: "did my proof get verified" },
    { role: "strivy" as const, text: "…", intent: "proof_status" as const },
  ];
  const r = classifyIntent("why?", history);
  assert.equal(r.intent, "proof_status");
  assert.equal(r.confidence, "low");
  assert.deepEqual(r.matched, ["follow-up"]);
});

test("follow-ups don't reuse non-data intents", () => {
  const history = [{ role: "strivy" as const, text: "…", intent: "off_topic" as const }];
  assert.equal(detectIntent("why?", history), "unknown");
});

test("results carry confidence and matched rule names", () => {
  const r = classifyIntent("How's my streak?");
  assert.equal(r.confidence, "high");
  assert.ok(r.matched.includes("streak-word"));
});

test("normalizeMessage straightens quotes and drops apostrophes", () => {
  assert.equal(normalizeMessage("  What’s   MY Streak "), "whats my streak");
});
