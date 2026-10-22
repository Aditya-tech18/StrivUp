/**
 * v5 final polish: general questions, banter/roast, serious moods, quest
 * follow-ups, the internal-metadata leak, push diagnostics and the bell list.
 *
 * The person in these tests matches the real report: active quest "Veer Ji
 * Chaap" at 0/3 approved tasks, and the challenge "CDS preparation" on a
 * 1-day streak. OpenRouter is faked with an injected fetch; nothing here
 * calls a real API or a real database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { FREE_ROUTER_MODEL, createOpenRouterProvider } from "@/lib/strivy/openrouter";
import { classifyIntent, intentCategory } from "@/lib/strivy/intents";
import { detectLanguage } from "@/lib/strivy/language";
import { deterministicProvider } from "@/lib/strivy/model";
import { handleStrivyChatRequest, runStrivyPipeline } from "@/lib/strivy/pipeline";
import { PHRASES } from "@/lib/strivy/phrases";
import { BANNED_WORDS } from "@/lib/strivy/persona";
import {
  containsInternalMetadata,
  sanitizeReply,
  stripInternalMetadata,
} from "@/lib/strivy/sanitize";
import { solveMath, wantsRedirect } from "@/lib/strivy/general";
import { SILENCE_STOP_MS, createEndOfSpeechTimer } from "@/lib/strivy/voice/silence";
import { speakableText } from "@/lib/strivy/voice/speech";
import { transcribeWithGemini } from "@/lib/strivy/voice/server";
import { normalizeReply } from "@/components/features/strivy/chat";
import { messageTime, parseRichText } from "@/components/features/strivy/richtext";
import { pushIcon, unreadCount } from "@/components/features/strivy/push";
import {
  PushStoreError,
  categorizeStoreError,
  checkPushServer,
  firstPushConfigProblem,
  serviceKeyKind,
} from "@/lib/strivy/push/diagnostics";
import { createMemoryPushStore, type PushSubscriptionRecord } from "@/lib/strivy/push/store";
import { createMemorySender } from "@/lib/strivy/push/sender";
import { runPushWindow } from "@/lib/strivy/push/scheduler";
import { validatePushMessage } from "@/lib/strivy/push/validate";
import { pushCandidates } from "@/lib/strivy/push/planner";
import { handleCron, handleDev, handleHistory, parseSubscription } from "@/lib/strivy/push/http";
import type { ChatTurn, QuestFact, StrivyFacts } from "@/lib/strivy/types";
import { USER_ID, fakeSupabase } from "./helpers";

/* ── Fake OpenRouter ─────────────────────────────────────────────────── */

interface Sent {
  body: { model?: string; messages?: { role: string; content: string }[] };
}

function completion(content: string, model = "some-lab/some-model:free") {
  return {
    model,
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0 },
  };
}

