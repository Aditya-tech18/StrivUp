/**
 * Phase 4.1: STRIVY daily push engine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import webpush from "web-push";
import { istDay, safeClickUrl, windowAt, PUSH_TITLE } from "@/lib/strivy/push/config";
import {
  PUSH_PRIORITY,
  pushCandidates,
  selectPush,
  DEFAULT_PREFERENCES,
  type PushCandidate,
  type PushPreferences,
} from "@/lib/strivy/push/planner";
import { LIBRARY, fill, rankedMessages, type PushMessage } from "@/lib/strivy/push/messages";
import { validatePushMessage } from "@/lib/strivy/push/validate";
import {
  createMemoryPushStore,
  supabasePushStore,
  type PushSubscriptionRecord,
} from "@/lib/strivy/push/store";
import { createMemorySender, pushOptions, serializePayload } from "@/lib/strivy/push/sender";
import { runForUser, runPushWindow } from "@/lib/strivy/push/scheduler";
import { handleCron, handleDev, handleSubscribe, parseSubscription } from "@/lib/strivy/push/http";
import { urlBase64ToUint8Array } from "@/components/features/strivy/push";
import type { QuestFact, StrivyFacts } from "@/lib/strivy/types";
import { SAMPLE, USER_ID, fakeSupabase } from "./helpers";

/* ── Fixtures ─────────────────────────────────────────────────────────── */

const OTHER = "00000000-0000-0000-0000-00000000000b";

/** 2026-10-01 at an India-time hour. */
const at = (hour: number, minute = 0, day = 1) =>
  new Date(Date.UTC(2026, 9, day, hour, minute) - 5.5 * 3_600_000);

const VEER: QuestFact = {
  questId: "q9",
  title: "Veer Ji Chaap",
  businessName: "Veer Ji",
  locationName: null,
  verificationStatus: "pending",
  completed: false,
  endsAt: "2026-10-20T18:00:00Z",
  tasksTotal: 3,
  tasksApproved: 0,
  tasksPending: 0,
  tasksNeedAction: 3,
};

/** One quest, one challenge task still to do, a streak worth protecting. */
const BUSY: StrivyFacts = {
  firstName: null,
  unavailable: [],
  today: {
    tasks: [
      {
        challengeId: "c1",
        challengeTitle: "30 Days of Running",
        title: "Run 5km",
        dayLabel: "Day 12",
        state: "todo",
      },
    ],
    completed: 0,
    total: 1,
    bestStreak: 11,
  },
  challenges: [SAMPLE.challenges[0]],
  quests: [VEER],
  proofs: [],
  rewards: [],
  week: { activeDays: 4, approvedProofs: 4 },
};

const EMPTY: StrivyFacts = {
  firstName: null,
  unavailable: [],
  today: { tasks: [], completed: 0, total: 0, bestStreak: 0 },
  challenges: [],
  quests: [],
  proofs: [],
  rewards: [],
  week: { activeDays: 0, approvedProofs: 0 },
};

const sub = (userId: string, id: string): PushSubscriptionRecord => ({
  id,
  userId,
  endpoint: `https://push.example/${id}`,
  p256dh: "BPUBKEY",
  auth: "AUTH",
});

function setup(opts: {
  facts?: StrivyFacts;
  clock: { now: Date };
  subs?: PushSubscriptionRecord[];
  prefs?: Record<string, Partial<PushPreferences>>;
}) {
  const mem = createMemoryPushStore({
    subscriptions: opts.subs ?? [sub(USER_ID, "s1")],
    preferences: opts.prefs,
    now: () => opts.clock.now,
  });
  const { sender, sent } = createMemorySender();
  const loaded: string[] = [];
  const run = (extra: Partial<Parameters<typeof runPushWindow>[0]> = {}) =>
    runPushWindow({
      now: opts.clock.now,
      store: mem.store,
      sender,
      loadFacts: async (uid) => {
        loaded.push(uid);
        return opts.facts ?? BUSY;
      },
      ...extra,
    });
  return { ...mem, sender, sent, loaded, run };
}

/* ── Windows and click URLs ───────────────────────────────────────────── */

test("windows are 09–11, 14–17 and 19–22 India time", () => {
  assert.equal(windowAt(at(9)), "morning");
  assert.equal(windowAt(at(10, 59)), "morning");
  assert.equal(windowAt(at(11)), null);
  assert.equal(windowAt(at(14)), "afternoon");
  assert.equal(windowAt(at(19, 30)), "evening");
  assert.equal(windowAt(at(22)), null);
  assert.equal(windowAt(at(3)), null);
  assert.equal(istDay(at(23, 30)), "2026-10-01");
});

