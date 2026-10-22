import { test } from "node:test";
import assert from "node:assert/strict";
import { draftReply } from "@/lib/strivy/replies";
import { selectKnowledge } from "@/lib/strivy/knowledge";
import type { StrivyIntent } from "@/lib/strivy/types";
import { SAMPLE, ctx } from "./helpers";

const DATA_INTENTS: StrivyIntent[] = [
  "today",
  "focus",
  "streak",
  "proof_status",
  "progress",
  "challenges",
  "quests",
  "rewards",
];

test("every intent produces a non-empty reply with sample data", () => {
  const all: StrivyIntent[] = [
    ...DATA_INTENTS,
    "greeting",
    "thanks",
    "motivation",
    "how_it_works",
    "help",
    "strivy_info",
    "create",
    "not_built",
    "off_topic",
    "crisis",
    "unknown",
  ];
  for (const intent of all) {
    const r = draftReply(ctx(intent, SAMPLE), "test message");
    // Knowledge intents with no knowledge given fall back to the unknown reply.
    const noKnowledge = ["how_it_works", "help", "create", "not_built"].includes(intent);
    assert.equal(r.intent, noKnowledge ? "unknown" : intent);
    assert.ok(r.text.trim().length > 0, intent);
    assert.ok(r.text.length < 900, `${intent} too long`);
  }
});

test("data replies use the real values from the facts", () => {
  const streak = draftReply(ctx("streak", SAMPLE), "how's my streak");
  assert.match(streak.text, /11/);
  assert.match(streak.text, /30 Days of Running/);
  assert.match(streak.text, /14/);

  const today = draftReply(ctx("today", SAMPLE), "what's due today");
  assert.match(today.text, /Run 5km/);
  assert.match(today.text, /1 of 2 done/);
  assert.match(today.text, /Café Trail/);
  assert.match(today.text, /1\/3/);

  const rewards = draftReply(ctx("rewards", SAMPLE), "rewards?");
  assert.match(rewards.text, /Free smoothie/);
  assert.match(rewards.text, /20% off voucher/);

  const progress = draftReply(ctx("progress", SAMPLE), "progress");
  assert.match(progress.text, /5\/7 days/);
  assert.match(progress.text, /92% consistent/);
});

test("missing data is reported as unavailable, never as none", () => {
  const cases: [StrivyIntent, string][] = [
    ["today", "today's tasks"],
    ["focus", "today's tasks"],
    ["streak", "your streaks"],
    ["proof_status", "your proofs"],
    ["progress", "this week's activity"],
    ["challenges", "your challenges"],
    ["quests", "your quests"],
    ["rewards", "your rewards"],
  ];
  for (const [intent, what] of cases) {
    const r = draftReply(ctx(intent, { unavailable: [what] }), "x");
    assert.match(r.text, /couldn't load/, intent);
    assert.doesNotMatch(r.text, /\d/, `${intent} invented a number`);
  }
});

test("empty data gives honest empty-state replies without invented values", () => {
  const empty = {
    today: { tasks: [], completed: 0, total: 0, bestStreak: 0 },
    challenges: [],
    quests: [],
    proofs: [],
    rewards: [],
    availableRewards: [],
    week: { activeDays: 0, approvedProofs: 0 },
  };
  assert.match(draftReply(ctx("streak", empty), "x").text, /No active challenge yet/);
  assert.match(draftReply(ctx("proof_status", empty), "x").text, /No proof submitted yet/);
  assert.match(draftReply(ctx("quests", empty), "x").text, /No quests joined yet/);
  assert.match(draftReply(ctx("rewards", empty), "x").text, /No rewards yet/);
  assert.match(draftReply(ctx("today", empty), "x").text, /Nothing due today/);
  assert.match(
    draftReply(ctx("progress", empty), "x").text,
    /No approved proof in the last 7 days/
  );
});

test("a partial failure is named: today loads but quests don't", () => {
  const r = draftReply(
    ctx("today", { today: SAMPLE.today, unavailable: ["your quests"] }),
    "today"
  );
  assert.match(r.text, /Run 5km/);
  assert.match(r.text, /couldn't check your quests/);
});

test("rewards reply says when earnable rewards couldn't be checked", () => {
  const r = draftReply(ctx("rewards", { rewards: [], unavailable: ["rewards you can earn"] }), "x");
  assert.match(r.text, /couldn't check which rewards/);
});

test("unknown and off-topic replies redirect to what Strivy can do", () => {
  const unknown = draftReply(ctx("unknown"), "asdf");
  assert.match(unknown.text, /lost me|caught that|flew right over/);
  assert.doesNotMatch(unknown.text, /didn't quite get that/);
  assert.ok(unknown.suggestions.length > 0);

  const off = draftReply(ctx("off_topic"), "weather?");
  assert.match(off.text, /STRIVUP/);
  assert.equal(off.chips.length, 0);
});

test("crisis reply gives helplines and never teases", () => {
  const r = draftReply(ctx("crisis", SAMPLE), "I want to die");
  assert.match(r.text, /14416/);
  assert.match(r.text, /112/);
  assert.doesNotMatch(r.text, /😏|streak/i);
});

test("motivation reply is supportive and uses today's real task", () => {
  const r = draftReply(ctx("motivation", SAMPLE), "i dont feel like it");
  assert.match(r.text, /Asha/);
  assert.match(r.text, /Run 5km/);
  assert.doesNotMatch(r.text, /lazy|shame|disappoint/i);
});

test("no teasing after a rejection", () => {
  const today = {
    ...SAMPLE.today,
    tasks: [{ ...SAMPLE.today.tasks[0], state: "rejected" as const }],
  };
  const r = draftReply(ctx("today", { ...SAMPLE, today }), "today");
  assert.match(r.text, /Happens to everyone/);
  assert.doesNotMatch(r.text, /😏/);
});

test("knowledge replies come only from the knowledge base", () => {
  const info = draftReply(
    ctx("strivy_info", {}, selectKnowledge("strivy_info", "who are you")),
    "who are you"
  );
  // Phase 5: a short intro in Strivy's voice, never how it works inside.
  assert.match(info.text, /accountability buddy/);
  assert.doesNotMatch(info.text, /AI model|database|STRIVUP data/);

  const quest = draftReply(
    ctx("create", {}, selectKnowledge("create", "help me create a quest")),
    "help me create a quest"
  );
  assert.match(quest.text, /can't create a quest yourself/);
  assert.deepEqual(quest.chips, [{ label: "Planned", tone: "pending" }]);

  const points = draftReply(
    ctx("not_built", {}, selectKnowledge("not_built", "do i have points")),
    "do i have points"
  );
  assert.match(points.text, /doesn't have points/);

  const diff = draftReply(
    ctx(
      "how_it_works",
      {},
      selectKnowledge("how_it_works", "difference between quest and challenge")
    ),
    "difference between quest and challenge"
  );
  assert.match(diff.text, /A challenge is a daily habit/);

  const upload = draftReply(
    ctx("help", {}, selectKnowledge("help", "how do I upload proof")),
    "how do I upload proof"
  );
  assert.match(upload.text, /Upload Proof/);
});

test("knowledge intents with no matching entry fall back to the unknown reply", () => {
  assert.match(
    draftReply(ctx("not_built", {}, []), "x").text,
    /lost me|caught that|flew right over/
  );
});