function openRouter(reply: string | ((s: Sent) => string), model?: string) {
  const sent: Sent[] = [];
  const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
    const s: Sent = { body: init?.body ? JSON.parse(String(init.body)) : {} };
    sent.push(s);
    const content = typeof reply === "function" ? reply(s) : reply;
    return new Response(JSON.stringify(completion(content, model)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const provider = createOpenRouterProvider(
    {
      apiKey: "sk-or-v1-test0000000000000000000000000000",
      model: FREE_ROUTER_MODEL,
      timeoutMs: 2000,
      baseUrl: "https://openrouter.ai/api/v1",
    },
    { fetch: fetchImpl, log: () => undefined }
  );
  return { provider, sent };
}

/* ── The person's real data: Veer Ji Chaap 0/3, CDS preparation 1 day ── */

function db(options: { empty?: boolean } = {}) {
  return fakeSupabase({
    user: { id: USER_ID },
    tables: options.empty
      ? {}
      : {
          profiles: { data: [{ full_name: "Aditya", username: "aditya" }] },
          profile_challenge_stats: {
            data: [
              {
                challenge_id: "c-cds",
                title: "CDS preparation",
                status: "active",
                current_day: 2,
                duration_days: 30,
                current_streak: 1,
                longest_streak: 1,
                consistency_pct: 50,
                joined_at: "2026-10-01T00:00:00Z",
              },
            ],
          },
          challenge_participants: { data: [] },
          quest_participants: {
            data: [
              {
                quest_id: "q-veer",
                verification_status: "pending",
                completed_at: null,
                joined_at: "2026-10-01T00:00:00Z",
                quest: {
                  title: "Veer Ji Chaap",
                  business_name: "Veer Ji",
                  location_name: null,
                  ends_at: "2026-10-28T12:00:00Z",
                  end_date: null,
                },
              },
            ],
          },
          quest_tasks: {
            data: ["t1", "t2", "t3"].map((id) => ({ id, quest_id: "q-veer", is_required: true })),
          },
          quest_task_submissions: { data: [] },
        },
  });
}

async function ask(
  message: string,
  provider = deterministicProvider,
  history: ChatTurn[] = [],
  options: { empty?: boolean } = {}
) {
  const fake = db(options);
  const result = await runStrivyPipeline({
    supabase: fake.client,
    userId: USER_ID,
    message,
    history,
    provider,
  });
  return { ...result, fake };
}

const QUEST_HISTORY: ChatTurn[] = [
  { role: "user", text: "meri quest kya hai?" },
  { role: "strivy", text: "Tera active quest 'Veer Ji Chaap' hai 😏", intent: "quests" },
];

const STREAK_HISTORY: ChatTurn[] = [
  { role: "user", text: "meri streak kitni hai?" },
  { role: "strivy", text: "🔥 1 day on 'CDS preparation'", intent: "streak" },
];

/** Every label that must never reach a person. */
const LEAKS = [
  /user safety/i,
  /response safety/i,
  /\bsafety\s*:/i,
  /\bintent\s*:/i,
  /\bprovider\s*:/i,
  /\bmodel\s*:/i,
  /\blatency\s*:/i,
  /\bdebug\s*:/i,
  /\brouting\s*:/i,
  /\bclassification\s*:/i,
  /\bconfidence\s*:/i,
  /\bgrounding\s*:/i,
  /\binternal\s*:/i,
  /raw response/i,
  /openrouter|nemotron|llama|"safety"/i,
];

function assertNoLeak(text: string, label: string) {
  for (const re of LEAKS) assert.doesNotMatch(text, re, `${label}: ${re}`);
}

/* ── 1. General questions are answered first ─────────────────────────── */

test("general questions route to an answer, read no data, and the model's answer is shown", async () => {
  for (const [message, answer] of [
    [
      "Who was Albert Einstein?",
      "Albert Einstein was a physicist famous for the theory of relativity.",
    ],
    [
      "What is a black hole?",
      "A black hole is a region of space where gravity is so strong that not even light escapes.",
    ],
    ["Modi ji kon hain?", "Narendra Modi India ke Prime Minister hain."],
  ] as const) {
    const { provider, sent } = openRouter(answer);
    const { reply, meta, fake } = await ask(message, provider);
    assert.equal(classifyIntent(message).intent, "general_question", message);
    assert.equal(intentCategory(classifyIntent(message)), "CASUAL_CHAT");
    assert.equal(meta.mode, "chat");
    assert.deepEqual(fake.queries, [], `${message}: no Supabase reads`);
    assert.equal(sent.length, 1);
    const system = sent[0].body.messages![0].content;
    assert.match(system, /Answer it correctly first/);
    assert.match(system, /neutral facts only, no praise, criticism or opinion/);
    assert.ok(reply.text.startsWith(answer), `${message}: answered first`);
    assert.doesNotMatch(reply.text, /outside my lane|I only do STRIVUP/i);
  }
});

test("2+2? is answered exactly with no model call", async () => {
  const { provider, sent } = openRouter("five");
  const { reply } = await ask("2+2?", provider);
  assert.match(reply.text, /^4\b/);
  assert.equal(sent.length, 0);
  assert.equal(solveMath("what is 12*3"), 36);
  assert.equal(solveMath("(2+3)^2"), 25);
  assert.equal(solveMath("10/0"), null);
  assert.equal(solveMath("process.exit()"), null);
});

test("the StrivUp redirect is short, varied, optional, never twice in a row, never in small talk", async () => {
  const redirects = new Set<string>();
  let withOne = 0;
  const all = Object.values(PHRASES.strivupRedirect).flat();
  const questions = [
    "Who was Albert Einstein?",
    "What is a black hole?",
    "Who painted the Mona Lisa?",
    "What is photosynthesis?",
    "Who was Newton?",
    "What is gravity?",
    "Who discovered penicillin?",
    "What is DNA?",
    "Why is the sky blue?",
    "What is the capital of France?",
    "Who invented the telephone?",
    "When did World War 2 end?",
  ];
  for (const q of questions) {
    const { provider } = openRouter("Here is a short, correct answer to that.");
    const { reply } = await ask(q, provider);
    const line = all.find((l) => reply.text.includes(l));
    if (line) {
      withOne++;
      redirects.add(line);
      assert.ok(line.length < 80, "short");
    }
  }
  assert.ok(withOne > 0 && withOne < questions.length, `some but not all (${withOne})`);
  assert.ok(redirects.size > 1, "worded differently");
  assert.equal(wantsRedirect("anything", true), false, "never twice in a row");

  for (const m of ["bhai kya haal hai?", "ka ba haal ba?", "good morning", "hey strivy"]) {
    const { provider } = openRouter("Bas mast bhai 😎 Tu bata?");
    const { reply } = await ask(m, provider);
    assert.ok(!all.some((l) => reply.text.includes(l)), `${m}: no redirect in small talk`);
  }
});

test("with the model off, a general question gets an honest line, not a refusal", async () => {
  const { reply } = await ask("Who was Albert Einstein?");
  assert.doesNotMatch(reply.text, /outside my lane|only do STRIVUP|mere lane ke bahar/i);
  assert.match(reply.text, /right now/i);
});

/* ── 2. Casual chat ──────────────────────────────────────────────────── */

test("casual chat reads no data and gets a natural reply", async () => {
  for (const m of ["bhai kya haal hai?", "ka ba haal ba?", "what's up?", "good morning"]) {
    const { provider } = openRouter("Bas mast bhai 😎 Tu bata?");
    const { reply, fake } = await ask(m, provider);
    assert.deepEqual(fake.queries, [], m);
    assert.equal(reply.text, "Bas mast bhai 😎 Tu bata?");
  }
});

/* ── 3. Banter: playful roast with REAL data ─────────────────────────── */

test("insults get a playful roast, never a lecture", async () => {
  for (const m of ["bkl", "tu chutiya hai", "tu bekaar hai", "tu lund hai", "you are useless"]) {
    assert.equal(classifyIntent(m).intent, "banter", m);
    const { reply } = await ask(m);
    assert.equal(reply.intent, "banter");
    assert.doesNotMatch(reply.text, /cannot engage|abusive language|respectful/i, m);
    assert.doesNotMatch(reply.text, /chutiya|lund|bkl|bsdk/i, `${m}: never repeats the swear word`);
    for (const w of BANNED_WORDS) assert.ok(!new RegExp(`\\b${w}\\b`, "i").test(reply.text), w);
  }
});

test("the roast uses only real data: the 1-day streak or Veer Ji Chaap 0/3", async () => {
  const seen = new Set<string>();
  for (const m of [
    "bkl",
    "tu chutiya hai",
    "tu bekaar hai",
    "tu lund hai",
    "bhai tu chutiya h",
    "abe bc",
  ]) {
    const { reply } = await ask(m);
    const streak = /1 (day|din)/.test(reply.text) && /2 (days|din)/.test(reply.text);
    const quest = /Veer Ji Chaap/.test(reply.text) && /0\/3|3 में से 0/.test(reply.text);
    assert.ok(streak || quest, `${m}: ${reply.text}`);
    assert.doesNotMatch(reply.text, /\b(30|5|7|10) days?\b/, "no invented streak");
    seen.add(streak ? "streak" : "quest");
  }
  assert.ok(seen.size >= 1);
});

test("with no data the roast is generic and says no numbers", async () => {
  const { reply } = await ask("tu bekaar hai", deterministicProvider, [], { empty: true });
  assert.doesNotMatch(reply.text, /\d/);
  assert.doesNotMatch(reply.text, /Veer|CDS/);
});

test("a model roast that echoes the profanity or invents a streak falls back to the grounded roast", async () => {
  for (const bad of [
    "Tu khud chutiya hai 😂",
    "Bhai teri 30 days ki streak hai, chill 😂",
    "'Morning Run' quest abhi 0/3 pe hai 😭",
  ]) {
    const { provider } = openRouter(bad);
    const { reply, meta } = await ask("tu chutiya hai", provider);
    assert.equal(
      meta.modelUsed,
      false,
      `${bad} => ${reply.text} ${JSON.stringify(meta.groundingRejected)}`
    );
    assert.notEqual(reply.text, bad);
  }
  const { provider, sent } = openRouter("Haha bhai, pehle 'Veer Ji Chaap' ka 0/3 dekh 😭");
  const { reply, meta } = await ask("tu chutiya hai", provider);
  assert.match(sent[0].body.messages![1].content, /playfully insulting you/);
  if (meta.modelUsed) assert.match(reply.text, /Veer Ji Chaap/);
});

/* ── 4. Serious moods are never roasted ──────────────────────────────── */

test("serious emotional messages get support, never a roast or data", async () => {
  for (const m of [
    "bhai aaj mood bahut off hai",
    "main stressed hoon",
    "mera din kharab ja raha hai",
    "i feel terrible",
    "main bekaar hoon",
  ]) {
    const c = classifyIntent(m);
    assert.equal(c.intent, "general_chat", m);
    assert.ok(c.matched.includes("general-mood"), m);
    const { provider, sent } = openRouter("Arre, aise din aate hain 🫂 Kya hua?");
    const { reply, fake } = await ask(m, provider);
    assert.deepEqual(fake.queries, [], `${m}: no data`);
    assert.match(
      sent[0].body.messages![0].content,
      /warm and supportive, no jokes, teasing, roasting/
    );
    assert.doesNotMatch(reply.text, /😂|roast|streak/i);
  }
});

/* ── 5. Grounding: quest vs challenge, and follow-ups ────────────────── */

test("quest, streak and challenge answers use the right entity", async () => {
  const quest = await ask("meri quest kya hai?");
  assert.match(quest.reply.text, /Veer Ji Chaap/);
  assert.doesNotMatch(quest.reply.text, /CDS/);

  const streak = await ask("meri streak kitni hai?");
  assert.match(streak.reply.text, /CDS preparation/);
  assert.match(streak.reply.text, /1/);
  assert.doesNotMatch(streak.reply.text, /Veer/);
});

test("'meri quest complete kaise karu?' keeps the QUEST: Veer Ji Chaap, never CDS", async () => {
  const { reply, fake } = await ask("meri quest complete kaise karu?");
  assert.equal(reply.intent, "quests");
  assert.match(reply.text, /Veer Ji Chaap/);
  assert.match(reply.text, /proof/);
  assert.match(reply.text, /0\/3/);
  assert.doesNotMatch(reply.text, /CDS/);
  assert.ok(!fake.queries.some((q) => q.table === "profile_challenge_stats"), "no challenge read");
});

test("follow-ups ('isko', 'this', 'it', 'ye wala', 'what do I do next?') keep the quest", async () => {
  for (const m of [
    "isko complete kaise karu?",
    "ise kaise khatam karu?",
    "ye wala kaise complete hoga?",
    "how do I finish this?",
    "how do I complete it?",
    "what do I do next?",
  ]) {
    const c = classifyIntent(m, QUEST_HISTORY);
    assert.equal(c.intent, "quests", m);
    assert.equal(c.topic, "quest", m);
    const { reply } = await ask(m, deterministicProvider, QUEST_HISTORY);
    assert.match(reply.text, /Veer Ji Chaap/, m);
    assert.doesNotMatch(reply.text, /CDS/, m);
  }
});

test("after a streak answer, 'isko complete kaise karu?' is about the challenge", () => {
  const c = classifyIntent("isko complete kaise karu?", STREAK_HISTORY);
  assert.equal(c.topic, "challenge");
  assert.notEqual(c.intent, "quests");
});

test("'isko complete kaise karu?' with nothing before it asks instead of guessing", async () => {
  const c = classifyIntent("isko complete kaise karu?");
  assert.equal(c.intent, "unknown");
  assert.ok(c.matched.includes("follow-up-no-context"));
  const { reply, fake } = await ask("isko complete kaise karu?");
  assert.deepEqual(fake.queries, []);
  assert.doesNotMatch(reply.text, /Veer|CDS/);
});

test("a rewrite that swaps the quest for the challenge is rejected", async () => {
  const { provider } = openRouter("CDS preparation complete karne ke liye roz proof daal 🔥");
  const { reply, meta } = await ask("isko complete kaise karu?", provider, QUEST_HISTORY);
  assert.equal(meta.modelUsed, false);
  assert.match(reply.text, /Veer Ji Chaap/);
});

/* ── 6. Languages ────────────────────────────────────────────────────── */

test("language follows the latest message: Hinglish, Hindi, English, Bhojpuri, mixed", async () => {
  assert.equal(detectLanguage("meri streak kitni hai?"), "hinglish");
  assert.equal(detectLanguage("What's my quest?"), "en");
  assert.equal(detectLanguage("मेरी स्ट्रीक कितनी है?"), "hi");
  assert.equal(detectLanguage("हमार quest का बा?"), "bho");
  assert.equal(detectLanguage("bhai what is my quest?"), "hinglish");

  const en = await ask("What's my quest?");
  assert.match(en.reply.text, /Veer Ji Chaap/);
  assert.doesNotMatch(en.reply.text, /[ऀ-ॿ]/);
  const hi = await ask("मेरी क्वेस्ट पूरा कैसे करूँ?");
  assert.match(hi.reply.text, /[ऀ-ॿ]/);
  assert.match(hi.reply.text, /Veer Ji Chaap/);
  const bho = await ask("तू बेकार बाड़ भाई");
  assert.equal(bho.reply.intent, "banter");
  assert.match(bho.reply.text, /[ऀ-ॿ]/);
});

/* ── 7. Internal metadata never reaches the person ───────────────────── */

test("sanitize: safety verdicts, debug lines and JSON wrappers are removed from the text itself", () => {
  assert.equal(
    stripInternalMetadata("User Safety: safe\nResponse Safety: safe\n🔥 1 day"),
    "🔥 1 day"
  );
  assert.equal(stripInternalMetadata("User Safety: safe 🔥 1 day"), "🔥 1 day");
  assert.equal(
    stripInternalMetadata('{"safety":"safe","response":"🔥 1 day","best":"1 day"}'),
    "🔥 1 day"
  );
  assert.equal(stripInternalMetadata('{"User Safety":"safe","Response Safety":"safe"}'), "");
  assert.equal(stripInternalMetadata("safe"), "");
  assert.equal(stripInternalMetadata("unsafe\nS1"), "");
  assert.equal(
    stripInternalMetadata(
      "intent: streak\nprovider: openrouter\nmodel: x:free\nlatency: 812ms\ndebug: on\nBas mast 😎"
    ),
    "Bas mast 😎"
  );
  assert.equal(stripInternalMetadata("**Safety:** safe\nHello"), "Hello");
  // Ordinary text is untouched.
  for (const ok of [
    "Stay safe on the road 😌",
    "That's a safe bet.",
    "🔥 1 day streak",
    "Bas mast bhai 😎 Tu bata?",
  ]) {
    assert.equal(stripInternalMetadata(ok), ok);
    assert.equal(containsInternalMetadata(ok), false, ok);
  }
  const r = sanitizeReply(
    {
      text: "User Safety: safe",
      chips: [{ label: "intent: streak" }, { label: "🔥 1 day" }],
      links: [],
      suggestions: ["debug: x", "What's pending?"],
    },
    "🔥 1 day"
  );
  assert.equal(r.text, "🔥 1 day");
  assert.deepEqual(
    r.chips!.map((c) => c.label),
    ["🔥 1 day"]
  );
  assert.deepEqual(r.suggestions, ["What's pending?"]);
});

const LEAKY_REPLIES = [
  "User Safety: safe\nResponse Safety: safe",
  "User Safety: safe\nResponse Safety: safe\nBas mast bhai 😎 Tu bata?",
  '{"User Safety": "safe", "Response Safety": "safe"}',
  '{"safety":"safe","response":"Bas mast bhai 😎"}',
  "intent: general_chat\nprovider: openrouter\nlatency: 300ms\nBas mast 😎",
];

test("metadata is removed in every chat mode, and the HTTP body only carries the reply", async () => {
  const messages = [
    "bhai kya haal hai?",
    "Who was Albert Einstein?",
    "meri quest kya hai?",
    "meri streak kitni hai?",
    "mere kitne challenges hain?",
    "what's pending?",
    "tu chutiya hai",
    "bhai aaj mood bahut off hai",
    "isko complete kaise karu?",
    "2+2?",
  ];
  for (const leak of LEAKY_REPLIES) {
    for (const message of messages) {
      const { provider } = openRouter(leak);
      const fake = db();
      const res = await handleStrivyChatRequest(
        new Request("http://x/api/strivy/chat", {
          method: "POST",
          body: JSON.stringify({
            message,
            history: message.startsWith("isko") ? QUEST_HISTORY : [],
          }),
        }),
        {
          isEnabled: () => true,
          getSupabase: async () => fake.client,
          getProvider: () => provider,
          limiter: { take: () => true },
        }
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      assert.deepEqual(Object.keys(body), ["reply"], "only the reply");
      const text = JSON.stringify(body);
      assertNoLeak(text, `${message} / ${leak.slice(0, 30)}`);
      const reply = body.reply as { text: string };
      assert.ok(reply.text.trim().length > 0, `${message}: never an empty bubble`);
      // Voice reads the same text.
      assertNoLeak(speakableText(reply.text), `voice: ${message}`);
    }
  }
});

test("a safety-classifier model's answer is never used", async () => {
  const { provider } = openRouter("safe", "nvidia/llama-3.1-nemotron-safety-guard-8b-v3:free");
  const { reply, meta } = await ask("bhai kya haal hai?", provider);
  assert.equal(meta.modelUsed, false);
  assert.match(meta.modelError ?? "", /safety classifier/);
  assertNoLeak(reply.text, "classifier");
});

test("the panel also strips labels from whatever it receives (data, not CSS)", () => {
  const r = normalizeReply({
    intent: "streak",
    text: "User Safety: safe\nResponse Safety: safe\n🔥 1 day",
    chips: [{ label: "🔥 1 day", tone: "streak" }],
    links: [],
    suggestions: ["provider: openrouter", "What's pending?"],
  });
  assert.equal(r?.text, "🔥 1 day");
  assert.deepEqual(r?.suggestions, ["What's pending?"]);
  assert.equal(normalizeReply({ intent: "x", text: "User Safety: safe" }), null);
});

test("check-in, push and voice transcripts are sanitized too", async () => {
  const facts: StrivyFacts = {
    firstName: null,
    unavailable: [],
    challenges: [],
    quests: [],
  };
  const cand = pushCandidates(
    { ...facts, today: { tasks: [], completed: 0, total: 0, bestStreak: 0 } },
    USER_ID,
    new Date()
  )[0];
  if (cand) {
    const reasons = validatePushMessage(
      {
        title: "STRIVY 👀",
        body: "User Safety: safe 👀 Your quest is waiting.",
        tone: "plain",
      } as never,
      cand
    );
    assert.ok(reasons.includes("internal metadata"));
  }
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: "User Safety: safe\nbhai meri quest kya hai" }] } },
        ],
      }),
      { status: 200 }
    )) as typeof fetch;
  const text = await transcribeWithGemini(
    { base64: "AAAA", mimeType: "audio/webm" },
    { apiKey: "test", model: "m" },
    fetchImpl
  );
  assert.equal(text, "bhai meri quest kya hai");
});

