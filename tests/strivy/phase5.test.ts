/**
 * Phase 5: follow-ups ("kitna hua?", "kitne task bache?", "kab se?"),
 * the rewrite quality checks, error resilience (rate limit, 500 fallbacks,
 * safe rendering), push rotation and the side-effect-free dev preview.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { classifyIntent } from "@/lib/strivy/intents";
import { detectLanguage } from "@/lib/strivy/language";
import { draftReply } from "@/lib/strivy/replies";
import { checkGrounding } from "@/lib/strivy/grounding";
import { toModelContext } from "@/lib/strivy/context";
import { createRateLimiter } from "@/lib/strivy/ratelimit";
import { handleStrivyChatRequest, handleStrivyCheckinRequest } from "@/lib/strivy/pipeline";
import { deterministicProvider } from "@/lib/strivy/model";
import {
  ERROR_TEXT,
  normalizeReply,
  responseToMessage,
  safeHref,
} from "@/components/features/strivy/chat";
import { handleDev, withFallback } from "@/lib/strivy/push/http";
import { rankedMessages } from "@/lib/strivy/push/messages";
import { pushCandidates } from "@/lib/strivy/push/planner";
import { createMemoryPushStore, type PushSubscriptionRecord } from "@/lib/strivy/push/store";
import { createMemorySender } from "@/lib/strivy/push/sender";
import { planForUser, runForUser } from "@/lib/strivy/push/scheduler";
import { PUSH_TITLE } from "@/lib/strivy/push/config";
import type { ChatTurn, QuestFact, StrivyContext, StrivyFacts } from "@/lib/strivy/types";
import { SAMPLE, USER_ID, ctx, fakeSupabase } from "./helpers";

/* ── Fixtures ─────────────────────────────────────────────────────────── */

const OTHER = "00000000-0000-0000-0000-00000000000b";

const VEER: QuestFact = {
  questId: "q9",
  title: "Veer Ji Chaap",
  businessName: "Veer Ji",
  locationName: null,
  verificationStatus: "pending",
  completed: false,
  endsAt: new Date(Date.now() + 6 * 86_400_000).toISOString(),
  tasksTotal: 3,
  tasksApproved: 0,
  tasksPending: 0,
  tasksNeedAction: 3,
};

const QUEST_ONLY: Partial<StrivyFacts> = {
  firstName: "Aditya",
  today: { tasks: [], completed: 0, total: 0, bestStreak: 0 },
  challenges: [],
  quests: [VEER],
  proofs: [],
  rewards: [],
  week: { activeDays: 0, approvedProofs: 0 },
};

const NOTHING: Partial<StrivyFacts> = { ...QUEST_ONLY, quests: [] };

function draft(message: string, facts: Partial<StrivyFacts>, history: ChatTurn[] = []) {
  const intent = classifyIntent(message, history);
  const context: StrivyContext = {
    ...ctx(intent.intent, facts),
    intent,
    lang: detectLanguage(message, history),
  };
  return { intent, reply: draftReply(context, message), context };
}

const after = (intent: ChatTurn["intent"], text = "…"): ChatTurn[] => [
  { role: "user", text: "?" },
  { role: "strivy", text, intent },
];

/* ── 1. Follow-ups ────────────────────────────────────────────────────── */

test("'kitne task bache?' lists what is left today, challenge first, then the quest", () => {
  for (const m of [
    "kitne task bache?",
    "How many tasks are left?",
    "kya bacha hai?",
    "what's left?",
  ]) {
    const { intent, reply } = draft(m, SAMPLE);
    assert.equal(intent.intent, "today", m);
    assert.equal(intent.detail, "remaining", m);
    assert.match(reply.text, /Run 5km/, m);
    assert.match(reply.text, /Café Trail/, m);
    assert.ok(reply.links.length <= 2);
  }
});

test("'kitne task bache?' on a challenge never mentions the quest", () => {
  const { intent, reply } = draft("challenge ke kitne task bache?", SAMPLE);
  assert.equal(intent.detail, "remaining");
  assert.match(reply.text, /Run 5km/);
  assert.doesNotMatch(reply.text, /Café Trail/);
});

test("'kitne task bache?' on a quest stays on the quest", () => {
  const { intent, reply } = draft("quest ke kitne task bache hain?", SAMPLE);
  assert.equal(intent.intent, "quests");
  assert.match(reply.text, /Café Trail/);
  assert.doesNotMatch(reply.text, /Run 5km|30 Days of Running/);
});

