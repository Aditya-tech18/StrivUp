import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGrounding } from "@/lib/strivy/grounding";
import { toModelContext } from "@/lib/strivy/context";
import { draftReply } from "@/lib/strivy/replies";
import { SAMPLE, ctx } from "./helpers";

const context = ctx("streak", SAMPLE);
const model = toModelContext(context);
const draft = draftReply(context, "how's my streak");

test("the draft itself passes", () => {
  assert.deepEqual(checkGrounding(draft.text, model, draft), { ok: true, reasons: [] });
});

test("a faithful rephrase passes", () => {
  const r = checkGrounding(
    'Look at you: 11 days straight on "30 Days of Running" 🔥 Your best is 14, so keep going!',
    model,
    draft
  );
  assert.equal(r.ok, true, r.reasons.join("; "));
});

test("an invented streak number is rejected", () => {
  const r = checkGrounding('You\'re on a 45-day streak in "30 Days of Running"!', model, draft);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes("45")));
});

test("an invented challenge name is rejected", () => {
  const r = checkGrounding('11 days on "Morning Yoga" 🔥', model, draft);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes("Morning Yoga")));
});

test("an invented date is rejected", () => {
  const r = checkGrounding("11 days in a row. Your challenge ends on Friday!", model, draft);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes("friday")));
});

test("an invented reward or feature is rejected", () => {
  const r = checkGrounding("11 days! You've earned 11 bonus points and a badge.", model, draft);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.startsWith("feature claims")));
});

test("shaming language is rejected", () => {
  const r = checkGrounding("11 days, not bad for someone so lazy.", model, draft);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes("lazy")));
});

test("links and emails are rejected", () => {
  assert.equal(checkGrounding("11 days! See https://example.com", model, draft).ok, false);
  assert.equal(checkGrounding("11 days! Mail me at a@b.com", model, draft).ok, false);
});

test("dropping an unavailable-data notice is rejected", () => {
  const missing = ctx("today", { unavailable: ["today's tasks"] });
  const missingDraft = draftReply(missing, "today");
  const r = checkGrounding("You're all set for today!", toModelContext(missing), missingDraft);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes("dropped an unavailable-data notice"));
});

test("empty and over-long candidates are rejected", () => {
  assert.equal(checkGrounding("   ", model, draft).ok, false);
  assert.equal(checkGrounding("11 ".repeat(400), model, draft).ok, false);
});

test("the model context carries no ids", () => {
  const json = JSON.stringify(toModelContext(ctx("today", SAMPLE)));
  for (const id of ["c1", "c2", "q1", "q0"]) assert.ok(!json.includes(`"${id}"`), id);
  assert.ok(
    !json.includes("challengeId") && !json.includes("questId") && !json.includes("parentId")
  );
});
