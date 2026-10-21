import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "@/lib/strivy/intents";
import { draftReply } from "@/lib/strivy/replies";
import { checkGrounding } from "@/lib/strivy/grounding";
import { toModelContext } from "@/lib/strivy/context";
import type { ChatTurn } from "@/lib/strivy/types";
import { SAMPLE, ctx } from "./helpers";

const afterStreak: ChatTurn[] = [
  { role: "user", text: "How's my streak?" },
  { role: "strivy", text: "You're on a 7-day streak 🔥", intent: "streak" },
];

test("'What about my quest?' switches to the quest topic", () => {
  assert.equal(classifyIntent("What about my quest?", afterStreak).intent, "quests");
});

test("short follow-ups stay on the previous topic", () => {
  for (const m of ["why?", "tell me more", "and that one?", "is it safe?", "what about it"]) {
    const r = classifyIntent(m, afterStreak);
    assert.equal(r.intent, "streak", m);
    assert.deepEqual(r.matched, ["follow-up"]);
  }
});

test("after a reset (new chat), follow-ups ask instead of guessing", () => {
  const r = classifyIntent("why?", []);
  assert.equal(r.intent, "unknown");
  assert.deepEqual(r.matched, ["follow-up-no-context"]);
  const reply = draftReply({ ...ctx("unknown"), intent: r }, "why?");
  assert.match(reply.text, /not sure what that refers to/);
  assert.ok(reply.suggestions.length >= 3);
});

test("ambiguous follow-ups after a non-data reply ask too", () => {
  const afterJoke: ChatTurn[] = [{ role: "strivy", text: "Ha", intent: "off_topic" }];
  assert.deepEqual(classifyIntent("and that?", afterJoke).matched, ["follow-up-no-context"]);
});

test("follow-ups work from a check-in's intent", () => {
  const afterCheckIn: ChatTurn[] = [
    { role: "strivy", text: "Your quest ends soon", intent: "quests" },
  ];
  assert.equal(classifyIntent("why?", afterCheckIn).intent, "quests");
});

test("unrelated messages are not treated as follow-ups", () => {
  assert.equal(classifyIntent("bananas", afterStreak).intent, "unknown");
  assert.deepEqual(classifyIntent("bananas", afterStreak).matched, []);
});

/* ── Phase 3 grounding additions ─────────────────────────────────────────── */

test("a rewrite may not add status or reward claims", () => {
  const context = ctx("streak", SAMPLE);
  const model = toModelContext(context);
  const draft = draftReply(context, "streak");
  const verified = checkGrounding(`${draft.text} Your proof is verified!`, model, draft);
  assert.equal(verified.ok, false);
  assert.ok(verified.reasons.some((r) => r.includes("verified")));
  const reward = checkGrounding(`${draft.text} You earned a reward.`, model, draft);
  assert.equal(reward.ok, false);
  assert.ok(reward.reasons.some((r) => r.includes("earned")));
});

test("claims already in the draft may be repeated", () => {
  const context = ctx("proof_status", SAMPLE);
  const model = toModelContext(context);
  const draft = draftReply(context, "proof");
  assert.match(draft.text, /verified/);
  assert.equal(checkGrounding(draft.text, model, draft).ok, true);
});