test("notification click URLs stay on STRIVUP", () => {
  assert.equal(safeClickUrl("/quests/q9"), "/quests/q9");
  for (const bad of [
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "/\\evil",
    null,
    undefined,
    42,
  ]) {
    assert.equal(safeClickUrl(bad as string), "/feed", String(bad));
  }
  assert.deepEqual(
    JSON.parse(serializePayload({ title: "t", body: "b", url: "https://evil.example", tag: "k" })),
    {
      title: "t",
      body: "b",
      url: "/feed",
      tag: "k",
    }
  );
});

/* ── Daily limit: 0, 1, 2, 3, and a 4th blocked ───────────────────────── */

test("0 → 1 → 2 → 3 pushes across the day, and the 4th is blocked", async () => {
  const clock = { now: at(9, 30) };
  const s = setup({ clock });
  assert.equal(s.sent.length, 0);

  const [m] = await s.run();
  assert.equal(m.outcome, "sent");
  assert.equal(s.sent.length, 1);

  clock.now = at(14, 30);
  const [a] = await s.run({ now: clock.now });
  assert.equal(a.outcome, "sent", a.reason ?? "");
  assert.equal(s.sent.length, 2);

  clock.now = at(19, 30);
  const [e] = await s.run({ now: clock.now });
  assert.equal(e.outcome, "sent", e.reason ?? "");
  assert.equal(s.sent.length, 3);

  // A 4th, even with a fresh event and a window override, is refused.
  clock.now = at(21, 45);
  const [fourth] = await s.run({ now: clock.now, forceWindow: "afternoon" });
  assert.equal(fourth.outcome, "skipped");
  assert.equal(fourth.reason, "daily limit");
  assert.equal(s.sent.length, 3);

  // All three said different things.
  assert.equal(new Set(s.sent.map((x) => x.payload.body)).size, 3);
  assert.ok(s.sent.every((x) => x.payload.title === PUSH_TITLE));
});

test("the cap is also enforced by claim() itself (atomic gate)", async () => {
  const clock = { now: at(9) };
  const { store } = createMemoryPushStore({ now: () => clock.now });
  const base = {
    userId: USER_ID,
    pushType: "t",
    entityId: null,
    localDate: "2026-10-01",
    tone: "info",
    title: "T",
    url: "/feed",
    maxPerDay: 3,
    minSpacingMinutes: 30,
  };
  const windows = ["morning", "afternoon", "evening"] as const;
  for (let i = 0; i < 3; i++) {
    clock.now = at(9 + i * 5);
    assert.deepEqual(
      (await store.claim({ ...base, window: windows[i], dedupeKey: `k${i}`, body: `b${i}` })).ok,
      true
    );
  }
  clock.now = at(23);
  assert.deepEqual(await store.claim({ ...base, window: "evening", dedupeKey: "k9", body: "b9" }), {
    ok: false,
    reason: "daily limit",
  });
});

test("a preference below 3 lowers the cap; nothing raises it above 3", async () => {
  const clock = { now: at(9, 30) };
  const s = setup({ clock, prefs: { [USER_ID]: { maxPerDay: 1 } } });
  assert.equal((await s.run())[0].outcome, "sent");
  clock.now = at(15);
  assert.equal((await s.run({ now: clock.now }))[0].reason, "daily limit");

  const plan = selectPush({
    candidates: pushCandidates(BUSY, USER_ID, at(9, 30)),
    window: "evening",
    today: ["morning", "afternoon", "evening"].map((w, i) => ({
      dedupeKey: `x${i}`,
      window: w as "morning",
      tone: "info",
      body: `b${i}`,
      status: "sent" as const,
      createdAt: at(1).toISOString(),
    })),
    sentKeys: new Set(),
    prefs: { ...DEFAULT_PREFERENCES, maxPerDay: 10 },
    now: at(21),
  });
  assert.equal(plan.reason, "daily limit");
});

/* ── Spacing ──────────────────────────────────────────────────────────── */

test("minimum spacing is configurable and enforced", async () => {
  const clock = { now: at(10, 30) };
  const s = setup({ clock, prefs: { [USER_ID]: { minSpacingMinutes: 300 } } });
  assert.equal((await s.run())[0].outcome, "sent");
  clock.now = at(14, 30); // 4h later: under 5h
  assert.equal((await s.run({ now: clock.now }))[0].reason, "too soon");
  clock.now = at(16, 0); // 5.5h later
  assert.equal((await s.run({ now: clock.now }))[0].outcome, "sent");
});