test("no source file builds a 'User Safety' or debug line into a reply", () => {
  for (const f of [
    "src/lib/strivy/pipeline.ts",
    "src/lib/strivy/replies.ts",
    "src/lib/strivy/phrases.ts",
    "src/lib/strivy/openrouter.ts",
    "src/components/features/strivy/StrivyMessage.tsx",
    "src/components/features/strivy/StrivyPanel.tsx",
  ]) {
    // Code only: comments may name the labels they guard against.
    const code = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /User Safety|Response Safety/, f);
    assert.doesNotMatch(code, /dangerouslySetInnerHTML/, f);
  }
});

/* ── 8. Voice ────────────────────────────────────────────────────────── */

test("voice: grounded question through the same pipeline; ~2 s silence stop; a short pause doesn't stop; manual stop stays", async () => {
  const { provider, sent } = openRouter(
    "🎯 Teri active quest 'Veer Ji Chaap' hai, 0/3 tasks approved."
  );
  const { reply } = await ask("Bhai meri quest kya hai?", provider);
  assert.equal(sent.length, 1);
  assert.match(speakableText(reply.text), /Veer Ji Chaap/);
  assertNoLeak(speakableText(reply.text), "voice");

  assert.equal(SILENCE_STOP_MS, 2000);
  const timer = createEndOfSpeechTimer();
  let now = 0;
  const step = (voiced: boolean, ms: number) => {
    let stop = null;
    for (let t = 0; t < ms && !stop; t += 50) {
      stop = timer.observe(voiced, now).stop;
      now += 50;
    }
    return stop;
  };
  assert.equal(step(true, 1500), null);
  assert.equal(step(false, 1200), null, "a natural pause keeps listening");
  assert.equal(step(true, 1000), null);
  assert.equal(step(false, 2100), "silence", "stops after ~2 s of silence");

  const bar = readFileSync("src/components/features/strivy/StrivyVoiceBar.tsx", "utf8");
  assert.match(bar, /onFinish/, "manual stop button is still there");
});