test("remaining: only a quest, nothing at all, and data that failed to load", () => {
  const quest = draft("kitne task bache?", QUEST_ONLY);
  assert.match(quest.reply.text, /Veer Ji Chaap/);
  assert.match(quest.reply.text, /3 task/);

  const none = draft("How many tasks are left?", NOTHING);
  assert.match(none.reply.text, /Nothing left/);

  // Unavailable is never reported as "nothing left".
  const failed = draft("How many tasks are left?", { ...NOTHING, today: undefined });
  assert.doesNotMatch(failed.reply.text, /Nothing left/);
  assert.match(failed.reply.text, /couldn't|could not|can't/i);

  const questsFailed = draft("How many tasks are left?", {
    ...NOTHING,
    quests: undefined,
    unavailable: ["your quests"],
  });
  assert.doesNotMatch(questsFailed.reply.text, /Nothing left/);
});

test("quest → 'kitna hua?' and 'kitna?' are quest progress", () => {
  for (const m of ["kitna hua?", "kitna?", "how much?"]) {
    const { intent, reply } = draft(m, QUEST_ONLY, after("quests"));
    assert.equal(intent.intent, "quests", m);
    assert.equal(intent.detail, "progress", m);
    assert.match(reply.text, /0\/3|3 में से 0/, m);
  }
});

test("reward → 'kitna?' stays on rewards", () => {
  const r = classifyIntent("kitna?", after("rewards"));
  assert.equal(r.intent, "rewards");
  assert.deepEqual(r.matched, ["quantity-follow-up"]);
});

test("a bare 'kitna?' with nothing before it asks instead of guessing", () => {
  assert.notEqual(classifyIntent("kitna?").intent, "rewards");
  assert.notEqual(classifyIntent("kitna?").intent, "quests");
});

test("streak → 'kab se?' answers how long the streak has run", () => {
  for (const m of ["kab se?", "since when?", "कब से?"]) {
    const { intent, reply } = draft(m, SAMPLE, after("streak"));
    assert.equal(intent.intent, "streak", m);
    assert.equal(intent.detail, "since", m);
    assert.match(reply.text, /11/, m);
    assert.match(reply.text, /30 Days of Running/, m);
  }
});

test("'kab se?' with no streak or no challenge says so, without numbers", () => {
  const none = draft(
    "since when?",
    {
      ...SAMPLE,
      challenges: SAMPLE.challenges.map((c) => ({ ...c, currentStreak: 0 })),
    },
    after("streak")
  );
  assert.match(none.reply.text, /No streak is running/);
  const noChallenge = draft("since when?", QUEST_ONLY, after("streak"));
  assert.match(noChallenge.reply.text, /No active challenge/);
  assert.ok(noChallenge.reply.links.some((l) => l.href === "/explore"));
});

/* ── 2. Intent variations, languages, off-topic ───────────────────────── */

test("personal reward questions are rewards, sports questions are off-topic", () => {
  for (const m of [
    "did i win anything?",
    "maine kya jeeta?",
    "maine kuch jeeta?",
    "kuch mila?",
    "have i earned anything?",
  ]) {
    assert.equal(classifyIntent(m).intent, "rewards", m);
  }
  for (const m of ["who won the cricket match?", "ipl score?", "gossip sunao"]) {
    assert.equal(classifyIntent(m).intent, "off_topic", m);
  }
});

test("off-topic in Hinglish is playful and steers back", () => {
  const { reply } = draft("gossip sunao bhai", SAMPLE);
  assert.equal(reply.intent, "off_topic");
  assert.ok(reply.suggestions.length > 0);
});

test("languages: English, Hinglish, Roman Hindi, Hindi, Bhojpuri and a mix", () => {
  const cases: [string, string][] = [
    ["what's my quest?", "en"],
    ["mera quest kya h?", "hinglish"],
    ["bhai quest ka kya scene hai", "hinglish"],
    ["what's mera quest?", "hinglish"],
    ["मेरा quest क्या है?", "hi"],
    ["हमार quest का बा?", "bho"],
  ];
  for (const [m, lang] of cases) {
    const { reply, context } = draft(m, SAMPLE);
    assert.equal(context.lang, lang, m);
    assert.equal(reply.intent, "quests", m);
    assert.match(reply.text, /Café Trail/, m);
  }
});