test("spacing can't be configured below the 30-minute floor", () => {
  const today = [
    {
      dedupeKey: "a",
      window: "morning" as const,
      tone: "info",
      body: "x",
      status: "sent" as const,
      createdAt: at(10, 50).toISOString(),
    },
  ];
  const r = selectPush({
    candidates: pushCandidates(BUSY, USER_ID, at(11)),
    window: "afternoon",
    today,
    sentKeys: new Set(),
    prefs: { ...DEFAULT_PREFERENCES, minSpacingMinutes: 1 },
    now: at(11, 5),
  });
  assert.equal(r.reason, "too soon");
});

/* ── Dedupe ───────────────────────────────────────────────────────────── */

test("refreshes and repeated runs in the same window send nothing more", async () => {
  const clock = { now: at(9, 15) };
  const s = setup({ clock });
  await s.run();
  for (const m of [20, 30, 45]) {
    clock.now = at(9, m);
    assert.equal((await s.run({ now: clock.now }))[0].reason, "window already used");
  }
  assert.equal(s.sent.length, 1);
});

test("two scheduler workers at once send one push, not two", async () => {
  const clock = { now: at(9, 15) };
  const s = setup({ clock });
  const results = await Promise.all([s.run(), s.run(), s.run()]);
  assert.equal(results.flat().filter((r) => r.outcome === "sent").length, 1);
  assert.equal(s.sent.length, 1);
  assert.equal(s.log.length, 1);
});

test("a one-off event (reward) is pushed once, never again on later days", async () => {
  const facts: StrivyFacts = {
    ...EMPTY,
    rewards: [
      { questId: "q9", questTitle: "Veer Ji Chaap", rewardTitle: "Cash Prize", status: "eligible" },
    ],
  };
  const clock = { now: at(9, 30) };
  const s = setup({ clock, facts });
  const [first] = await s.run();
  assert.equal(first.type, "reward_earned");
  clock.now = at(9, 30, 2);
  const [next] = await s.run({ now: clock.now });
  assert.equal(next.reason, "nothing useful to say");
  assert.equal(s.sent.length, 1);
});

test("the same words are never sent twice in a day", async () => {
  const clock = { now: at(9) };
  const { store } = createMemoryPushStore({ now: () => clock.now });
  const base = {
    userId: USER_ID,
    pushType: "t",
    entityId: null,
    localDate: "2026-10-01",
    tone: "info",
    title: "T",
    url: "/feed",
    maxPerDay: 3,
    minSpacingMinutes: 30,
    body: "Same words",
  };
  assert.equal((await store.claim({ ...base, window: "morning", dedupeKey: "a" })).ok, true);
  clock.now = at(15);
  assert.deepEqual(await store.claim({ ...base, window: "afternoon", dedupeKey: "b" }), {
    ok: false,
    reason: "same message today",
  });
});

test("dedupe keys follow userId + event + entity + date for daily events", () => {
  const keys = pushCandidates(BUSY, USER_ID, at(15)).map((c) => c.dedupeKey);
  assert.ok(keys.includes("pending_task:c1:2026-10-01"));
  assert.ok(keys.includes("quest_progress:q9:2026-10-01"));
  assert.ok(keys.includes("morning_checkin:2026-10-01"));
});

/* ── Prioritisation ───────────────────────────────────────────────────── */

test("the most important event wins", () => {
  const facts: StrivyFacts = {
    ...BUSY,
    proofs: [
      {
        kind: "challenge",
        parentId: "c1",
        parentTitle: "30 Days of Running",
        label: "Day 11",
        status: "rejected",
        rejectionReason: null,
        submittedAt: at(8).toISOString(),
      },
    ],
  };
  const pick = (window: "morning" | "afternoon" | "evening", now: Date) =>
    selectPush({
      candidates: pushCandidates(facts, USER_ID, now),
      window,
      today: [],
      sentKeys: new Set(),
      prefs: DEFAULT_PREFERENCES,
      now,
    }).candidate?.type;
  assert.equal(pick("morning", at(9, 30)), "proof_rejected");
  assert.equal(pick("evening", at(20)), "proof_rejected");
  // Without the rejection: evening is about the streak at risk, afternoon the task.
  const calm = (window: "morning" | "afternoon" | "evening", now: Date) =>
    selectPush({
      candidates: pushCandidates(BUSY, USER_ID, now),
      window,
      today: [],
      sentKeys: new Set(),
      prefs: DEFAULT_PREFERENCES,
      now,
    }).candidate?.type;
  assert.equal(calm("evening", at(20)), "streak_at_risk");
  assert.equal(calm("afternoon", at(15)), "pending_task");
  assert.equal(calm("morning", at(9, 30)), "morning_checkin");
  assert.equal(PUSH_PRIORITY[0], "proof_rejected");
});

