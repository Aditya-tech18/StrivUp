/**
 * OpenRouter migration: STRIVY's text chat runs on OpenRouter's FREE router.
 *
 * OpenRouter is faked with an injected fetch that records exactly what STRIVY
 * sends and replies the way OpenRouter's chat-completions API does. The
 * container never calls the real API, and no real key is used.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FREE_ROUTER_MODEL,
  createOpenRouterProvider,
  isFreeModelId,
  maskKey,
  openRouterConfigFromEnv,
  type OpenRouterConfig,
} from "@/lib/strivy/openrouter";
import { classifyIntent, intentCategory } from "@/lib/strivy/intents";
import { detectLanguage, isRomanBhojpuri } from "@/lib/strivy/language";
import { getStrivyModelProvider, deterministicProvider } from "@/lib/strivy/model";
import { handleStrivyChatRequest, runStrivyPipeline } from "@/lib/strivy/pipeline";
import { handleLlmHealthRequest } from "@/lib/strivy/health";
import { SILENCE_STOP_MS, createEndOfSpeechTimer } from "@/lib/strivy/voice/silence";
import { speakableText } from "@/lib/strivy/voice/speech";
import type { ChatTurn } from "@/lib/strivy/types";
import { USER_ID, fakeSupabase } from "./helpers";

/* ── A fake OpenRouter ──────────────────────────────────────────────────── */

const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef";

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: {
    model?: string;
    messages?: { role: string; content: string }[];
    max_tokens?: number;
    stream?: boolean;
    provider?: { max_price?: { prompt: number; completion: number } };
  };
}

type Reply =
  | { status?: number; json?: unknown; text?: string; throws?: boolean; delayMs?: number }
  | ((sent: Sent) => { status?: number; json?: unknown; text?: string });

function completion(content: string, extra: Record<string, unknown> = {}) {
  return {
    json: {
      id: "gen-1",
      model: "some-lab/some-model:free",
      choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 150, completion_tokens: 20, cost: 0 },
      ...extra,
    },
  };
}