test("quests and challenges never leak into each other", () => {
  const quest = draft("what's my quest?", SAMPLE);
  assert.doesNotMatch(quest.reply.text, /30 Days of Running|Read Daily|streak/i);
  const challenge = draft("active challenge?", SAMPLE);
  assert.doesNotMatch(challenge.reply.text, /Café Trail/);
});

test("every Phase 5 reply stays short and grounded in its own draft", () => {
  const convo: [string, Partial<StrivyFacts>, ChatTurn[]][] = [
    ["kitne task bache?", SAMPLE, []],
    ["How many tasks are left?", QUEST_ONLY, []],
    ["kya bacha hai?", NOTHING, []],
    ["kab se?", SAMPLE, after("streak")],
    ["कब से?", SAMPLE, after("streak")],
    ["kitna?", QUEST_ONLY, after("quests")],
  ];
  for (const [m, facts, history] of convo) {
    const { reply, context } = draft(m, facts, history);
    const g = checkGrounding(reply.text, toModelContext(context), reply);
    assert.ok(g.ok, `${m}: ${g.reasons.join("; ")}`);
    assert.doesNotMatch(reply.text, /\{\w+\}/);
    assert.ok(reply.text.length <= 240, `${m}: ${reply.text}`);
  }
});

/* ── 3. Message quality checks on model rewrites ──────────────────────── */

test("grounding rejects a rewrite in the wrong language", () => {
  const hi = draft("मेरा quest क्या है?", SAMPLE);
  const english = checkGrounding(
    "Your active quest is 'Café Trail'.",
    toModelContext(hi.context),
    hi.reply
  );
  assert.ok(english.reasons.includes("wrong language"));

  const en = draft("what's my quest?", SAMPLE);
  const hindi = checkGrounding(
    "तुम्हारा active quest 'Café Trail' है।",
    toModelContext(en.context),
    en.reply
  );
  assert.ok(hindi.reasons.includes("wrong language"));
});

test("grounding rejects a rewrite that turns into an essay", () => {
  const { reply, context } = draft("what's my quest?", SAMPLE);
  const long = checkGrounding(
    `${reply.text} Keep going. You can do it. Every day matters. Stay strong. Believe it.`,
    toModelContext(context),
    reply
  );
  assert.equal(long.ok, false);
  assert.ok(
    long.reasons.some((r) => r === "too many sentences" || r === "much longer than the draft")
  );
});

test("grounding catches invented Devanagari digits and names", () => {
  const { reply, context } = draft("मेरा quest क्या है?", SAMPLE);
  const digits = checkGrounding(
    "तुम्हारा active quest 'Café Trail' है, ७ दिन बाकी।",
    toModelContext(context),
    reply
  );
  assert.ok(digits.reasons.some((r) => r.startsWith("new numbers")));
  const name = checkGrounding("तुम्हारा quest 'Momo Madness' है।", toModelContext(context), reply);
  assert.ok(name.reasons.some((r) => r.includes("Momo Madness")));
});

/* ── 4. Rate limit and error fallbacks ────────────────────────────────── */

test("the rate limiter allows the limit, blocks the next, and resets per window", () => {
  const limiter = createRateLimiter(3, 1000);
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => limiter.take("a", i)),
    [true, true, true, false]
  );
  assert.equal(limiter.take("b", 5), true, "per user");
  assert.equal(limiter.take("a", 1001), true, "window rolled");
});

const post = (body: unknown) =>
  new Request("http://x/api/strivy/chat", { method: "POST", body: JSON.stringify(body) });

test("chat answers 429 with a friendly line once the limit is used up", async () => {
  const fake = fakeSupabase({ user: { id: USER_ID } });
  const deps = {
    isEnabled: () => true,
    getSupabase: async () => fake.client,
    getProvider: () => deterministicProvider,
    limiter: createRateLimiter(1, 60_000),
  };
  assert.equal((await handleStrivyChatRequest(post({ message: "hi" }), deps)).status, 200);
  const res = await handleStrivyChatRequest(post({ message: "hi" }), deps);
  assert.equal(res.status, 429);
  assert.match(((await res.json()) as { error: string }).error, /Easy there/);
});