test("candidates respect their windows (no streak-at-risk in the morning)", () => {
  const candidates = pushCandidates(BUSY, USER_ID, at(9, 30));
  assert.ok(!candidates.some((c) => c.type === "streak_at_risk"));
});

/* ── Preferences, no data, outside windows ────────────────────────────── */

test("disabled notifications send nothing and don't load any data", async () => {
  const s = setup({ clock: { now: at(9, 30) }, prefs: { [USER_ID]: { enabled: false } } });
  const [r] = await s.run();
  assert.equal(r.reason, "notifications disabled");
  assert.equal(s.sent.length, 0);
  assert.deepEqual(s.loaded, []);
});

test("no data means no push, not a made-up one", async () => {
  for (const hour of [9, 15, 20]) {
    const s = setup({ clock: { now: at(hour, 30) }, facts: EMPTY });
    const [r] = await s.run();
    assert.equal(r.outcome, "skipped");
    assert.equal(r.reason, "nothing useful to say");
  }
  // Data that failed to load is not "nothing": still no push.
  const failed: StrivyFacts = { firstName: null, unavailable: ["today's tasks", "your quests"] };
  assert.deepEqual(pushCandidates(failed, USER_ID, at(15)), []);
});

test("outside the windows, nothing is sent", async () => {
  const s = setup({ clock: { now: at(3) } });
  assert.equal((await s.run())[0].reason, "outside the push windows");
});

test("no subscription: skipped before any facts load", async () => {
  const s = setup({ clock: { now: at(9, 30) }, subs: [] });
  assert.deepEqual(await s.run({ userIds: [USER_ID] }), [
    { userId: USER_ID, outcome: "skipped", reason: "no push subscription" },
  ]);
  assert.deepEqual(s.loaded, []);
});

/* ── Personalisation from real facts ──────────────────────────────────── */

function bodyFor(facts: StrivyFacts, type: string, now: Date): string {
  const c = pushCandidates(facts, USER_ID, now).find((x) => x.type === type);
  assert.ok(c, `no ${type} candidate`);
  const [m] = rankedMessages(c, {
    seed: "x",
    title: PUSH_TITLE,
    avoidBodies: new Set(),
    usedTones: [],
  });
  assert.deepEqual(validatePushMessage(m, c), []);
  return m.body;
}

test("quest pushes name the real quest and progress", () => {
  const body = bodyFor({ ...EMPTY, quests: [VEER] }, "quest_progress", at(15));
  assert.match(body, /'Veer Ji Chaap'/);
  assert.match(body, /0\/3/);
});

test("streak pushes use the real streak and challenge", () => {
  const body = bodyFor(BUSY, "streak_at_risk", at(20));
  assert.match(body, /11-day/);
  assert.match(body, /'30 Days of Running'/);
});

test("proof pushes name the real proof", () => {
  const facts: StrivyFacts = {
    ...EMPTY,
    proofs: [
      {
        kind: "quest",
        parentId: "q9",
        parentTitle: "Veer Ji Chaap",
        label: "Selfie at the stall",
        status: "approved",
        rejectionReason: null,
        submittedAt: at(8).toISOString(),
      },
    ],
  };
  const body = bodyFor(facts, "proof_verified", at(9, 30));
  assert.match(body, /'Selfie at the stall'/);
  assert.match(body, /'Veer Ji Chaap'/);
});

test("reward pushes name the real reward, and only when the DB says it's earned", () => {
  const earned: StrivyFacts = {
    ...EMPTY,
    rewards: [
      { questId: "q9", questTitle: "Veer Ji Chaap", rewardTitle: "Cash Prize", status: "eligible" },
    ],
  };
  assert.match(bodyFor(earned, "reward_earned", at(9, 30)), /Cash Prize/);
  const pending: StrivyFacts = {
    ...EMPTY,
    rewards: [
      { questId: "q9", questTitle: "Veer Ji Chaap", rewardTitle: "Cash Prize", status: "pending" },
    ],
  };
  assert.ok(!pushCandidates(pending, USER_ID, at(9, 30)).some((c) => c.type === "reward_earned"));
});

