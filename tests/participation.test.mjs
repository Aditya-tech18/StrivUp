import assert from "node:assert/strict";
import test from "node:test";
import { challengeDeadline, isPastDeadline, questPhase } from "../src/lib/participation.ts";
import { rankChallengeDays } from "../src/lib/data/challengeRankings.ts";

test("deadline gates use the exact boundary and preserve indefinite challenges", () => {
  const start = "2026-11-20T08:30:00Z";
  const end = challengeDeadline(start, 5);
  assert.equal(end, "2026-11-25T08:30:00.000Z");
  assert.equal(isPastDeadline(end, Date.parse(end) - 1), false);
  assert.equal(isPastDeadline(end, Date.parse(end)), true);
  assert.equal(challengeDeadline(start, null), null);
  assert.equal(isPastDeadline(null), false);
});

test("a live status cannot override an expired business or legacy quest deadline", () => {
  const now = Date.parse("2026-11-25T08:30:00Z");
  assert.equal(questPhase({ quest_status: "active", end_date: "2026-11-25T08:30:00Z" }, now), "closed");
  assert.equal(questPhase({ quest_status: "published", end_date: "2026-11-25T09:00:00Z" }, now), "live");
  assert.equal(questPhase({ status: "active", quest_status: "draft", ends_at: "2026-11-24T12:00:00Z" }, now), "closed");
  assert.equal(questPhase({ status: "active", quest_status: "draft" }, now), "live");
  assert.equal(questPhase({ status: "active", quest_status: "draft", business_id: "biz" }, now), "upcoming");
  assert.equal(questPhase({ quest_status: "active", start_date: "2026-11-26T00:00:00Z" }, now), "upcoming");
  assert.equal(questPhase({ quest_status: "expired" }, now), "closed");
});

test("challenge rankings retain approved days across gaps, count each day once, and share ties", () => {
  const members = [{ user_id: "a" }, { user_id: "b" }, { user_id: "c" }, { user_id: "d" }];
  const proof = (user_id, day_number) => ({ user_id, day_number });
  const first = [proof("a", 1), proof("a", 1), proof("a", 4), proof("b", 4), proof("c", 3), proof("departed", 3)];
  assert.deepEqual(rankChallengeDays(members, first, 5), [
    { userId: "a", daysCompleted: 2, rank: 1 },
    { userId: "b", daysCompleted: 1, rank: 2 },
    { userId: "c", daysCompleted: 1, rank: 2 },
  ]);
  assert.deepEqual(rankChallengeDays(members, [...first, proof("b", 2), proof("b", 5), proof("b", 6)], 5)[0],
    { userId: "b", daysCompleted: 3, rank: 1 });
});