test("an unexpected failure is a plain 500, never internal details", async () => {
  const boom = async () => {
    throw new Error('relation "secret_table" does not exist at PGRST');
  };
  const chat = await handleStrivyChatRequest(post({ message: "hi" }), {
    isEnabled: () => true,
    getSupabase: boom,
    getProvider: () => deterministicProvider,
  });
  assert.equal(chat.status, 500);
  const text = await chat.text();
  assert.match(text, /Something went sideways/);
  assert.doesNotMatch(text, /secret_table|PGRST|relation/);

  const checkin = await handleStrivyCheckinRequest(new Request("http://x", { method: "POST" }), {
    isEnabled: () => true,
    getSupabase: boom,
    getNotifier: () => {
      throw new Error("unused");
    },
  });
  assert.equal(checkin.status, 500);
  assert.doesNotMatch(await checkin.text(), /secret_table/);

  const push = await withFallback(async () => {
    throw new Error("VAPID private key abc");
  });
  assert.equal(push.status, 500);
  assert.doesNotMatch(await push.text(), /VAPID|abc/);
});

/* ── 5. Safe rendering in the panel ───────────────────────────────────── */

test("only same-site paths become links", () => {
  assert.equal(safeHref("/quests/q9"), "/quests/q9");
  for (const bad of [
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "/\\evil.example",
    "/ok\nnext",
    "",
    42,
    null,
  ]) {
    assert.equal(safeHref(bad), null, String(bad));
  }
});

test("a malformed reply is dropped, a good one is cleaned", () => {
  for (const bad of [null, "text", { text: 5 }, { text: "", intent: "x" }, { intent: "x" }, []]) {
    assert.equal(normalizeReply(bad), null, JSON.stringify(bad));
  }
  const r = normalizeReply({
    text: "x".repeat(5000),
    intent: "quests",
    links: [
      { label: "ok", href: "/quests/q9" },
      { label: "bad", href: "javascript:alert(1)" },
      { label: 3, href: "/x" },
      "junk",
    ],
    suggestions: ["a", "b", "c", "d", "e", 7],
  });
  assert.ok(r);
  assert.equal(r.text.length, 2000);
  assert.deepEqual(r.links, [{ label: "ok", href: "/quests/q9" }]);
  assert.deepEqual(r.suggestions, ["a", "b", "c", "d"]);
});

test("failed requests only ever show friendly text", () => {
  const cases: [Parameters<typeof responseToMessage>[0], string, boolean][] = [
    [500, ERROR_TEXT.generic, true],
    [502, ERROR_TEXT.generic, true],
    [200, ERROR_TEXT.generic, true], // 200 with a broken body
    ["offline", ERROR_TEXT.offline, true],
    ["network", ERROR_TEXT.offline, true],
    ["timeout", ERROR_TEXT.timeout, true],
    [429, ERROR_TEXT.slowDown, true],
    [401, ERROR_TEXT.signedOut, false],
  ];
  for (const [status, text, retry] of cases) {
    const m = responseToMessage(
      status,
      { reply: '{"raw":"json"}', error: "PGRST116 relation" },
      "hi"
    );
    assert.equal(m.role, "error", String(status));
    if (m.role !== "error") continue;
    assert.equal(m.text, text, String(status));
    assert.equal(m.retry !== null, retry, String(status));
  }
  assert.equal(ERROR_TEXT.generic, "Something went sideways 😅 Try that again.");
  assert.equal(ERROR_TEXT.offline, "I can't reach STRIVUP right now. Try again in a bit.");
});

/* ── 6. Push rotation, preview and history ────────────────────────────── */

/** 2026-10-01 at an India-time hour. */
const at = (hour: number, day = 1) => new Date(Date.UTC(2026, 9, day, hour) - 5.5 * 3_600_000);

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

const sub = (userId: string, id: string): PushSubscriptionRecord => ({
  id,
  userId,
  endpoint: `https://push.example/${id}`,
  p256dh: "BPUBKEY",
  auth: "AUTH",
});

test("a line sent this week is only reused when nothing fresher fits", () => {
  const c = pushCandidates(BUSY, USER_ID, at(15)).find((x) => x.type === "pending_task")!;
  const base = { seed: "s", title: PUSH_TITLE, avoidBodies: new Set<string>(), usedTones: [] };
  const all = rankedMessages(c, base);
  assert.ok(all.length >= 2);
  const recent = new Set([all[0].body]);
  const next = rankedMessages(c, { ...base, recentBodies: recent });
  assert.notEqual(next[0].body, all[0].body);
  assert.equal(next[next.length - 1].body, all[0].body, "still usable as a last resort");
});