/* ── Message library and validation ───────────────────────────────────── */

const SAMPLE_VARS: Record<string, string | number> = {
  count: "3 tasks",
  task: "'Run 5km'",
  streak: "11-day",
  days: "11 days",
  challenge: "'30 Days of Running'",
  quest: "'Veer Ji Chaap'",
  hours: "5 hours",
  tasks: "2 tasks",
  approved: 1,
  total: 3,
  reward: "Cash Prize",
  label: "Day 11",
  parent: "'30 Days of Running'",
  status: "eligible",
};

test("every library line passes validation with real values", () => {
  for (const [type, variants] of Object.entries(LIBRARY)) {
    for (const v of variants) {
      const c: PushCandidate = {
        type: type as PushCandidate["type"],
        dedupeKey: "k",
        entityId: null,
        url: "/feed",
        vars: SAMPLE_VARS,
      };
      const m: PushMessage = { title: PUSH_TITLE, body: fill(v.text, SAMPLE_VARS), tone: v.tone };
      assert.deepEqual(validatePushMessage(m, c), [], `${type}: ${m.body}`);
      assert.ok(m.body.length <= 160);
    }
  }
});

test("the library mixes tones and keeps suggestive lines a minority", () => {
  const all = Object.values(LIBRARY).flat();
  const tones = new Set(all.map((v) => v.tone));
  for (const t of ["info", "motivational", "cheeky", "funny", "milestone", "suggestive"])
    assert.ok(tones.has(t as never), t);
  assert.ok(all.filter((v) => v.tone === "suggestive").length * 4 < all.length);
  assert.ok(!LIBRARY.proof_rejected.some((v) => v.tone === "suggestive" || v.text.includes("😏")));
});

test("at most one suggestive line per day, and tones vary", () => {
  const c = pushCandidates(BUSY, USER_ID, at(15)).find((x) => x.type === "pending_task")!;
  const ranked = rankedMessages(c, {
    seed: "s",
    title: PUSH_TITLE,
    avoidBodies: new Set(),
    usedTones: ["suggestive", "cheeky"],
  });
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every((m) => m.tone !== "suggestive"));
  assert.notEqual(ranked[0].tone, "cheeky");
});

test("validation rejects invented facts, explicit content, guilt trips and fake AI", () => {
  const c = pushCandidates({ ...EMPTY, quests: [VEER] }, USER_ID, at(15)).find(
    (x) => x.type === "quest_progress"
  )!;
  const check = (body: string) =>
    validatePushMessage({ title: PUSH_TITLE, body, tone: "cheeky" }, c);
  assert.deepEqual(check("Your 'Veer Ji Chaap' quest is still waiting 👀 0/3 done."), []);
  assert.ok(
    check("Your 'Momo Madness' quest is waiting 👀").some((r) => r.includes("unknown name"))
  );
  assert.ok(check("You're on a 45-day streak 🔥").some((r) => r.includes("numbers")));
  assert.ok(check("Send nudes and your proof 😏").includes("unsafe content"));
  assert.ok(check("Last chance, you will regret it.").includes("manipulative"));
  assert.ok(check("I analyzed your data with AI 👀").includes("fake AI claim"));
  assert.ok(check("You lazy bum 👀").some((r) => r.includes("banned")));
  assert.ok(check("Open https://evil.example now").includes("link or email"));
});

test("a broken generator falls back to the validated library", async () => {
  const clock = { now: at(15) };
  const s = setup({ clock });
  const [r] = await s.run({
    generator: {
      name: "bad",
      generate: async () => ({
        title: PUSH_TITLE,
        body: "You're on a 99-day streak on 'Fake Quest' 😏",
        tone: "cheeky",
      }),
    },
  });
  assert.equal(r.outcome, "sent");
  assert.doesNotMatch(r.body ?? "", /99|Fake Quest/);
  const [thrown] = await setup({ clock }).run({
    generator: {
      name: "throws",
      generate: async () => {
        throw new Error("down");
      },
    },
  });
  assert.equal(thrown.outcome, "sent");
});

/* ── Subscriptions: expired, isolation ─────────────────────────────────── */

