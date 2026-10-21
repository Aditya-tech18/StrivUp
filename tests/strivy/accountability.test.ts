import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CHECKINS,
  checkEventMessage,
  decideCheckIns,
  eventMessage,
} from "@/lib/strivy/accountability";
import type { StrivyEvent, StrivyEventType, EventFacts } from "@/lib/strivy/events";
import { USER_ID } from "./helpers";

function ev(
  type: StrivyEventType,
  facts: EventFacts,
  entity: "challenge" | "quest" | null = "challenge"
): StrivyEvent {
  return {
    type,
    userId: USER_ID,
    entityId: entity ? "id-1" : null,
    entityKind: entity,
    occurredAt: "2026-09-28T14:30:00Z",
    dedupeKey: `${type}:id-1:${JSON.stringify(facts).length}`,
    facts,
  };
}

const MILESTONE = ev("challenge_streak_milestone", {
  challengeTitle: "30 Days of Running",
  streak: 7,
});
const AT_RISK = ev("challenge_streak_at_risk", {
  challengeTitle: "30 Days of Running",
  streak: 11,
});
const DEADLINE = ev(
  "quest_deadline_approaching",
  { questTitle: "Café Trail", tasksLeft: 2, hoursLeft: 20 },
  "quest"
);
const VERIFIED = ev("proof_verified", {
  parentTitle: "30 Days of Running",
  label: "Day 11",
  kind: "challenge",
});
const REJECTED = ev(
  "proof_rejected",
  {
    parentTitle: "Café Trail",
    label: "Order a latte",
    kind: "quest",
    reason: "Receipt not visible",
  },
  "quest"
);
const REWARD = ev(
  "reward_earned",
  { rewardTitle: "Free smoothie", questTitle: "Park Run", status: "eligible" },
  "quest"
);
const INACTIVE = ev("inactivity_detected", {
  challengeTitle: "Read Daily",
  activeChallenges: 1,
  days: 7,
});

test("streak milestone message uses the real streak and title", () => {
  const m = eventMessage(MILESTONE)!;
  assert.match(m.text, /7/);
  assert.match(m.text, /30 Days of Running/);
  assert.deepEqual(m.links, [{ label: 'Open "30 Days of Running"', href: "/challenges/id-1" }]);
});

test("streak at risk message", () => {
  assert.match(eventMessage(AT_RISK)!.text, /11-day streak .* today's proof isn't in yet/);
});

test("quest deadline message", () => {
  const m = eventMessage(DEADLINE)!;
  assert.match(m.text, /Café Trail/);
  assert.match(m.text, /20 hours/);
  assert.match(m.text, /2 tasks/);
  assert.equal(m.links[0].href, "/quests/id-1");
});

test("proof verified, rejected and reward messages", () => {
  assert.match(eventMessage(VERIFIED)!.text, /Proof verified ✅ Day 11/);
  const r = eventMessage(REJECTED)!.text;
  assert.match(r, /Receipt not visible/);
  assert.match(r, /Happens to everyone/);
  assert.match(eventMessage(REWARD)!.text, /You earned Free smoothie from "Park Run" 🎉/);
});

test("inactivity message is encouraging, not shaming", () => {
  const t = eventMessage(INACTIVE)!.text;
  assert.match(t, /7 days/);
  assert.match(t, /Ready to get back on track\?/);
  assert.doesNotMatch(t, /lazy|shame|disappoint|fail/i);
});

test("every event's message passes its own grounding check", () => {
  for (const e of [MILESTONE, AT_RISK, DEADLINE, VERIFIED, REJECTED, REWARD, INACTIVE]) {
    assert.deepEqual(checkEventMessage(eventMessage(e)!.text, e), [], e.type);
  }
});

test("grounding rejects unsupported numbers, names, rewards, links and shaming", () => {
  assert.ok(
    checkEventMessage('45 days straight on "30 Days of Running"', MILESTONE).some((r) =>
      r.includes("45")
    )
  );
  assert.ok(
    checkEventMessage('7 days on "Morning Yoga"', MILESTONE).some((r) => r.includes("Morning Yoga"))
  );
  assert.ok(
    checkEventMessage('You earned "Free pizza" from "Park Run"', REWARD).some((r) =>
      r.includes("Free pizza")
    )
  );
  assert.ok(checkEventMessage("7 days! see https://x.io", MILESTONE).includes("link or email"));
  assert.ok(checkEventMessage("7 days, you lazy thing", MILESTONE).some((r) => r.includes("lazy")));
  assert.deepEqual(checkEventMessage("", MILESTONE), ["empty"]);
});

test("unsupported events produce no message", () => {
  const bogus = { ...MILESTONE, type: "challenge_started" as unknown as StrivyEventType };
  assert.equal(eventMessage(bogus), null);
  assert.deepEqual(decideCheckIns([bogus]), []);
});

test("only events the DB doesn't already announce become notifications", () => {
  const byType = new Map(
    decideCheckIns([MILESTONE])
      .concat(
        decideCheckIns([AT_RISK]),
        decideCheckIns([DEADLINE]),
        decideCheckIns([VERIFIED]),
        decideCheckIns([REJECTED]),
        decideCheckIns([REWARD]),
        decideCheckIns([INACTIVE])
      )
      .map((c) => [c.event.type, c.notification?.type ?? null])
  );
  assert.equal(byType.get("challenge_streak_milestone"), "strivy_streak_milestone");
  assert.equal(byType.get("challenge_streak_at_risk"), "strivy_streak_at_risk");
  assert.equal(byType.get("quest_deadline_approaching"), "strivy_quest_deadline");
  assert.equal(byType.get("inactivity_detected"), "strivy_inactivity");
  // Already sent by DB triggers: chat only.
  assert.equal(byType.get("proof_verified"), null);
  assert.equal(byType.get("proof_rejected"), null);
  assert.equal(byType.get("reward_earned"), null);
});

test("notification drafts link to the right entity", () => {
  const [d] = decideCheckIns([DEADLINE]);
  assert.equal(d.notification?.relatedQuestId, "id-1");
  assert.equal(d.notification?.relatedChallengeId, null);
  assert.equal(d.notification?.dedupeKey, DEADLINE.dedupeKey);
  assert.equal(d.notification?.message, d.reply.text);
});

test("check-ins are capped, ordered by urgency and deduped by key", () => {
  const all = [INACTIVE, REWARD, MILESTONE, VERIFIED, DEADLINE, AT_RISK, REJECTED, REJECTED];
  const out = decideCheckIns(all);
  assert.equal(out.length, MAX_CHECKINS);
  assert.deepEqual(
    out.map((c) => c.event.type),
    ["proof_rejected", "challenge_streak_at_risk", "quest_deadline_approaching"]
  );
});

test("check-in replies carry the chat intent for follow-ups", () => {
  assert.equal(decideCheckIns([AT_RISK])[0].reply.intent, "streak");
  assert.equal(decideCheckIns([DEADLINE])[0].reply.intent, "quests");
  assert.equal(decideCheckIns([VERIFIED])[0].reply.intent, "proof_status");
});