test("planning a push has no side effects; running it does", async () => {
  const mem = createMemoryPushStore({ subscriptions: [sub(USER_ID, "s1")], now: () => at(15) });
  const { sender, sent } = createMemorySender();
  const input = { now: at(15), store: mem.store, sender, loadFacts: async () => BUSY };
  const plan = await planForUser(USER_ID, input);
  assert.equal(plan.outcome, "ready");
  assert.ok(plan.message?.body);
  assert.equal(mem.log.length, 0);
  assert.equal(sent.length, 0);

  const run = await runForUser(USER_ID, input);
  assert.equal(run.outcome, "sent");
  assert.equal(mem.log.length, 1);

  const skipped = await planForUser(USER_ID, { ...input, now: at(3) });
  assert.equal(skipped.outcome, "skipped");
  assert.equal(skipped.reason, "outside the push windows");
});

test("dev preview and history only ever show the caller", async () => {
  const fake = fakeSupabase({ user: { id: USER_ID } });
  const mem = createMemoryPushStore({
    subscriptions: [sub(USER_ID, "mine"), sub(OTHER, "theirs")],
    now: () => at(15),
  });
  const { sender, sent } = createMemorySender();
  // One push for someone else already in the log.
  await runForUser(OTHER, { now: at(15), store: mem.store, sender, loadFacts: async () => BUSY });
  const before = mem.log.length;
  const deps = {
    isEnabled: () => true,
    devToolsEnabled: () => true,
    getSupabase: async () => fake.client,
    getAdmin: () => fake.client,
    getSender: () => sender,
    getStore: () => mem.store,
    now: () => at(15),
  };
  const req = (body: unknown) =>
    new Request("http://x", { method: "POST", body: JSON.stringify(body) });

  const preview = await handleDev(
    req({ action: "preview", window: "afternoon", userId: OTHER }),
    deps
  );
  assert.equal(preview.status, 200);
  const p = (await preview.json()) as { devices: number; window: string };
  assert.equal(p.devices, 1, "only the caller's device");
  assert.equal(p.window, "afternoon");
  assert.equal(mem.log.length, before, "preview sends nothing");
  assert.equal(sent.length, 1);

  const history = await handleDev(req({ action: "history", userId: OTHER }), deps);
  assert.deepEqual(((await history.json()) as { history: unknown[] }).history, []);

  // A prototype key is not a window.
  const proto = await handleDev(req({ action: "preview", window: "constructor" }), deps);
  assert.equal(((await proto.json()) as { window: string }).window, "afternoon");
});

test("the service worker re-subscribes and saves the new endpoint when the browser rotates it", async () => {
  const listeners: Record<string, (e: unknown) => void> = {};
  const posted: { url: string; init: { credentials: string; body: string } }[] = [];
  const self = {
    location: { origin: "https://strivup.example" },
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    skipWaiting: () => undefined,
    registration: {
      pushManager: {
        subscribe: async (opts: { applicationServerKey: string }) => ({
          toJSON: () => ({ endpoint: "https://push.example/new", key: opts.applicationServerKey }),
        }),
      },
    },
    clients: { claim: async () => undefined },
  };
  const fetch = async (url: string, init: { credentials: string; body: string }) =>
    void posted.push({ url, init });
  vm.runInNewContext(readFileSync("public/strivy-sw.js", "utf8"), { self, URL, fetch });
  const fire = async (event: Record<string, unknown>) => {
    let waited: Promise<unknown> = Promise.resolve();
    listeners.pushsubscriptionchange({
      ...event,
      waitUntil: (p: Promise<unknown>) => (waited = p),
    });
    await waited;
  };
  await fire({ oldSubscription: { options: { applicationServerKey: "KEY" } } });
  assert.equal(posted.length, 1);
  assert.equal(posted[0].url, "/api/strivy/push/subscribe");
  assert.equal(posted[0].init.credentials, "same-origin");
  assert.deepEqual(JSON.parse(posted[0].init.body), {
    endpoint: "https://push.example/new",
    key: "KEY",
  });
  // No old key, nothing to do.
  await fire({ oldSubscription: null });
  assert.equal(posted.length, 1);
});