function fakeOpenRouter(...replies: Reply[]) {
  const sent: Sent[] = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const s: Sent = {
      url: String(url),
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    };
    sent.push(s);
    const r = replies[Math.min(i++, replies.length - 1)] ?? completion("ok");
    const out = typeof r === "function" ? r(s) : r;
    if ("throws" in out && out.throws) throw new TypeError("fetch failed");
    const delayMs = "delayMs" in out && typeof out.delayMs === "number" ? out.delayMs : 0;
    if (delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }
    const body = out.text ?? JSON.stringify(out.json ?? {});
    return new Response(body, {
      status: out.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, sent };
}

const CONFIG: OpenRouterConfig = {
  apiKey: KEY,
  model: FREE_ROUTER_MODEL,
  timeoutMs: 2000,
  baseUrl: "https://openrouter.ai/api/v1",
};

function provider(fetchImpl: typeof fetch, logs: string[] = [], config = CONFIG) {
  return createOpenRouterProvider(config, { fetch: fetchImpl, log: (m) => logs.push(m) });
}

/* ── Fake Supabase with one challenge and one quest ─────────────────────── */

const CHALLENGE_ROW = {
  challenge_id: "c1",
  title: "30 Days of Running",
  status: "active",
  current_day: 12,
  duration_days: 30,
  current_streak: 11,
  longest_streak: 14,
  consistency_pct: 91.7,
  joined_at: "2026-09-16T00:00:00Z",
};

const QUEST_ROW = {
  quest_id: "q9",
  verification_status: "pending",
  completed_at: null,
  joined_at: "2026-09-20T00:00:00Z",
  quest: {
    title: "Veer Ji Chaap",
    business_name: "Veer Ji",
    location_name: null,
    ends_at: "2026-10-28T12:00:00Z",
    end_date: null,
  },
};

function db() {
  return fakeSupabase({
    user: { id: USER_ID },
    tables: {
      profiles: { data: [{ full_name: "Aryan Singh", username: "aryan" }] },
      profile_challenge_stats: { data: [CHALLENGE_ROW] },
      challenge_participants: { data: [] },
      quest_participants: { data: [QUEST_ROW] },
      quest_tasks: {
        data: ["t1", "t2", "t3"].map((id) => ({ id, quest_id: "q9", is_required: true })),
      },
      quest_task_submissions: { data: [] },
    },
  });
}

async function ask(
  message: string,
  p: Parameters<typeof runStrivyPipeline>[0]["provider"],
  history: ChatTurn[] = []
) {
  const fake = db();
  const result = await runStrivyPipeline({
    supabase: fake.client,
    userId: USER_ID,
    message,
    history,
    provider: p,
  });
  return { ...result, fake };
}

/* ── 1. Free only ───────────────────────────────────────────────────────── */

test("only free models: the free router or a ':free' id", () => {
  for (const id of [
    "openrouter/free",
    "OpenRouter/Free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-3-27b-it:free",
  ]) {
    assert.equal(isFreeModelId(id), true, id);
  }
  for (const id of [
    "openai/gpt-5",
    "anthropic/claude-sonnet-4",
    "openrouter/auto",
    "meta-llama/llama-3.3-70b-instruct",
    "free",
    ":free",
    "x/y:free:extended",
  ]) {
    assert.equal(isFreeModelId(id), false, id);
  }
});

test("config: the free router by default; a paid OPENROUTER_MODEL is ignored, never used", () => {
  const def = openRouterConfigFromEnv({ OPENROUTER_API_KEY: KEY });
  assert.equal(def.config?.model, "openrouter/free");
  assert.equal(def.config?.timeoutMs, 30000);

  const free = openRouterConfigFromEnv({
    OPENROUTER_API_KEY: KEY,
    OPENROUTER_MODEL: "meta-llama/llama-3.3-70b-instruct:free",
  });
  assert.equal(free.config?.model, "meta-llama/llama-3.3-70b-instruct:free");
  assert.equal(free.warning, null);

  const paid = openRouterConfigFromEnv({
    OPENROUTER_API_KEY: KEY,
    OPENROUTER_MODEL: "openai/gpt-5",
  });
  assert.equal(paid.config?.model, "openrouter/free");
  assert.match(paid.warning ?? "", /not a free model.*ignored/);

  assert.equal(
    openRouterConfigFromEnv({ OPENROUTER_API_KEY: KEY, STRIVY_LLM_TIMEOUT_MS: "999999" }).config
      ?.timeoutMs,
    60000
  );
  // A caller can't build a provider for a paid model either.
  assert.throws(() => createOpenRouterProvider({ ...CONFIG, model: "openai/gpt-5" }), /non-free/);
});

test("every request is pinned to a free model with a $0 price cap, from the server", async () => {
  const { fetchImpl, sent } = fakeOpenRouter(completion("All good bhai, tu suna?"));
  await ask("bhai kya haal hai?", provider(fetchImpl));
  assert.equal(sent.length, 1);
  const s = sent[0];
  assert.equal(s.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(s.body.model, "openrouter/free");
  assert.deepEqual(s.body.provider?.max_price, { prompt: 0, completion: 0 });
  assert.equal(s.body.stream, false);
  assert.equal(s.headers.Authorization, `Bearer ${KEY}`);
});

test("a reply that reports a cost switches the model off for good", async () => {
  const logs: string[] = [];
  const { fetchImpl, sent } = fakeOpenRouter(
    completion("Mast hu!", { usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0004 } })
  );
  const p = provider(fetchImpl, logs);
  const first = await ask("bhai kya haal hai?", p);
  assert.equal(first.meta.modelUsed, false);
  assert.equal(first.meta.fallbackReason, "model unavailable");
  assert.ok(logs.some((l) => /reported a cost/.test(l)));
  const second = await ask("bhai kya haal hai?", p);
  assert.equal(second.meta.fallbackReason, "model unavailable");
  assert.equal(sent.length, 1, "no further calls after a cost");
});

test("if OpenRouter refuses the price cap, the request is retried once without it, still free", async () => {
  const { fetchImpl, sent } = fakeOpenRouter(
    { status: 400, json: { error: { message: "Invalid provider.max_price" } } },
    completion("Sab badhiya, tu bata?")
  );
  const { meta } = await ask("bhai kya haal hai?", provider(fetchImpl));
  assert.equal(meta.modelUsed, true);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].body.provider, undefined);
  assert.equal(sent[1].body.model, "openrouter/free");
});

