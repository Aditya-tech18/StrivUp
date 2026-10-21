/**
 * Final Phase 4: push language, separate push / daily-nudge settings.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PUSH_TITLE } from "@/lib/strivy/push/config";
import { PUSH_PRIORITY, pushCandidates, type PushCandidate } from "@/lib/strivy/push/planner";
import { LANGUAGE_LIBRARIES } from "@/lib/strivy/push/library";
import { fill, localizeVars, rankedMessages } from "@/lib/strivy/push/messages";
import { validatePushMessage } from "@/lib/strivy/push/validate";
import { createMemoryPushStore, supabasePushStore } from "@/lib/strivy/push/store";
import { createMemorySender } from "@/lib/strivy/push/sender";
import { runPushWindow } from "@/lib/strivy/push/scheduler";
import { handlePreferences } from "@/lib/strivy/push/http";
import type { StrivyLang } from "@/lib/strivy/language";
import type { QuestFact, StrivyFacts } from "@/lib/strivy/types";
import { SAMPLE, USER_ID, fakeSupabase } from "./helpers";

const at = (hour: number, minute = 0, day = 1) =>
  new Date(Date.UTC(2026, 9, day, hour, minute) - 5.5 * 3_600_000);

const VEER: QuestFact = {
  questId: "q9",
  title: "Veer Ji Chaap",
  businessName: "Veer Ji",
  locationName: null,
  verificationStatus: "pending",
  completed: false,
  endsAt: "2026-10-02T00:00:00Z",
  tasksTotal: 3,
  tasksApproved: 1,
  tasksPending: 0,
  tasksNeedAction: 2,
};

const FACTS: StrivyFacts = {
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

const LANGS: StrivyLang[] = ["en", "hinglish", "hi", "bho"];
const DEVANAGARI = /[ऀ-ॿ]/;

const SAMPLE_VARS = {
  task: "'Run 5km'",
  streak: "11-day",
  streakN: 11,
  challenge: "'30 Days of Running'",
  quest: "'Veer Ji Chaap'",
  hours: "5 hours",
  hoursN: 5,
  tasks: "2 tasks",
  tasksN: 2,
  count: "3 tasks",
  countN: 3,
  approved: 1,
  total: 3,
  reward: "Cash Prize",
  label: "Day 11",
  parent: "'30 Days of Running'",
  status: "eligible",
};

test("every language covers every push type, and every line validates", () => {
  for (const lang of LANGS) {
    const lib = LANGUAGE_LIBRARIES[lang];
    for (const type of [...PUSH_PRIORITY, "reward_received" as const]) {
      const variants = lib[type];
      assert.ok(variants?.length > 0, `${lang}: ${type} missing`);
      for (const v of variants) {
        const vars = localizeVars(SAMPLE_VARS, lang);
        const body = fill(v.text, vars);
        const c: PushCandidate = {
          type: type === "reward_received" ? "reward_earned" : type,
          dedupeKey: "k",
          entityId: null,
          url: "/feed",
          vars: SAMPLE_VARS,
        };
        assert.deepEqual(
          validatePushMessage({ title: PUSH_TITLE, body, tone: v.tone }, c),
          [],
          `${lang} ${type}: ${body}`
        );
        assert.ok(body.length <= 160, `${lang} ${type} too long`);
        assert.ok(!/\{\w+\}/.test(body), `${lang} ${type}: unfilled`);
        if (lang === "hi" || lang === "bho") assert.match(body, DEVANAGARI, `${lang} ${type}`);
        else assert.doesNotMatch(body, DEVANAGARI, `${lang} ${type}`);
      }
    }
  }
});

test("each language keeps the mix: suggestive lines a minority, bad news never teased", () => {
  for (const lang of LANGS) {
    const lib = LANGUAGE_LIBRARIES[lang];
    const all = Object.values(lib).flat();
    assert.ok(
      all.some((v) => v.tone === "suggestive"),
      lang
    );
    assert.ok(all.filter((v) => v.tone === "suggestive").length * 4 < all.length, lang);
    assert.ok(
      !lib.proof_rejected.some((v) => v.tone === "suggestive" || v.text.includes("😏")),
      lang
    );
  }
});

test("English pushes carry no Hinglish; Bhojpuri reads as Bhojpuri", () => {
  for (const v of Object.values(LANGUAGE_LIBRARIES.en).flat())
    assert.doesNotMatch(v.text, /\b(hai|kar|aaj|abhi|mat|toh|ka|ki)\b/i, v.text);
  const bho = Object.values(LANGUAGE_LIBRARIES.bho)
    .flat()
    .map((v) => v.text)
    .join(" ");
  assert.match(bho, /बा|रउरा|भइल|गइल/);
});

test("counts, hours and streaks are re-worded per language from the real numbers", () => {
  assert.equal(localizeVars(SAMPLE_VARS, "hi").hours, "5 घंटे");
  assert.equal(localizeVars(SAMPLE_VARS, "hinglish").hours, "5 ghante");
  assert.equal(localizeVars(SAMPLE_VARS, "bho").streak, "11 दिन");
  assert.equal(localizeVars(SAMPLE_VARS, "en").streak, "11-day");
  assert.equal(localizeVars(SAMPLE_VARS, "en").count, "3 tasks");
  assert.deepEqual(localizeVars(SAMPLE_VARS, null), SAMPLE_VARS);
});

test("the candidate's language picks the library; no language keeps the mixed one", () => {
  const c = pushCandidates(FACTS, USER_ID, at(15)).find((x) => x.type === "quest_progress")!;
  const ctx = (lang: StrivyLang | null) => ({
    seed: "s",
    title: PUSH_TITLE,
    avoidBodies: new Set<string>(),
    usedTones: [],
    lang,
  });
  const hi = rankedMessages(c, ctx("hi"));
  assert.ok(hi.length > 0 && hi.every((m) => DEVANAGARI.test(m.body)));
  assert.ok(hi.every((m) => m.body.includes("'Veer Ji Chaap'") && m.body.includes("1/3")));
  const en = rankedMessages(c, ctx("en"));
  assert.ok(en.every((m) => !DEVANAGARI.test(m.body) && !/\bmat\b|\bkarwa\b/.test(m.body)));
  const mixed = rankedMessages(c, ctx(null));
  assert.ok(mixed.some((m) => m.body.includes("karwa")));
});

async function runWith(language: StrivyLang | null, hour: number) {
  const mem = createMemoryPushStore({
    subscriptions: [
      { id: "s1", userId: USER_ID, endpoint: "https://push.example/1", p256dh: "P", auth: "A" },
    ],
    preferences: { [USER_ID]: { language } },
    now: () => at(hour),
  });
  const { sender, sent } = createMemorySender();
  const [result] = await runPushWindow({
    now: at(hour),
    store: mem.store,
    sender,
    loadFacts: async () => FACTS,
  });
  return { result, sent };
}

test("the scheduler writes in the user's language", async () => {
  const hi = await runWith("hi", 9);
  assert.equal(hi.result.outcome, "sent");
  assert.match(hi.sent[0].payload.body, DEVANAGARI);
  const bho = await runWith("bho", 20);
  assert.equal(bho.result.outcome, "sent");
  assert.match(bho.sent[0].payload.body, /बा|के|दीं|चाहीं/);
  const en = await runWith("en", 20);
  assert.doesNotMatch(en.sent[0].payload.body, DEVANAGARI);
  assert.equal(en.sent[0].payload.title, PUSH_TITLE);
});

test("stored language wins, then the chat's language, then mixed", async () => {
  const read = async (row: Record<string, unknown>) => {
    const fake = fakeSupabase({
      tables: {
        strivy_notification_preferences: {
          data: [{ push_enabled: true, max_per_day: 3, min_spacing_minutes: 180, ...row }],
        },
      },
    });
    return (await supabasePushStore(fake.client).getPreferences(USER_ID)).language;
  };
  assert.equal(await read({ language: "bho", chat_language: "en" }), "bho");
  assert.equal(await read({ language: null, chat_language: "hi" }), "hi");
  assert.equal(await read({ language: null, chat_language: null }), null);
  assert.equal(await read({ language: "klingon", chat_language: null }), null);
});

/* ── Preferences route: daily nudges and language, separate from push ── */

