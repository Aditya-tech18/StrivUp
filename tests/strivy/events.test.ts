import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEvents, isValidEvent, istDate, type StrivyEvent } from "@/lib/strivy/events";
import type { StrivyFacts } from "@/lib/strivy/types";
import { SAMPLE, USER_ID } from "./helpers";

/** 20:00 IST on 28 Sep 2026: evening, so at-risk checks are active. */
const EVENING = new Date("2026-09-28T14:30:00Z");
/** 09:00 IST: morning. */
const MORNING = new Date("2026-09-28T03:30:00Z");

function facts(extra: Partial<StrivyFacts> = {}): StrivyFacts {
  return { firstName: null, unavailable: [], ...extra };
}
const types = (events: StrivyEvent[]) => events.map((e) => e.type).sort();

test("no facts, no events", () => {
  assert.deepEqual(detectEvents(facts(), USER_ID, EVENING), []);
});

test("events need a user id", () => {
  assert.deepEqual(detectEvents(facts({ challenges: SAMPLE.challenges }), "", EVENING), []);
});

test("every event is scoped to the given user and valid", () => {
  const events = detectEvents({ ...SAMPLE, unavailable: [] }, USER_ID, EVENING);
  assert.ok(events.length > 0);
  for (const e of events) {
    assert.equal(e.userId, USER_ID);
    assert.ok(isValidEvent(e), e.type);
    assert.ok(e.dedupeKey.startsWith(`${e.type}:`));
  }
});

test("streak milestone fires on milestone values only", () => {
  const at = (streak: number) =>
    detectEvents(
      facts({ challenges: [{ ...SAMPLE.challenges[0], currentStreak: streak }] }),
      USER_ID,
      EVENING
    ).filter((e) => e.type === "challenge_streak_milestone");
  assert.equal(at(7).length, 1);
  assert.equal(at(7)[0].facts.streak, 7);
  assert.equal(at(7)[0].facts.challengeTitle, "30 Days of Running");
  assert.equal(at(8).length, 0);
  assert.equal(at(0).length, 0);
});

test("milestones ignore completed or dropped challenges", () => {
  const e = detectEvents(
    facts({ challenges: [{ ...SAMPLE.challenges[0], currentStreak: 7, status: "completed" }] }),
    USER_ID,
    EVENING
  );
  assert.equal(e.length, 0);
});

test("streak at risk: evening, open task, streak ≥ 2", () => {
  const f = facts({ today: SAMPLE.today, challenges: SAMPLE.challenges });
  const evening = detectEvents(f, USER_ID, EVENING).filter(
    (e) => e.type === "challenge_streak_at_risk"
  );
  assert.equal(evening.length, 1);
  assert.equal(evening[0].facts.streak, 11);
  assert.equal(evening[0].dedupeKey, `challenge_streak_at_risk:c1:${istDate(EVENING)}`);

  const morning = detectEvents(f, USER_ID, MORNING).filter(
    (e) => e.type === "challenge_streak_at_risk"
  );
  assert.equal(morning.length, 0, "no nagging in the morning");
});

test("streak at risk needs both today's tasks and the streaks to have loaded", () => {
  const e = detectEvents(
    facts({ today: SAMPLE.today, unavailable: ["your challenges"] }),
    USER_ID,
    EVENING
  );
  assert.equal(e.length, 0);
});

test("quest deadline within 48h with tasks left", () => {
  const soon = new Date(EVENING.getTime() + 20 * 3600_000).toISOString();
  const later = new Date(EVENING.getTime() + 80 * 3600_000).toISOString();
  const quest = { ...SAMPLE.quests[0], endsAt: soon };
  const e = detectEvents(facts({ quests: [quest] }), USER_ID, EVENING);
  assert.deepEqual(types(e), ["quest_deadline_approaching"]);
  assert.equal(e[0].facts.hoursLeft, 20);
  assert.equal(e[0].facts.tasksLeft, 1);

  assert.equal(
    detectEvents(facts({ quests: [{ ...quest, endsAt: later }] }), USER_ID, EVENING).length,
    0
  );
  assert.equal(
    detectEvents(facts({ quests: [{ ...quest, tasksNeedAction: 0 }] }), USER_ID, EVENING).length,
    0
  );
  assert.equal(
    detectEvents(facts({ quests: [{ ...quest, completed: true }] }), USER_ID, EVENING).length,
    0
  );
  const past = new Date(EVENING.getTime() - 3600_000).toISOString();
  assert.equal(
    detectEvents(facts({ quests: [{ ...quest, endsAt: past }] }), USER_ID, EVENING).length,
    0
  );
});