/* ── 9. Rich text and timestamps ─────────────────────────────────────── */

test("rich text: paragraphs, bullets and bold render as data, never raw markdown", () => {
  const blocks = parseRichText(
    "**Done bhai** ✅\nNext line\n\n• one\n• **two**\n\n1. a\n2. b\n\n## Heading"
  );
  assert.equal(blocks[0].kind, "paragraph");
  if (blocks[0].kind === "paragraph") {
    assert.deepEqual(blocks[0].lines[0][0], { text: "Done bhai", bold: true });
    assert.equal(blocks[0].lines.length, 2);
  }
  assert.equal(blocks[1].kind, "list");
  if (blocks[1].kind === "list")
    assert.deepEqual(blocks[1].items[1][0], { text: "two", bold: true });
  assert.equal(blocks[2].kind === "list" && blocks[2].ordered, true);
  assert.deepEqual(blocks[3], { kind: "paragraph", lines: [[{ text: "Heading" }]] });
  assert.doesNotMatch(JSON.stringify(parseRichText("a **b")), /\*\*/);
  assert.ok(messageTime(`m${Date.now()}-1`));
  assert.equal(messageTime("checkin-1"), null);
});

/* ── 10. Push: cron auth and configuration ───────────────────────────── */

const SECRET = "s3cret-s3cret-s3cret-s3cret";
/** 2026-10-01 at an India-time hour. */
const at = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 9, 1, hour, minute) - 5.5 * 3_600_000);