/* ── 2. Provider selection and missing key ──────────────────────────────── */

test("missing API key: built-in replies, no network, a clear server log", async () => {
  const logs: string[] = [];
  const p = getStrivyModelProvider(
    { OLLAMA_MODEL: "llama3.2:3b", STRIVY_LLM_ENABLED: "true" },
    (m) => logs.push(m)
  );
  assert.equal(p, deterministicProvider);
  assert.ok(logs.some((l) => /OPENROUTER_API_KEY is not set/.test(l)));
  const { reply, meta } = await ask("What's my quest?", p);
  assert.equal(meta.fallbackReason, "model off");
  assert.match(reply.text, /Veer Ji Chaap/);
  const hi = await ask("bhai kya haal hai?", p);
  assert.ok(hi.reply.text.length > 0);
});

test("a paid OPENROUTER_MODEL still yields the free router", () => {
  const logs: string[] = [];
  const p = getStrivyModelProvider(
    { OPENROUTER_API_KEY: "sk-or-v1-selection-test", OPENROUTER_MODEL: "anthropic/claude-opus" },
    (m) => logs.push(m)
  );
  assert.equal(p.name, "openrouter");
  assert.ok(logs.some((l) => /not a free model/.test(l)));
  assert.ok(!logs.join(" ").includes("sk-or-v1-selection-test"), "the key is never logged");
});

test("maskKey never shows the whole key", () => {
  assert.equal(maskKey(KEY), "sk-or…cdef");
  assert.equal(maskKey("short"), "****");
});

/* ── 3. Casual conversation ─────────────────────────────────────────────── */

const CASUAL: [string, RegExp][] = [
  ["bhai kya haal hai?", /casual Hinglish/],
  ["Hey Strivy, how are you?", /Reply in casual English\./],
  ["bhai ek funny jawab de", /casual Hinglish/],
  ["bhai aaj mood thoda off hai", /casual Hinglish/],
  ["ka ba haal ba bhai?", /Bhojpuri written in English letters/],
  ["hello", /Reply in casual English\./],
  ["hi", /Reply in casual English\./],
  ["good morning", /Reply in casual English\./],
  ["what's up?", /Reply in casual English\./],
];

test("casual messages: CASUAL_CHAT, zero DB reads, one compact OpenRouter call with no facts", async () => {
  for (const [message, style] of CASUAL) {
    const { fetchImpl, sent } = fakeOpenRouter(completion("Haha, sab mast! Tu suna?"));
    const { meta, reply, fake } = await ask(message, provider(fetchImpl));
    assert.equal(intentCategory(classifyIntent(message)), "CASUAL_CHAT", message);
    assert.equal(meta.mode, "chat", message);
    assert.deepEqual(fake.queries, [], `${message}: no Supabase reads`);
    assert.equal(sent.length, 1, `${message}: exactly one model call`);
    const messages = sent[0].body.messages!;
    assert.equal(messages.length, 2, message);
    assert.ok(messages[0].content.length < 900, `${message}: compact system prompt`);
    assert.match(messages[0].content, style, message);
    assert.equal(messages[1].content, message.replace(/\s+/g, " "));
    assert.doesNotMatch(JSON.stringify(messages), /FACTS|CORRECT ANSWER|Veer Ji|30 Days|streak is/);
    assert.equal(meta.modelUsed, true, message);
    assert.equal(reply.text, "Haha, sab mast! Tu suna?");
  }
});