test("an expired subscription (410) is removed; the others still get the push", async () => {
  const mem = createMemoryPushStore({
    subscriptions: [sub(USER_ID, "dead"), sub(USER_ID, "live")],
    now: () => at(15),
  });
  const { sender, sent } = createMemorySender((s) =>
    s.id === "dead" ? { ok: false, gone: true, error: "push service 410" } : { ok: true }
  );
  const r = await runForUser(USER_ID, {
    now: at(15),
    store: mem.store,
    sender,
    loadFacts: async () => BUSY,
  });
  assert.equal(r.outcome, "sent");
  assert.equal(r.removedSubscriptions, 1);
  assert.deepEqual(
    mem.subs.map((x) => x.id),
    ["live"]
  );
  assert.equal(sent.length, 1);
});

test("when every device fails, the push is marked failed and doesn't count", async () => {
  const mem = createMemoryPushStore({ subscriptions: [sub(USER_ID, "x")], now: () => at(15) });
  const { sender } = createMemorySender(() => ({
    ok: false,
    gone: false,
    error: "push service 500",
  }));
  const r = await runForUser(USER_ID, {
    now: at(15),
    store: mem.store,
    sender,
    loadFacts: async () => BUSY,
  });
  assert.equal(r.outcome, "failed");
  assert.equal(mem.log[0].status, "failed");
});

test("user isolation: each user gets their own facts, on their own devices only", async () => {
  const clock = { now: at(15) };
  const mem = createMemoryPushStore({
    subscriptions: [sub(USER_ID, "a1"), sub(OTHER, "b1")],
    now: () => clock.now,
  });
  const { sender, sent } = createMemorySender();
  const loads: string[] = [];
  const quest = (title: string): StrivyFacts => ({ ...EMPTY, quests: [{ ...VEER, title }] });
  await runPushWindow({
    now: clock.now,
    store: mem.store,
    sender,
    loadFacts: async (uid) => {
      loads.push(uid);
      return uid === USER_ID ? quest("Veer Ji Chaap") : quest("Other Person's Quest");
    },
  });
  assert.deepEqual(loads.sort(), [USER_ID, OTHER].sort());
  const forA = sent.filter((x) => x.sub.userId === USER_ID);
  const forB = sent.filter((x) => x.sub.userId === OTHER);
  assert.equal(forA.length, 1);
  assert.equal(forB.length, 1);
  assert.match(forA[0].payload.body, /Veer Ji Chaap/);
  assert.doesNotMatch(forA[0].payload.body, /Other Person/);
  assert.doesNotMatch(forB[0].payload.body, /Veer Ji Chaap/);
  // A's cap doesn't touch B's.
  assert.equal((await mem.store.historyForDay(OTHER, "2026-10-01")).length, 1);
});

test("the Supabase store filters every query by the user being processed", async () => {
  const fake = fakeSupabase({
    tables: {
      strivy_push_subscriptions: { data: [] },
      strivy_push_log: { data: [] },
      strivy_notification_preferences: { data: [] },
    },
  });
  const store = supabasePushStore(fake.client);
  await store.getPreferences(USER_ID);
  await store.listSubscriptions(USER_ID);
  await store.historyForDay(USER_ID, "2026-10-01");
  await store.sentKeys(USER_ID, ["k"]);
  await store.deleteSubscription(USER_ID, "s1");
  const scoped = fake.queries.filter((q) => q.filters.length > 0);
  assert.ok(scoped.length >= 4);
  for (const q of scoped) {
    assert.ok(
      q.filters.some(([op, col, val]) => op === "eq" && col === "user_id" && val === USER_ID),
      `${q.table} not scoped`
    );
  }
});

test("preferences that can't be read mean no push, not 'enabled'", async () => {
  const fake = fakeSupabase({
    tables: { strivy_notification_preferences: { error: { message: "boom" } } },
  });
  assert.equal((await supabasePushStore(fake.client).getPreferences(USER_ID)).enabled, false);
});

/* ── HTTP: subscribe, cron, dev ───────────────────────────────────────── */

const VALID_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: {
    p256dh:
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
};

test("subscriptions are validated", () => {
  assert.ok(parseSubscription(VALID_SUB));
  assert.equal(parseSubscription({ ...VALID_SUB, endpoint: "http://insecure.example/x" }), null);
  assert.equal(parseSubscription({ ...VALID_SUB, endpoint: "not a url" }), null);
  assert.equal(parseSubscription({ ...VALID_SUB, keys: { p256dh: "<script>", auth: "x" } }), null);
  assert.equal(parseSubscription({ endpoint: VALID_SUB.endpoint }), null);
  assert.equal(parseSubscription("nope"), null);
});