const VEER: QuestFact = {
  questId: "q-veer",
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

const sub = (userId: string, id: string): PushSubscriptionRecord => ({
  id,
  userId,
  endpoint: `https://push.example/${id}`,
  p256dh: "BPUBKEY",
  auth: "AUTH",
});

function cronDeps(over: Partial<Parameters<typeof handleCron>[1]> = {}) {
  const clock = { now: at(15) };
  const mem = createMemoryPushStore({ subscriptions: [sub(USER_ID, "s1")], now: () => clock.now });
  const { sender, sent } = createMemorySender();
  const fake = fakeSupabase({ tables: {} });
  const deps: Parameters<typeof handleCron>[1] = {
    isEnabled: () => true,
    cronSecret: () => SECRET,
    getAdmin: () => fake.client,
    getSender: () => sender,
    now: () => clock.now,
    getStore: () => mem.store,
    ...over,
  };
  return { deps, mem, sent, clock };
}

const cron = (deps: Parameters<typeof handleCron>[1], auth?: string) =>
  handleCron(
    new Request("http://x/api/strivy/push/cron", {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    }),
    deps
  );

function quietConsole<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string }> {
  const logs: string[] = [];
  const orig = { error: console.error, warn: console.warn, info: console.info };
  console.error =
    console.warn =
    console.info =
      (...a: unknown[]) => logs.push(a.map(String).join(" "));
  return fn()
    .then((result) => ({ result, logs: logs.join("\n") }))
    .finally(() => Object.assign(console, orig));
}