function prefsCall(body: unknown, method = "PUT", row?: Record<string, unknown>) {
  const fake = fakeSupabase({
    user: { id: USER_ID },
    tables: {
      profiles: { data: [{ is_deactivated: false }] },
      strivy_notification_preferences: { data: row ? [row] : [] },
    },
  });
  const req = new Request("http://x/api/strivy/push/preferences", {
    method,
    ...(method === "PUT" ? { body: JSON.stringify(body) } : {}),
  });
  return handlePreferences(req, {
    isEnabled: () => true,
    getSupabase: async () => fake.client,
  }).then((res) => ({
    res,
    upsert: fake.queries.find((q) => q.select === "<upsert>")?.payload as
      Record<string, unknown> | undefined,
  }));
}

test("daily nudges switch on and off for the session's user only", async () => {
  const off = await prefsCall({ nudges: false, user_id: "someone-else" });
  assert.equal(off.res.status, 200);
  assert.equal(off.upsert?.push_enabled, false);
  assert.equal(off.upsert?.user_id, USER_ID);
  assert.ok(!("language" in (off.upsert ?? {})), "only the changed field is written");
  const legacy = await prefsCall({ enabled: true });
  assert.equal(legacy.upsert?.push_enabled, true);
});

test("push language can be chosen, reset to auto, or learned from the chat", async () => {
  assert.equal((await prefsCall({ language: "bho" })).upsert?.language, "bho");
  assert.equal((await prefsCall({ language: "auto" })).upsert?.language, null);
  assert.equal((await prefsCall({ chatLanguage: "hi" })).upsert?.chat_language, "hi");
  for (const bad of [{ language: "fr" }, { chatLanguage: "auto" }, { nudges: "yes" }, {}]) {
    const r = await prefsCall(bad);
    assert.equal(r.res.status, 400, JSON.stringify(bad));
    assert.equal(r.upsert, undefined);
  }
});

test("GET returns nudges and language, defaulting to nudges on and auto", async () => {
  const none = await (await prefsCall(null, "GET")).res.json();
  assert.deepEqual(none, { nudges: true, language: null, chatLanguage: null, maxPerDay: 3 });
  const set = await (
    await prefsCall(null, "GET", {
      push_enabled: false,
      max_per_day: 2,
      language: "hi",
      chat_language: "en",
    })
  ).res.json();
  assert.deepEqual(set, { nudges: false, language: "hi", chatLanguage: "en", maxPerDay: 2 });
});