test("subscribe saves for the session's user, never one from the body", async () => {
  const fake = fakeSupabase({
    user: { id: USER_ID },
    tables: { profiles: { data: [{ is_deactivated: false }] } },
  });
  const res = await handleSubscribe(
    new Request("http://x/api/strivy/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ ...VALID_SUB, userId: OTHER, user_id: OTHER }),
    }),
    { isEnabled: () => true, getSupabase: async () => fake.client }
  );
  assert.equal(res.status, 200);
  assert.equal(fake.rpcArgs[0].name, "strivy_save_push_subscription");
  assert.ok(!JSON.stringify(fake.rpcArgs[0].args).includes(OTHER));
});

test("subscribe needs sign-in and the feature flag", async () => {
  const anon = fakeSupabase({ user: null });
  const req = () => new Request("http://x", { method: "POST", body: JSON.stringify(VALID_SUB) });
  assert.equal(
    (await handleSubscribe(req(), { isEnabled: () => true, getSupabase: async () => anon.client }))
      .status,
    401
  );
  assert.equal(
    (await handleSubscribe(req(), { isEnabled: () => false, getSupabase: async () => anon.client }))
      .status,
    404
  );
});

test("subscribe says so plainly when the migration isn't applied", async () => {
  const fake = fakeSupabase({
    user: { id: USER_ID },
    rpc: () => ({ data: null, error: { message: "missing", code: "PGRST202" } }),
  });
  const res = await handleSubscribe(
    new Request("http://x", { method: "POST", body: JSON.stringify(VALID_SUB) }),
    { isEnabled: () => true, getSupabase: async () => fake.client }
  );
  assert.equal(res.status, 503);
});

test("the cron route needs the secret and never returns user data", async () => {
  const secret = "s3cret-s3cret-s3cret";
  const mem = createMemoryPushStore({ subscriptions: [sub(USER_ID, "s1")], now: () => at(15) });
  const { sender } = createMemorySender();
  const fake = fakeSupabase({ tables: {} });
  const deps = {
    isEnabled: () => true,
    cronSecret: () => secret,
    getAdmin: () => fake.client,
    getSender: () => sender,
    now: () => at(15),
    getStore: () => mem.store,
  };
  const call = (auth?: string) =>
    handleCron(new Request("http://x", { headers: auth ? { authorization: auth } : {} }), deps);
  assert.equal((await call()).status, 401);
  assert.equal((await call("Bearer wrong")).status, 401);
  assert.equal(
    (await handleCron(new Request("http://x"), { ...deps, isEnabled: () => false })).status,
    404
  );
  const res = await call(`Bearer ${secret}`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!text.includes(USER_ID));
  assert.ok(!text.includes("Veer"));
  // A short secret is never accepted: the server says it isn't configured.
  const short = await handleCron(
    new Request("http://x", { headers: { authorization: "Bearer short" } }),
    { ...deps, cronSecret: () => "short" }
  );
  assert.equal(short.status, 503);
  assert.equal(((await short.json()) as { category: string }).category, "missing_cron_secret");
});

test("dev tools are off unless enabled, and only touch the caller", async () => {
  const fake = fakeSupabase({ user: { id: USER_ID } });
  const mem = createMemoryPushStore({
    subscriptions: [sub(USER_ID, "mine"), sub(OTHER, "theirs")],
    now: () => at(15),
  });
  const { sender, sent } = createMemorySender();
  const deps = {
    isEnabled: () => true,
    devToolsEnabled: () => false,
    getSupabase: async () => fake.client,
    getAdmin: () => fake.client,
    getSender: () => sender,
    getStore: () => mem.store,
  };
  const req = (body: unknown) =>
    new Request("http://x", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await handleDev(req({ action: "test" }), deps)).status, 404);
  const on = { ...deps, devToolsEnabled: () => true };
  const res = await handleDev(req({ action: "test", userId: OTHER }), on);
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].sub.id, "mine");
  assert.match(sent[0].payload.body, /test STRIVY notification \(development only\)/);
  assert.equal(mem.log.length, 0, "test pushes don't count toward the daily limit");
});