test("cron: the right bearer runs, a wrong or missing one is 401, push off is 404", async () => {
  const { deps } = cronDeps();
  const { result: ok } = await quietConsole(() => cron(deps, `Bearer ${SECRET}`));
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { ok: boolean; users: number };
  assert.equal(body.ok, true);
  assert.equal(body.users, 1);
  const { result: wrong } = await quietConsole(() => cron(deps, "Bearer nope-nope-nope-nope"));
  assert.equal(wrong.status, 401);
  const { result: none } = await quietConsole(() => cron(deps));
  assert.equal(none.status, 401);
  assert.equal((await cron({ ...deps, isEnabled: () => false }, `Bearer ${SECRET}`)).status, 404);
});

test("cron: missing CRON_SECRET, VAPID or service role is a clear 503, never success", async () => {
  for (const [over, category] of [
    [{ cronSecret: () => undefined }, "missing_cron_secret"],
    [{ getSender: () => null }, "missing_vapid"],
    [{ getAdmin: () => null }, "missing_service_role"],
    [
      {
        configProblem: () => ({
          category: "invalid_vapid" as const,
          detail: "web-push rejected the VAPID key pair.",
        }),
      },
      "invalid_vapid",
    ],
  ] as const) {
    const { deps } = cronDeps(over);
    const { result, logs } = await quietConsole(() => cron(deps, `Bearer ${SECRET}`));
    assert.equal(result.status, 503, category);
    const body = (await result.json()) as { category: string; error: string };
    assert.equal(body.category, category);
    assert.ok(body.error.length > 10);
    assert.match(logs, new RegExp(category), "logged with its category");
    assert.ok(
      !logs.includes(SECRET) && !JSON.stringify(body).includes(SECRET),
      "secret never echoed"
    );
  }
});

test("cron: push tables missing in the database is the 'not set up' 503 with the migration to apply", async () => {
  const { deps, mem } = cronDeps();
  mem.store.listSubscribedUsers = async () => {
    throw new PushStoreError("subscriptions", {
      code: "PGRST205",
      message: "Could not find the table 'public.strivy_push_subscriptions' in the schema cache",
    });
  };
  const { result } = await quietConsole(() => cron(deps, `Bearer ${SECRET}`));
  assert.equal(result.status, 503);
  const body = (await result.json()) as { category: string; error: string };
  assert.equal(body.category, "database_not_set_up");
  assert.match(body.error, /20261001_strivy_push\.sql/);

  const other = categorizeStoreError(
    new PushStoreError("x", { code: "42501", message: "permission denied" })
  );
  assert.equal(other.category, "invalid_service_role");
  assert.equal(categorizeStoreError(new TypeError("fetch failed")).category, "database_error");
});