test("'mood off' is casual: supportive line, never progress or streak data", async () => {
  for (const message of [
    "bhai aaj mood thoda off hai",
    "aaj mood off hai",
    "I feel sad today",
    "feeling low today",
    "aaj mann nahi lag raha",
    "आज मूड ऑफ है",
  ]) {
    const r = classifyIntent(message);
    assert.equal(r.intent, "general_chat", message);
    assert.equal(intentCategory(r), "CASUAL_CHAT", message);
    // Even without a model, the built-in reply reads nothing and states nothing.
    const { reply, fake } = await ask(message, deterministicProvider);
    assert.deepEqual(fake.queries, [], message);
    assert.doesNotMatch(
      reply.text,
      /streak|Veer Ji|30 Days|\d+\/\d+|CDS/i,
      `${message}: ${reply.text}`
    );
  }
});

test("a model that drags data into small talk is rejected", async () => {
  const { fetchImpl } = fakeOpenRouter(
    completion("Arre, your CDS preparation streak is 1 day, chill!")
  );
  const { meta, reply } = await ask("bhai aaj mood thoda off hai", provider(fetchImpl));
  assert.equal(meta.modelUsed, false);
  assert.doesNotMatch(reply.text, /streak|CDS/i);
});

test("the person's own data ask still wins inside a casual message", () => {
  assert.equal(classifyIntent("aaj mood off hai, meri streak kitni hai?").intent, "streak");
});

/* ── 4. Grounded questions ──────────────────────────────────────────────── */

const GROUNDED: [string, string, RegExp][] = [
  ["What's my quest?", "QUEST", /Veer Ji Chaap/],
  ["Meri quest kya hai?", "QUEST", /Veer Ji Chaap/],
  ["bhai meri quest kya hai?", "QUEST", /Veer Ji Chaap/],
  ["Meri streak kitni hai?", "STREAK", /11/],
  ["what's pending?", "PENDING", /Veer Ji Chaap/],
  ["what did I complete today?", "PENDING", /./],
  ["mere kitne challenges hain?", "CHALLENGE", /30 Days of Running/],
];

test("grounded questions read Supabase first and route to the right category", async () => {
  for (const [message, category, fact] of GROUNDED) {
    assert.equal(intentCategory(classifyIntent(message)), category, message);
    const { reply, meta, fake } = await ask(message, deterministicProvider);
    assert.equal(meta.mode, "rewrite", message);
    assert.ok(fake.queries.length > 0, `${message}: reads data`);
    assert.match(reply.text, fact, `${message}: ${reply.text}`);
  }
});

test("only the facts for the question are sent, with the grounded draft", async () => {
  const { fetchImpl, sent } = fakeOpenRouter(
    completion("Bhai tera quest 'Veer Ji Chaap' hai, 0/3 done.")
  );
  const { meta } = await ask("Meri quest kya hai?", provider(fetchImpl));
  const user = sent[0].body.messages![1].content;
  assert.match(user, /FACTS \(the only true information\)/);
  assert.match(user, /Veer Ji Chaap/);
  assert.doesNotMatch(user, /30 Days of Running/, "challenge data isn't sent for a quest question");
  assert.doesNotMatch(user, /q9|00000000-/, "no ids");
  assert.equal(meta.mode, "rewrite");
});

test("the LLM cannot invent grounded facts: invented numbers and names fall back to the draft", async () => {
  const inventions: [string, string][] = [
    ["Meri quest kya hai?", "Tera quest 'Momo Mania' hai, 2/3 done 🔥"],
    ["Meri streak kitni hai?", "Bhai 25 din ki streak hai 🔥"],
    ["What's my quest?", "Your quest Veer Ji Chaap ends on 5 Nov and pays ₹500!"],
    ["what's pending?", "Nothing pending, you completed everything today ✅"],
  ];
  for (const [message, invented] of inventions) {
    const { fetchImpl } = fakeOpenRouter(completion(invented));
    const { reply, meta } = await ask(message, provider(fetchImpl));
    assert.equal(meta.modelUsed, false, `${message}: ${invented}`);
    assert.equal(meta.fallbackReason, "failed the grounding check");
    assert.notEqual(reply.text, invented);
  }
});