test("proof verified and rejected, only for recent proofs", () => {
  const recent = new Date(EVENING.getTime() - 2 * 3600_000).toISOString();
  const old = new Date(EVENING.getTime() - 50 * 3600_000).toISOString();
  const proof = { ...SAMPLE.proofs[0], submittedAt: recent };
  assert.deepEqual(types(detectEvents(facts({ proofs: [proof] }), USER_ID, EVENING)), [
    "proof_verified",
  ]);
  const rejected = detectEvents(
    facts({ proofs: [{ ...proof, status: "rejected", rejectionReason: "Photo too dark" }] }),
    USER_ID,
    EVENING
  );
  assert.deepEqual(types(rejected), ["proof_rejected"]);
  assert.equal(rejected[0].facts.reason, "Photo too dark");
  assert.equal(
    detectEvents(facts({ proofs: [{ ...proof, status: "pending" }] }), USER_ID, EVENING).length,
    0
  );
  assert.equal(
    detectEvents(facts({ proofs: [{ ...proof, submittedAt: old }] }), USER_ID, EVENING).length,
    0
  );
});

test("reward earned for eligible or fulfilled claims only", () => {
  const r = SAMPLE.rewards[0];
  assert.equal(detectEvents(facts({ rewards: [r] }), USER_ID, EVENING).length, 1);
  assert.equal(
    detectEvents(facts({ rewards: [{ ...r, status: "eligible" }] }), USER_ID, EVENING).length,
    1
  );
  assert.equal(
    detectEvents(facts({ rewards: [{ ...r, status: "pending" }] }), USER_ID, EVENING).length,
    0
  );
});

test("inactivity: empty week with active challenges, once per 7-day bucket", () => {
  const f = facts({
    week: { activeDays: 0, approvedProofs: 0 },
    challenges: SAMPLE.challenges.map((c) => ({ ...c, currentStreak: 0 })),
  });
  const e = detectEvents(f, USER_ID, EVENING);
  assert.deepEqual(types(e), ["inactivity_detected"]);
  const nextHour = detectEvents(f, USER_ID, new Date(EVENING.getTime() + 3600_000));
  assert.equal(nextHour[0].dedupeKey, e[0].dedupeKey, "same state, same key");
});

test("a week that failed to load is never treated as inactivity", () => {
  const e = detectEvents(
    facts({ challenges: SAMPLE.challenges, unavailable: ["this week's activity"] }),
    USER_ID,
    EVENING
  );
  assert.ok(!e.some((x) => x.type === "inactivity_detected"));
});

test("no inactivity without active challenges", () => {
  assert.equal(
    detectEvents(
      facts({ week: { activeDays: 0, approvedProofs: 0 }, challenges: [] }),
      USER_ID,
      EVENING
    ).length,
    0
  );
});

test("invalid events are rejected", () => {
  const good = detectEvents(
    facts({ challenges: [{ ...SAMPLE.challenges[0], currentStreak: 7 }] }),
    USER_ID,
    EVENING
  )[0];
  assert.ok(isValidEvent(good));
  assert.ok(!isValidEvent(null));
  assert.ok(!isValidEvent({ ...good, type: "challenge_started" }));
  assert.ok(!isValidEvent({ ...good, userId: "" }));
  assert.ok(!isValidEvent({ ...good, dedupeKey: "other:1" }));
  assert.ok(!isValidEvent({ ...good, occurredAt: "not a date" }));
  assert.ok(!isValidEvent({ ...good, facts: { streak: 7 } }), "missing challengeTitle");
});

test("detection is deterministic", () => {
  const a = detectEvents({ ...SAMPLE, unavailable: [] }, USER_ID, EVENING);
  const b = detectEvents({ ...SAMPLE, unavailable: [] }, USER_ID, EVENING);
  assert.deepEqual(a, b);
});