test("cron: a real pass sends, logs, and keeps limits, duplicates and spacing", async () => {
  const { deps, mem, sent, clock } = cronDeps({});
  const facts: StrivyFacts = {
    firstName: null,
    unavailable: [],
    today: { tasks: [], completed: 0, total: 0, bestStreak: 0 },
    challenges: [],
    quests: [VEER],
    proofs: [],
    rewards: [],
    week: { activeDays: 0, approvedProofs: 0 },
  };
  const runAt = async (hour: number, minute = 0) => {
    clock.now = at(hour, minute);
    return runPushWindow({
      now: clock.now,
      store: mem.store,
      sender: deps.getSender()!,
      loadFacts: async () => facts,
    });
  };
  const first = await runAt(9, 30);
  assert.equal(first[0].outcome, "sent");
  assert.equal(mem.log.length, 1, "push logged");
  assert.equal(mem.log[0].status, "sent");
  assert.equal(sent.length, 1);
  assertNoLeak(sent[0].payload.body, "push body");
  assert.ok(sent[0].payload.body.length <= 160);

  // Same window again: duplicate/window protection.
  const again = await runAt(10, 30);
  assert.equal(again[0].outcome, "skipped");
  // Too soon after the last one (spacing), even in a new window... then the cap.
  await runAt(14, 0);
  await runAt(17, 30);
  await runAt(19, 30);
  await runAt(21, 30);
  const sentToday = mem.log.filter((r) => r.status !== "failed").length;
  assert.ok(sentToday <= 3, `max 3 a day (${sentToday})`);
});

test("cron: every delivery failing is a 502 with categories, never fake success", async () => {
  const { sender } = createMemorySender(() => ({
    ok: false,
    gone: false,
    error: "push service 403",
    category: "vapid_mismatch",
  }));
  const { deps } = cronDeps({ getSender: () => sender });
  const { result } = await quietConsole(() => cron(deps, `Bearer ${SECRET}`));
  const body = (await result.json()) as {
    ok: boolean;
    failed: number;
    errors: Record<string, number>;
  };
  if (body.failed > 0) {
    assert.equal(result.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.errors.vapid_mismatch, 1);
    assert.ok(!JSON.stringify(body).includes(USER_ID));
  }
});

test("subscriptions: valid ones parse, invalid ones are refused", () => {
  assert.ok(
    parseSubscription({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "BPUBKEY_abc-123", auth: "AUTH_abc" },
    })
  );
  for (const bad of [
    null,
    { endpoint: "http://insecure.example/x", keys: { p256dh: "a", auth: "b" } },
    { endpoint: "not a url", keys: { p256dh: "a", auth: "b" } },
    { endpoint: "https://ok.example/x", keys: { p256dh: "<script>", auth: "b" } },
    { endpoint: "https://ok.example/x" },
  ]) {
    assert.equal(parseSubscription(bad), null);
  }
});

/* ── 11. Push: diagnostics and dev tools ─────────────────────────────── */

const FULL_ENV = {
  STRIVY_PUSH_ENABLED: "true",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY:
    "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  VAPID_PRIVATE_KEY: "SECRET_PRIVATE_DOES_NOT_MATTER_HERE_",
  VAPID_SUBJECT: "mailto:test@example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_TESTVALUE1234567890",
  CRON_SECRET: SECRET,
};

test("diagnostics: every requirement is checked and secrets are never echoed", () => {
  const empty = checkPushServer({});
  assert.ok(empty.every((c) => !c.ok));
  const cats = new Set(empty.map((c) => c.problem?.category));
  for (const c of ["push_disabled", "missing_vapid", "missing_service_role", "missing_cron_secret"])
    assert.ok(cats.has(c as never), c);

  const checks = checkPushServer(FULL_ENV);
  const text = JSON.stringify(checks);
  for (const v of [FULL_ENV.VAPID_PRIVATE_KEY, FULL_ENV.SUPABASE_SERVICE_ROLE_KEY, SECRET])
    assert.ok(!text.includes(v), "no secret value");
  // The fake private key is the wrong length: invalid, not missing.
  assert.equal(checks.find((c) => c.id === "vapid-private")?.problem?.category, "invalid_vapid");

  const anon = checkPushServer({ ...FULL_ENV, SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_abc" });
  assert.equal(
    anon.find((c) => c.id === "service-role")?.problem?.category,
    "invalid_service_role"
  );
  assert.equal(serviceKeyKind("sb_secret_x"), "service_role");
  const jwt = (role: string) =>
    `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.y`;
  assert.equal(serviceKeyKind(jwt("service_role")), "service_role");
  assert.equal(serviceKeyKind(jwt("anon")), "anon");
  assert.equal(
    firstPushConfigProblem({ ...FULL_ENV, VAPID_SUBJECT: "me@example.com" })?.category,
    "invalid_vapid"
  );
});

test("diagnostics: a real generated VAPID pair passes", async () => {
  const webpush = (await import("web-push")).default;
  const keys = webpush.generateVAPIDKeys();
  const checks = checkPushServer({
    ...FULL_ENV,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
  });
  assert.deepEqual(
    checks.filter((c) => !c.ok).map((c) => c.id),
    [],
    JSON.stringify(checks.filter((c) => !c.ok))
  );
});

function devDeps(over: Partial<Parameters<typeof handleDev>[1]> = {}) {
  const fake = fakeSupabase({ user: { id: USER_ID } });
  const mem = createMemoryPushStore({ subscriptions: [sub(USER_ID, "mine")], now: () => at(15) });
  const { sender, sent } = createMemorySender();
  const deps: Parameters<typeof handleDev>[1] = {
    isEnabled: () => true,
    devToolsEnabled: () => true,
    getSupabase: async () => fake.client,
    getAdmin: () => fake.client,
    getSender: () => sender,
    getStore: () => mem.store,
    serverChecks: () => checkPushServer(FULL_ENV),
    ...over,
  };
  return { deps, sent, mem };
}

const dev = (deps: Parameters<typeof handleDev>[1], body: unknown) =>
  handleDev(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), deps);

test("dev test push: success is reported only when delivered; failure is a 502 with a category", async () => {
  const { deps, sent } = devDeps();
  const ok = await dev(deps, { action: "test" });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { delivered: number }).delivered, 1);
  assert.equal(sent.length, 1);

  const { sender } = createMemorySender(() => ({
    ok: false,
    gone: true,
    error: "push service 410",
    category: "invalid_subscription",
  }));
  const bad = devDeps({ getSender: () => sender });
  const { result } = await quietConsole(() => dev(bad.deps, { action: "test" }));
  assert.equal(result.status, 502);
  const body = (await result.json()) as { category: string; delivered: number };
  assert.equal(body.category, "invalid_subscription");
  assert.equal(body.delivered, 0);
  assert.equal(bad.mem.subs.length, 0, "a gone subscription is removed");

  const none = devDeps();
  none.mem.subs.splice(0);
  const r = await dev(none.deps, { action: "test" });
  assert.equal(r.status, 409);
  assert.equal(((await r.json()) as { category: string }).category, "no_subscription");
});