test("a faithful rewrite is used", async () => {
  const { fetchImpl } = fakeOpenRouter(
    completion("'30 Days of Running' pe 11 din ki streak chal rahi hai 🔥")
  );
  const { reply, meta } = await ask("Meri streak kitni hai?", provider(fetchImpl));
  assert.equal(meta.modelUsed, true, JSON.stringify(meta.groundingRejected));
  assert.match(reply.text, /11 din/);
});

test("data that can't be loaded is said honestly, never guessed", async () => {
  const fake = fakeSupabase({
    user: { id: USER_ID },
    tables: {
      quest_participants: { error: { message: "boom" } },
      profile_challenge_stats: { error: { message: "boom" } },
    },
  });
  const { fetchImpl } = fakeOpenRouter(completion("Your quest is Veer Ji Chaap, 0/3!"));
  const { reply, meta } = await runStrivyPipeline({
    supabase: fake.client,
    userId: USER_ID,
    message: "meri quest kya hai?",
    history: [],
    provider: provider(fetchImpl),
  });
  assert.equal(meta.modelUsed, false);
  assert.match(reply.text, /couldn't|load nahi/i);
});

/* ── 5. Failures ────────────────────────────────────────────────────────── */

test("OpenRouter failures: clean fallback, no API error shown, technical reason logged server-side only", async () => {
  const cases: [Reply, string][] = [
    [{ throws: true }, "model unavailable"],
    [{ status: 500, json: { error: { message: "Internal upstream error" } } }, "model error"],
    [
      { status: 429, json: { error: { message: "Rate limit exceeded: free-models-per-day" } } },
      "model unavailable",
    ],
    [
      { status: 401, json: { error: { message: "No auth credentials found" } } },
      "model unavailable",
    ],
    [{ status: 402, json: { error: { message: "Insufficient credits" } } }, "model unavailable"],
    [{ text: "<html>bad gateway</html>" }, "model error"],
    [{ json: { error: { message: "Provider returned error", code: 502 } } }, "model error"],
    [completion("   "), "empty model reply"],
    [{ json: { choices: [] } }, "model error"],
  ];
  for (const [r, reason] of cases) {
    const { fetchImpl } = fakeOpenRouter(r);
    const { reply, meta } = await ask("Meri quest kya hai?", provider(fetchImpl));
    assert.equal(meta.fallbackReason, reason, JSON.stringify(r));
    assert.match(reply.text, /Veer Ji Chaap/, "still the grounded answer");
    assert.doesNotMatch(reply.text, /error|credits|rate limit|openrouter|upstream|gateway/i);
  }
});

test("timeouts: the draft is shown, the request is cancelled", async () => {
  const { fetchImpl } = fakeOpenRouter({ delayMs: 5000, ...completion("late") });
  const started = Date.now();
  const { reply, meta } = await ask(
    "Meri quest kya hai?",
    provider(fetchImpl, [], { ...CONFIG, timeoutMs: 300 })
  );
  assert.ok(Date.now() - started < 2000);
  assert.equal(meta.fallbackReason, "model timed out");
  assert.match(reply.text, /Veer Ji Chaap/);
});

test("after a 429 the model is skipped for a while instead of hammering the free tier", async () => {
  const { fetchImpl, sent } = fakeOpenRouter(
    { status: 429, json: { error: { message: "Rate limit" } } },
    completion("Sab mast!")
  );
  const p = provider(fetchImpl);
  await ask("bhai kya haal hai?", p);
  const second = await ask("bhai kya haal hai?", p);
  assert.equal(sent.length, 1);
  assert.equal(second.meta.fallbackReason, "model unavailable");
});

test("the API response and errors never carry the key or provider details", async () => {
  const { fetchImpl } = fakeOpenRouter({
    status: 500,
    json: { error: { message: `bad key ${KEY}` } },
  });
  const fake = db();
  const res = await handleStrivyChatRequest(
    new Request("http://localhost/api/strivy/chat", {
      method: "POST",
      body: JSON.stringify({ message: "meri quest kya hai?" }),
    }),
    {
      isEnabled: () => true,
      getSupabase: async () => fake.client,
      getProvider: () => provider(fetchImpl),
      limiter: { take: () => true },
    }
  );
  const text = await res.text();
  assert.equal(res.status, 200);
  const body = JSON.parse(text);
  assert.deepEqual(Object.keys(body), ["reply"]);
  // reply.intent is a routing tag the panel sends back for follow-ups; it is
  // never rendered. Everything else is what the person sees.
  const shown = { ...body.reply };
  delete shown.intent;
  assert.deepEqual(Object.keys(shown).sort(), ["chips", "links", "suggestions", "text"]);
  assert.doesNotMatch(
    JSON.stringify(shown),
    /sk-or|openrouter|ollama|provider|intent|latency|modelUsed|fallback|debug|model used/i
  );
});

test("health: production says only on/off and makes no OpenRouter call", async () => {
  const { fetchImpl, sent } = fakeOpenRouter({ json: { data: { is_free_tier: true } } });
  const fake = db();
  const res = await handleLlmHealthRequest({
    isEnabled: () => true,
    getSupabase: async () => fake.client,
    getProvider: () => provider(fetchImpl),
    detailed: () => false,
  });
  assert.deepEqual(await res.json(), { enabled: true, ok: true, provider: "openrouter" });
  assert.equal(sent.length, 0);

  const dev = await handleLlmHealthRequest({
    isEnabled: () => true,
    getSupabase: async () => fake.client,
    getProvider: () => provider(fetchImpl),
    detailed: () => true,
  });
  const d = await dev.json();
  assert.equal(d.freeTier, true);
  assert.equal(d.model, "openrouter/free");
  assert.doesNotMatch(JSON.stringify(d), /sk-or/);
});

/* ── 6. Languages ───────────────────────────────────────────────────────── */

test("multilingual routing and Bhojpuri detection", () => {
  const cases: [string, string, string][] = [
    ["meri streak kitni hai?", "STREAK", "hinglish"],
    ["मेरी स्ट्रीक कितनी है?", "STREAK", "hi"],
    ["हमार quest का बा?", "QUEST", "bho"],
    ["what's my quest?", "QUEST", "en"],
    ["bhai kya haal hai?", "CASUAL_CHAT", "hinglish"],
    ["ka ba haal ba bhai?", "CASUAL_CHAT", "hinglish"],
    ["kaisan baadu?", "CASUAL_CHAT", "hinglish"],
    ["का हाल बा?", "CASUAL_CHAT", "bho"],
    ["क्या हाल है?", "CASUAL_CHAT", "hi"],
    ["did I earn anything?", "REWARDS", "en"],
    ["proof status?", "PROOF", "en"],
    ["how do I join a quest?", "HELP", "en"],
    ["asdfgh", "UNKNOWN", "en"],
    ["how's my progress this week?", "PROGRESS", "en"],
  ];
  for (const [m, category, lang] of cases) {
    assert.equal(intentCategory(classifyIntent(m)), category, m);
    assert.equal(detectLanguage(m), lang, m);
  }
  assert.equal(isRomanBhojpuri("ka ba haal ba bhai?"), true);
  assert.equal(isRomanBhojpuri("bhai kya haal hai?"), false);
});

/* ── 7. Voice ───────────────────────────────────────────────────────────── */

test("voice: 'Bhai meri quest kya hai?' runs the same pipeline and the same OpenRouter call", async () => {
  const { fetchImpl, sent } = fakeOpenRouter(
    completion("Bhai tera quest 'Veer Ji Chaap' hai, 0/3 done.")
  );
  const { reply, meta, fake } = await ask("Bhai meri quest kya hai?", provider(fetchImpl));
  assert.equal(meta.intent, "quests");
  assert.ok(fake.queries.some((q) => q.table === "quest_participants"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.model, "openrouter/free");
  assert.match(reply.text, /Veer Ji Chaap/);
  assert.match(speakableText(reply.text), /0 of 3/);
});

test("silence auto-stop: ~2 s after speech, never mid-sentence, not a fixed recording length", () => {
  assert.equal(SILENCE_STOP_MS, 2000);
  const drive = (plan: [boolean, number][]) => {
    const timer = createEndOfSpeechTimer();
    let now = 0;
    for (const [voiced, ms] of plan) {
      for (let t = 0; t < ms; t += 50) {
        if (timer.observe(voiced, now).stop) return now;
        now += 50;
      }
    }
    return null;
  };
  // 6 s of speech with a 1.2 s pause in the middle: keeps listening, then stops 2 s after.
  const at = drive([
    [true, 3000],
    [false, 1200],
    [true, 3000],
    [false, 3000],
  ]);
  assert.ok(at !== null && at >= 7200 + 1950 && at <= 7200 + 2100, String(at));
});

/* ── 8. Gemini stays voice-only, OpenRouter stays text-only ─────────────── */

test("Gemini is voice-only and OpenRouter is text-only", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  // The text path never names Gemini.
  for (const f of [
    "src/lib/strivy/openrouter.ts",
    "src/lib/strivy/model.ts",
    "src/lib/strivy/pipeline.ts",
    "src/lib/strivy/persona.ts",
    "src/app/api/strivy/chat/route.ts",
  ]) {
    assert.doesNotMatch(read(f), /gemini|googleapis/i, f);
  }
  // Voice never calls OpenRouter or the text model.
  for (const f of [
    "src/lib/strivy/voice/server.ts",
    "src/lib/strivy/voice/speech.ts",
    "src/app/api/strivy/voice/route.ts",
    "src/app/api/strivy/voice/transcribe/route.ts",
    "src/components/features/strivy/voice.ts",
    "src/components/features/strivy/useStrivyVoice.ts",
  ]) {
    const src = read(f);
    assert.doesNotMatch(src, /openrouter|OPENROUTER|getStrivyModelProvider/, f);
  }
  // Browser code never reads server secrets.
  for (const f of [
    "src/components/features/strivy/StrivyPanel.tsx",
    "src/components/features/strivy/StrivyMessage.tsx",
    "src/components/features/strivy/chat.ts",
    "src/components/features/strivy/voice.ts",
  ]) {
    const src = read(f);
    assert.doesNotMatch(
      src,
      /OPENROUTER_API_KEY|GEMINI_API_KEY|SERVICE_ROLE|VAPID_PRIVATE|CRON_SECRET/,
      f
    );
  }
  // No paid text API anywhere in the text path.
  assert.doesNotMatch(read("src/lib/strivy/openrouter.ts"), /api\.openai\.com|api\.anthropic\.com/);
  // No NEXT_PUBLIC_ OpenRouter variable exists.
  assert.doesNotMatch(read(".env.example"), /NEXT_PUBLIC_OPENROUTER/);
});

test("the active text path doesn't use Ollama", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  for (const f of [
    "src/lib/strivy/model.ts",
    "src/lib/strivy/pipeline.ts",
    "src/app/api/strivy/chat/route.ts",
    "src/app/api/strivy/llm/route.ts",
    "src/lib/strivy/health.ts",
  ]) {
    assert.doesNotMatch(read(f), /from "\.\/ollama"|from "@\/lib\/strivy\/ollama"|OLLAMA_/, f);
  }
  const env = read(".env.example");
  assert.doesNotMatch(env, /^OLLAMA_/m, ".env.example doesn't ask for Ollama");
  assert.match(env, /^OPENROUTER_API_KEY=$/m);
  assert.match(env, /^OPENROUTER_MODEL=openrouter\/free$/m);
});