test("dev tools are never available in a production build", async () => {
  const { arePushDevToolsEnabled } = await import("@/lib/strivy/push/config");
  const env = process.env as Record<string, string | undefined>;
  const before = { ...env };
  try {
    env.STRIVY_PUSH_DEV_TOOLS = "true";
    env.NODE_ENV = "production";
    assert.equal(arePushDevToolsEnabled(), false);
    env.NODE_ENV = "development";
    assert.equal(arePushDevToolsEnabled(), true);
  } finally {
    env.NODE_ENV = before.NODE_ENV;
    env.STRIVY_PUSH_DEV_TOOLS = before.STRIVY_PUSH_DEV_TOOLS;
  }
});

/* ── Real Web Push encryption, end to end (no network) ───────────────── */

test("a real Web Push request decrypts to exactly our payload", async () => {
  // http_ece ships with web-push and has no types. Import by path so tsc
  // doesn't need a declaration file.
  const ecePath: string = "http_ece";
  const ece = ((await import(ecePath)) as { default: unknown }).default as {
    decrypt(
      buf: Buffer,
      params: { version: string; privateKey: ReturnType<typeof createECDH>; authSecret: Buffer }
    ): Buffer;
  };
  const receiver = createECDH("prime256v1");
  receiver.generateKeys();
  const authSecret = randomBytes(16);
  const vapid = webpush.generateVAPIDKeys();
  const payload = serializePayload({
    title: PUSH_TITLE,
    body: "Your 'Veer Ji Chaap' quest is still waiting 👀",
    url: "/quests/q9",
    tag: "quest_progress:q9:2026-10-01",
  });

  const details = webpush.generateRequestDetails(
    {
      endpoint: "https://push.example/abc",
      keys: {
        p256dh: receiver.getPublicKey().toString("base64url"),
        auth: authSecret.toString("base64url"),
      },
    },
    payload,
    pushOptions({ ...vapid, subject: "mailto:dev@strivup.example" })
  );
  assert.equal(details.headers["Content-Encoding"], "aes128gcm");
  assert.match(String(details.headers.Authorization), /^vapid t=.+, k=/);
  assert.equal(details.headers.TTL, 14400);
  const plain = ece.decrypt(details.body as Buffer, {
    version: "aes128gcm",
    privateKey: receiver,
    authSecret,
  });
  assert.deepEqual(JSON.parse(plain.toString("utf8")), JSON.parse(payload));
});

test("VAPID keys convert to the bytes PushManager expects", () => {
  const { publicKey } = webpush.generateVAPIDKeys();
  const bytes = urlBase64ToUint8Array(publicKey);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4);
});

/* ── Service worker ───────────────────────────────────────────────────── */

function loadServiceWorker() {
  const listeners: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: { body: string; data: { url: string }; tag: string } }[] =
    [];
  const opened: string[] = [];
  const self = {
    location: { origin: "https://strivup.example" },
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    skipWaiting: () => undefined,
    registration: {
      showNotification: async (title: string, options: never) =>
        void shown.push({ title, options }),
    },
    clients: {
      claim: async () => undefined,
      matchAll: async () => [],
      openWindow: async (url: string) => void opened.push(url),
    },
  };
  vm.runInNewContext(readFileSync("public/strivy-sw.js", "utf8"), { self, URL });
  const fire = async (type: string, event: Record<string, unknown>) => {
    let waited: Promise<unknown> = Promise.resolve();
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
  };
  return { fire, shown, opened };
}

test("the service worker shows the push and opens its page on click", async () => {
  const sw = loadServiceWorker();
  await sw.fire("push", {
    data: {
      json: () => ({ title: "STRIVY 👀", body: "Quest waiting", url: "/quests/q9", tag: "k" }),
    },
  });
  assert.equal(sw.shown.length, 1);
  assert.equal(sw.shown[0].title, "STRIVY 👀");
  assert.equal(sw.shown[0].options.body, "Quest waiting");
  await sw.fire("notificationclick", {
    notification: { close: () => undefined, data: sw.shown[0].options.data },
  });
  assert.deepEqual(sw.opened, ["https://strivup.example/quests/q9"]);
});

test("the service worker never opens another site and ignores empty pushes", async () => {
  const sw = loadServiceWorker();
  await sw.fire("push", {
    data: { json: () => ({ body: "x", url: "https://evil.example/phish" }) },
  });
  await sw.fire("notificationclick", {
    notification: { close: () => undefined, data: sw.shown[0].options.data },
  });
  assert.deepEqual(sw.opened, ["https://strivup.example/feed"]);
  await sw.fire("push", { data: { json: () => ({ title: "t" }) } });
  await sw.fire("push", {
    data: {
      json: () => {
        throw new Error("bad json");
      },
    },
  });
  assert.equal(sw.shown.length, 1);
});