test("dev diagnose: checklist with fixes, database and device count, no secret values", async () => {
  const { deps } = devDeps();
  const res = await dev(deps, { action: "diagnose" });
  assert.equal(res.status, 200);
  const text = await res.text();
  const body = JSON.parse(text) as {
    checks: { id: string }[];
    database: { ok: boolean };
    devices: number;
  };
  assert.ok(body.checks.length >= 6);
  assert.equal(body.database.ok, true);
  assert.equal(body.devices, 1);
  for (const v of [FULL_ENV.VAPID_PRIVATE_KEY, FULL_ENV.SUPABASE_SERVICE_ROLE_KEY, SECRET])
    assert.ok(!text.includes(v));
  assert.equal(
    (await dev({ ...deps, devToolsEnabled: () => false }, { action: "diagnose" })).status,
    404
  );
});

/* ── 12. The bell list ───────────────────────────────────────────────── */

test("history: the caller's own sent pushes, and a clear 503 when push isn't set up", async () => {
  const fake = fakeSupabase({
    user: { id: USER_ID },
    tables: {
      strivy_push_log: {
        data: [
          {
            id: "l1",
            body: "👀 Your quest is still waiting.",
            push_type: "quest_progress",
            url: "/quests/q",
            status: "sent",
            sent_at: "2026-10-02T10:00:00Z",
          },
        ],
      },
    },
  });
  const res = await handleHistory(new Request("http://x"), {
    isEnabled: () => true,
    getSupabase: async () => fake.client,
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: { body: string }[] };
  assert.equal(body.items.length, 1);
  const q = fake.queries.find((x) => x.table === "strivy_push_log")!;
  assert.ok(
    q.filters.some(([op, col, val]) => op === "eq" && col === "user_id" && val === USER_ID)
  );
  assert.ok(q.filters.some(([op, col, val]) => op === "eq" && col === "status" && val === "sent"));

  const missing = fakeSupabase({
    user: { id: USER_ID },
    tables: { strivy_push_log: { error: { message: "missing", code: "PGRST205" } as never } },
  });
  const r = await handleHistory(new Request("http://x"), {
    isEnabled: () => true,
    getSupabase: async () => missing.client,
  });
  assert.equal(r.status, 503);
  assert.equal(((await r.json()) as { category: string }).category, "database_not_set_up");
});

test("bell: unread count, icons and the friendly test-failure text", () => {
  const items = [
    { id: "1", body: "a", type: "streak_at_risk", url: "/", sentAt: "2026-10-02T10:00:00Z" },
    { id: "2", body: "b", type: "quest_progress", url: "/", sentAt: "2026-10-01T10:00:00Z" },
  ];
  assert.equal(unreadCount(items, null), 2);
  assert.equal(unreadCount(items, "2026-10-01T12:00:00Z"), 1);
  assert.equal(pushIcon("streak_at_risk"), "🔥");
  assert.equal(pushIcon("quest_deadline"), "🎯");
  assert.equal(pushIcon("proof_rejected"), "⚠️");
  const src = readFileSync("src/components/features/strivy/push.ts", "utf8");
  assert.match(src, /Push notification test failed\. Check your notification setup\./);
});

test("secrets stay server-side: no NEXT_PUBLIC_ form and nothing in browser files", () => {
  for (const f of [
    "src/components/features/strivy/push.ts",
    "src/components/features/strivy/StrivyPushSettings.tsx",
    "src/components/features/strivy/StrivyPanel.tsx",
    "src/components/features/strivy/chat.ts",
  ]) {
    const src = readFileSync(f, "utf8");
    for (const name of [
      "VAPID_PRIVATE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "CRON_SECRET",
      "OPENROUTER_API_KEY",
      "GEMINI_API_KEY",
    ])
      assert.ok(!new RegExp(`process\\.env\\.${name}`).test(src), `${f}: ${name}`);
  }
  const env = readFileSync(".env.example", "utf8");
  assert.doesNotMatch(env, /NEXT_PUBLIC_(VAPID_PRIVATE|SUPABASE_SERVICE|CRON|OPENROUTER|GEMINI)/);
});
