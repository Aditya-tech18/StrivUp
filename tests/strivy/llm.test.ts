/**
 * General conversation and the local Ollama provider.
 *
 * The Ollama tests talk real HTTP to a small fake Ollama server on
 * 127.0.0.1 (same /api/tags and /api/chat shapes), so the provider, its
 * timeouts and the pipeline fallback are exercised end to end without a
 * model installed.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { classifyIntent } from "@/lib/strivy/intents";
import { detectLanguage } from "@/lib/strivy/language";
import { draftReply } from "@/lib/strivy/replies";
import { checkGrounding } from "@/lib/strivy/grounding";
import { toModelContext } from "@/lib/strivy/context";
import { buildModelPrompt } from "@/lib/strivy/persona";
import {
  checkOllamaHealth,
  cleanModelText,
  createOllamaProvider,
  isLocalUrl,
  ollamaConfigFromEnv,
  type OllamaConfig,
} from "@/lib/strivy/ollama";
import { handleStrivyChatRequest, runStrivyPipeline } from "@/lib/strivy/pipeline";
import { handleLlmHealthRequest } from "@/lib/strivy/health";
import { deterministicProvider, type StrivyModelProvider } from "@/lib/strivy/model";
import { responseToMessage } from "@/components/features/strivy/chat";
import type { ChatTurn, QuestFact, StrivyContext, StrivyFacts } from "@/lib/strivy/types";
import { SAMPLE, USER_ID, ctx, fakeSupabase } from "./helpers";

/* ── Fixtures ─────────────────────────────────────────────────────────── */

const VEER: QuestFact = {
  questId: "q9",
  title: "Veer Ji Chaap",
  businessName: "Veer Ji",
  locationName: null,
  verificationStatus: "pending",
  completed: false,
  endsAt: "2026-10-28T12:00:00Z",
  tasksTotal: 3,
  tasksApproved: 0,
  tasksPending: 0,
  tasksNeedAction: 3,
};

const QUEST_ONLY: Partial<StrivyFacts> = {
  firstName: "Aryan",
  challenges: [],
  quests: [VEER],
};

function draft(message: string, facts: Partial<StrivyFacts>, history: ChatTurn[] = []) {
  const intent = classifyIntent(message, history);
  const context: StrivyContext = {
    ...ctx(intent.intent, facts),
    intent,
    lang: detectLanguage(message, history),
  };
  return { intent, reply: draftReply(context, message), context };
}

const afterQuest: ChatTurn[] = [
  { role: "user", text: "mera quest kya h?" },
  { role: "strivy", text: "Tera active quest 'Veer Ji Chaap' hai", intent: "quests" },
];

/* ── 1. General conversation ──────────────────────────────────────────── */

test("small talk and 'what can you do' never get 'didn't get that'", () => {
  const cases: [string, string][] = [
    ["hi", "greeting"],
    ["hello", "greeting"],
    ["hey", "greeting"],
    ["what can you do?", "capabilities"],
    ["bhai kya kya kr skte ho", "capabilities"],
    ["help", "capabilities"],
    ["kya haal", "general_chat"],
    ["kaise ho?", "general_chat"],
    ["bored hu", "general_chat"],
    ["bhai bored hu", "general_chat"],
    ["tell me something", "general_chat"],
    ["wassup", "general_chat"],
    ["kya karu?", "focus"],
    ["tum kaun ho?", "strivy_info"],
  ];
  for (const [m, intent] of cases) {
    const { intent: i, reply } = draft(m, SAMPLE);
    assert.equal(i.intent, intent, m);
    assert.doesNotMatch(reply.text, /didn't quite get|samjha nahi/i, m);
    assert.ok(reply.text.length <= 200, `${m}: ${reply.text}`);
  }
});

test("capabilities and small talk are short, in the person's language, with no architecture talk", () => {
  const hinglish = draft("bhai kya kya kr skte ho", SAMPLE).reply.text;
  assert.match(hinglish, /Kaafi kuch 😏/);
  assert.match(draft("what can you do?", SAMPLE).reply.text, /keep you honest/);
  assert.match(draft("bhai bored hu", SAMPLE).reply.text, /bore ho raha|boredom matlab/i);
  for (const m of ["what can you do?", "who are you", "bhai kya kya kr skte ho", "kya haal"]) {
    assert.doesNotMatch(draft(m, SAMPLE).reply.text, /database|AI model|STRIVUP data|template/i, m);
  }
});

test("small talk reads no personal data", async () => {
  for (const m of ["kya haal", "bored hu", "what can you do?", "tell me something"]) {
    const fake = fakeSupabase({ user: { id: USER_ID } });
    await runStrivyPipeline({
      supabase: fake.client,
      userId: USER_ID,
      message: m,
      history: [],
      provider: deterministicProvider,
    });
    assert.deepEqual(fake.queries, [], m);
  }
});

test("'complete my quest' is never pretended; it offers what's left instead", () => {
  for (const m of ["complete my quest", "mark my task done", "can you submit my proof?"]) {
    const { intent, reply, context } = draft(m, SAMPLE);
    assert.equal(intent.intent, "action_request", m);
    assert.match(reply.text, /can't complete that from here yet/);
    assert.ok(reply.suggestions.includes("What's left?"));
    const fake = checkGrounding("Done ✅ Your quest is completed!", toModelContext(context), reply);
    assert.equal(fake.ok, false);
    assert.ok(fake.reasons.includes("claims an action it can't do"));
  }
  // Asking how to do it is still a how-to question.
  assert.notEqual(classifyIntent("how do I complete a quest?").intent, "action_request");
});

/* ── 2. Context and explicit intent ───────────────────────────────────── */

test("quest → 'kitna hua?' and 'kab tak?' stay on the quest", () => {
  const progress = draft("kitna hua?", QUEST_ONLY, afterQuest);
  assert.equal(progress.intent.intent, "quests");
  assert.match(progress.reply.text, /0\/3/);
  const deadline = draft("kab tak?", QUEST_ONLY, afterQuest);
  assert.equal(deadline.intent.detail, "deadline");
  assert.match(deadline.reply.text, /28 Oct/);
});

test("an explicit subject beats the previous context", () => {
  assert.equal(classifyIntent("aur challenge?", afterQuest).intent, "challenges");
  assert.equal(classifyIntent("meri streak?", afterQuest).intent, "streak");
  const afterChallenge: ChatTurn[] = [
    { role: "user", text: "active challenge?" },
    { role: "strivy", text: "…", intent: "challenges" },
  ];
  assert.equal(classifyIntent("aur quest?", afterChallenge).intent, "quests");
  assert.equal(classifyIntent("kab tak?", afterChallenge).topic, "challenge");
});

test("'detail me samjha' expands the previous answer", () => {
  const r = classifyIntent("detail me samjha", afterQuest);
  assert.equal(r.intent, "quests");
  assert.deepEqual(r.matched, ["detail-follow-up"]);
});

/* ── 3. Configuration: local only, model required ─────────────────────── */

test("only local Ollama URLs are accepted", () => {
  for (const ok of [
    "http://127.0.0.1:11434",
    "http://localhost:11434",
    "http://[::1]:11434",
    "http://192.168.1.20:11434",
    "http://10.0.0.5:11434",
    "http://host.docker.internal:11434",
    "http://gpu-box.local:11434",
  ]) {
    assert.equal(isLocalUrl(ok), true, ok);
  }
  for (const bad of [
    "https://api.openai.com/v1",
    "https://generativelanguage.googleapis.com",
    "https://api.anthropic.com",
    "https://openrouter.ai/api",
    "http://8.8.8.8:11434",
    "http://user:pass@127.0.0.1:11434",
    "file:///etc/passwd",
    "not a url",
  ]) {
    assert.equal(isLocalUrl(bad), false, bad);
  }
});

test("config: sensible defaults, no assumed model, clear errors", () => {
  const ok = ollamaConfigFromEnv({ OLLAMA_MODEL: "qwen3:8b" });
  assert.deepEqual(ok.config, {
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen3:8b",
    timeoutMs: 30000,
    keepAlive: "30m",
  });
  const noModel = ollamaConfigFromEnv({});
  assert.equal(noModel.config, null);
  assert.match(noModel.error ?? "", /OLLAMA_MODEL is empty.*ollama pull/);
  const remote = ollamaConfigFromEnv({
    OLLAMA_MODEL: "x",
    OLLAMA_BASE_URL: "https://api.openai.com",
  });
  assert.match(remote.error ?? "", /must point to Ollama on this machine/);
  assert.equal(
    ollamaConfigFromEnv({ OLLAMA_MODEL: "m", STRIVY_LLM_TIMEOUT_MS: "999999" }).config?.timeoutMs,
    60000
  );
});

/* ── 4. A fake Ollama over real HTTP ──────────────────────────────────── */

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void;

const servers: http.Server[] = [];
after(() => servers.forEach((s) => s.close()));

async function fakeOllama(opts: {
  models?: string[];
  chat?: Handler;
}): Promise<{ config: OllamaConfig; requests: { path: string; body: string }[] }> {
  const requests: { path: string; body: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ path: req.url ?? "", body });
      if (req.url === "/api/tags") {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ models: (opts.models ?? ["qwen3:8b"]).map((name) => ({ name })) })
        );
        return;
      }
      if (req.url === "/api/chat" && opts.chat) return opts.chat(req, body, res);
      res.statusCode = 404;
      res.end("{}");
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    config: {
      baseUrl: `http://127.0.0.1:${port}`,
      model: "qwen3:8b",
      timeoutMs: 800,
      keepAlive: "30m",
    },
    requests,
  };
}

const answer =
  (content: unknown): Handler =>
  (_req, _body, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: { role: "assistant", content } }));
  };

const quiet = { log: () => undefined };

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

async function pipeline(message: string, provider: StrivyModelProvider, history: ChatTurn[] = []) {
  const fake = fakeSupabase({
    user: { id: USER_ID },
    tables: {
      profiles: { data: [{ full_name: "Aryan Singh", username: "aryan" }] },
      quest_participants: { data: [QUEST_ROW] },
      quest_tasks: {
        data: ["t1", "t2", "t3"].map((id) => ({ id, quest_id: "q9", is_required: true })),
      },
      quest_task_submissions: { data: [] },
    },
  });
  const result = await runStrivyPipeline({
    supabase: fake.client,
    userId: USER_ID,
    message,
    history,
    provider,
  });
  return { ...result, fake };
}

test("Ollama available: a grounded natural reply is used", async () => {
  const { config, requests } = await fakeOllama({
    chat: answer("Veer Ji Chaap abhi 0/3 pe hai 👀 Ek task nipta de aaj."),
  });
  const provider = createOllamaProvider(config, quiet);
  const { reply, meta } = await pipeline("mera quest kitna hua?", provider);
  assert.equal(meta.provider, "ollama");
  assert.equal(meta.modelUsed, true, JSON.stringify(meta));
  assert.equal(reply.text, "Veer Ji Chaap abhi 0/3 pe hai 👀 Ek task nipta de aaj.");
  assert.ok(reply.links.length > 0, "links still come from the draft");
  const chat = requests.find((r) => r.path === "/api/chat");
  assert.ok(chat);
  const body = JSON.parse(chat.body) as {
    model: string;
    stream: boolean;
    messages: { content: string }[];
  };
  assert.equal(body.model, "qwen3:8b");
  assert.equal(body.stream, false);
  assert.match(body.messages[0].content, /You are Strivy/);
  assert.match(body.messages[0].content, /Hinglish in Roman script/);
});

test("Ollama invents progress: rejected, the grounded draft is shown", async () => {
  const { config } = await fakeOllama({ chat: answer("You're 2/3 done 🔥 almost there!") });
  const { reply, meta } = await pipeline(
    "how's my quest progress?",
    createOllamaProvider(config, quiet)
  );
  assert.equal(meta.modelUsed, false);
  assert.equal(meta.fallbackReason, "failed the grounding check");
  assert.ok(meta.groundingRejected?.some((r) => r.includes("2/3")));
  assert.match(reply.text, /0\/3/);
});

test("Ollama unavailable: STRIVY still answers, quickly, from the draft", async () => {
  const { config } = await fakeOllama({});
  servers.at(-1)?.close();
  await new Promise((r) => setTimeout(r, 20));
  const logs: string[] = [];
  const provider = createOllamaProvider(config, { log: (m) => logs.push(m) });
  const started = Date.now();
  const { reply, meta } = await pipeline("how's my quest progress?", provider);
  assert.ok(Date.now() - started < 2000);
  assert.equal(meta.modelUsed, false);
  assert.equal(meta.fallbackReason, "model unavailable");
  assert.match(meta.modelError ?? "", /isn't reachable.*ollama serve/);
  assert.match(reply.text, /Veer Ji Chaap/);
  // Logged once, not per message.
  await pipeline("mera quest?", provider);
  assert.equal(logs.filter((l) => l.includes("unavailable")).length, 1);
});

test("model not pulled: falls back and says how to fix it", async () => {
  const { config, requests } = await fakeOllama({ models: ["llama3.2:3b"] });
  const { meta } = await pipeline("mera quest?", createOllamaProvider(config, quiet));
  assert.equal(meta.fallbackReason, "model unavailable");
  assert.match(meta.modelError ?? "", /ollama pull qwen3:8b.*llama3\.2:3b/);
  assert.ok(!requests.some((r) => r.path === "/api/chat"), "no chat call without the model");
});

test("Ollama too slow: cancelled, draft shown within the timeout", async () => {
  const { config } = await fakeOllama({
    chat: (_req, _body, res) => setTimeout(() => answer("late")(_req, _body, res), 3000),
  });
  const started = Date.now();
  const { meta, reply } = await pipeline(
    "mera quest?",
    createOllamaProvider({ ...config, timeoutMs: 300 }, quiet)
  );
  assert.ok(Date.now() - started < 1500, `${Date.now() - started}ms`);
  assert.equal(meta.fallbackReason, "model timed out");
  assert.match(reply.text, /Veer Ji Chaap/);
});

test("malformed and empty Ollama replies fall back", async () => {
  const malformed = await fakeOllama({
    chat: (_req, _body, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end('{"not":"what we expect"}');
    },
  });
  const m = await pipeline("mera quest?", createOllamaProvider(malformed.config, quiet));
  assert.equal(m.meta.fallbackReason, "model error");
  assert.match(m.reply.text, /Veer Ji Chaap/);

  const html = await fakeOllama({ chat: (_req, _body, res) => res.end("<html>oops</html>") });
  assert.equal(
    (await pipeline("mera quest?", createOllamaProvider(html.config, quiet))).meta.fallbackReason,
    "model error"
  );

  const empty = await fakeOllama({ chat: answer("   ") });
  const e = await pipeline("mera quest?", createOllamaProvider(empty.config, quiet));
  assert.equal(e.meta.fallbackReason, "empty model reply");

  const onlyThinking = await fakeOllama({ chat: answer("<think>hmm, 5/3?</think>") });
  const t = await pipeline("mera quest?", createOllamaProvider(onlyThinking.config, quiet));
  assert.equal(t.meta.fallbackReason, "empty model reply");
});

test("a model that rejects the think flag is retried once without it", async () => {
  const bodies: string[] = [];
  const { config } = await fakeOllama({
    chat: (_req, body, res) => {
      bodies.push(body);
      if (body.includes('"think"')) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: '"qwen2" does not support thinking' }));
        return;
      }
      answer("Veer Ji Chaap abhi 0/3 pe hai 👀")(_req, body, res);
    },
  });
  const { meta } = await pipeline("mera quest kitna hua?", createOllamaProvider(config, quiet));
  assert.equal(meta.modelUsed, true);
  assert.equal(bodies.length, 2);
});

test("general chat goes to Ollama with no personal facts", async () => {
  const { config, requests } = await fakeOllama({
    chat: answer("Main toh mast 😌 Tu bata, aaj kya nipta rahe hain?"),
  });
  const { reply, meta, fake } = await pipeline(
    "kya haal bhai",
    createOllamaProvider(config, quiet)
  );
  assert.equal(meta.mode, "chat");
  assert.equal(meta.modelUsed, true);
  assert.match(reply.text, /mast/);
  assert.deepEqual(fake.queries, []);
  const body = requests.find((r) => r.path === "/api/chat")!.body;
  assert.doesNotMatch(body, /Veer Ji|30 Days|FACTS/);
  assert.match(body, /Never make up facts about the person/);
});

test("small talk that makes up the person's data is rejected", async () => {
  const { config } = await fakeOllama({ chat: answer("Your streak is on fire, keep going!") });
  const { meta, reply } = await pipeline("bored hu", createOllamaProvider(config, quiet));
  assert.equal(meta.modelUsed, false);
  assert.ok(meta.groundingRejected?.includes("talks about data it wasn't given"));
  assert.match(reply.text, /bored/i);
});

test("the model sees at most the last exchange", async () => {
  const { config, requests } = await fakeOllama({ chat: answer("") });
  const history: ChatTurn[] = [
    { role: "user", text: "OLD-USER-1" },
    { role: "strivy", text: "OLD-STRIVY-1", intent: "streak" },
    { role: "user", text: "mera quest kya h?" },
    { role: "strivy", text: "Tera active quest 'Veer Ji Chaap' hai", intent: "quests" },
  ];
  await pipeline("kitna hua?", createOllamaProvider(config, quiet), history);
  const body = requests.find((r) => r.path === "/api/chat")!.body;
  assert.doesNotMatch(body, /OLD-/);
  assert.match(body, /mera quest kya h/);
});

test("health check: up, down, wrong model, not Ollama", async () => {
  const up = await fakeOllama({ models: ["qwen3:8b"] });
  const h = await checkOllamaHealth(up.config);
  assert.equal(h.ok, true);
  const latest = await fakeOllama({ models: ["qwen3:8b"] });
  assert.equal((await checkOllamaHealth({ ...latest.config, model: "qwen3:8b:latest" })).ok, true);

  const wrong = await fakeOllama({ models: ["llama3.2:3b"] });
  const w = await checkOllamaHealth(wrong.config);
  assert.equal(w.reachable, true);
  assert.equal(w.modelInstalled, false);
  assert.match(w.message, /ollama pull qwen3:8b/);

  const down = await checkOllamaHealth({
    baseUrl: "http://127.0.0.1:1",
    model: "x",
    keepAlive: "30m",
    timeoutMs: 500,
  });
  assert.equal(down.reachable, false);
  assert.match(down.message, /isn't reachable/);
});

/* ── 5. Grounding of model replies ────────────────────────────────────── */

test("grounding: correct accepted; invented number, name, deadline, reward rejected", () => {
  const { reply, context } = draft("mera quest kitna hua?", QUEST_ONLY);
  const model = toModelContext(context);
  const check = (text: string) => checkGrounding(text, model, reply);
  assert.equal(check("'Veer Ji Chaap' abhi 0/3 pe hai 👀 Ek task nipta de.").ok, true);
  assert.equal(check("Veer Ji Chaap abhi 3 में से 0 pe hai 👀").ok, true);
  assert.ok(check("'Veer Ji Chaap' pe 2/3 ho gaya 🔥").reasons.some((r) => r.includes("2/3")));
  assert.ok(check("'Veer Ji Chaap' pe 2 of 3 done 🔥").reasons.some((r) => r.includes("2/3")));
  assert.ok(
    check("'Momo Madness' abhi 0/3 pe hai").reasons.some((r) => r.includes("Momo Madness"))
  );
  assert.ok(
    check("'Veer Ji Chaap' 30 Nov tak hai, 0/3 👀").reasons.some((r) => r.startsWith("new dates"))
  );
  assert.ok(
    check("'Veer Ji Chaap' 0/3 pe hai, aur tune voucher jeeta 🏆").reasons.some((r) =>
      r.includes("voucher")
    )
  );
  assert.ok(
    check("According to your database, 'Veer Ji Chaap' is 0/3.").reasons.includes(
      "technical wording"
    )
  );
});

test("the model context has readable dates, not timestamps", () => {
  const { context } = draft("mera quest?", QUEST_ONLY);
  const json = JSON.stringify(toModelContext(context));
  assert.match(json, /"endsAt":"28 Oct"/);
  assert.doesNotMatch(json, /2026-10-28T/);
});

/* ── 6. Language ──────────────────────────────────────────────────────── */

test("the prompt asks for the person's own language style", () => {
  const cases: [string, RegExp][] = [
    ["what's my quest?", /casual English/],
    ["bhai meri streak kya scene h", /Hinglish in Roman script.*Never use Devanagari/],
    ["what's mera quest?", /Hinglish in Roman script/],
    ["मेरा quest क्या है?", /Hindi in Devanagari/],
    ["हमार quest का बा?", /Bhojpuri in Devanagari/],
  ];
  for (const [m, style] of cases) {
    const { reply, context } = draft(m, QUEST_ONLY);
    const { system } = buildModelPrompt(toModelContext(context), reply, m);
    assert.match(system, style, m);
  }
});

test("a reply in the wrong script is rejected", () => {
  const { reply, context } = draft("मेरा quest क्या है?", QUEST_ONLY);
  const r = checkGrounding("Your quest 'Veer Ji Chaap' is at 0/3.", toModelContext(context), reply);
  assert.ok(r.reasons.includes("wrong language"));
});

/* ── 7. Security and privacy ──────────────────────────────────────────── */

test("nothing secret or identifying is sent to the model", async () => {
  const keep = { ...process.env };
  process.env.SUPABASE_SERVICE_ROLE_KEY = "srk-SECRET-123";
  process.env.VAPID_PRIVATE_KEY = "vapid-SECRET-456";
  process.env.CRON_SECRET = "cron-SECRET-789";
  const { config, requests } = await fakeOllama({ chat: answer("") });
  await pipeline("mera quest kitna hua?", createOllamaProvider(config, quiet));
  process.env = keep;
  const all = requests.map((r) => r.body).join("\n");
  for (const secret of [
    "srk-SECRET-123",
    "vapid-SECRET-456",
    "cron-SECRET-789",
    USER_ID,
    "q9",
    "t1",
    "aryan",
  ]) {
    assert.ok(!all.includes(secret), secret);
  }
  // Only the local fake server was called.
  assert.ok(requests.every((r) => ["/api/tags", "/api/chat", "/api/generate"].includes(r.path)));
});

test("the user id comes from the session, and each user's facts stay theirs", async () => {
  const { config, requests } = await fakeOllama({ chat: answer("") });
  const fake = fakeSupabase({
    user: { id: USER_ID },
    tables: { quest_participants: { data: [QUEST_ROW] } },
  });
  await handleStrivyChatRequest(
    new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        message: "mera quest?",
        userId: "00000000-0000-0000-0000-00000000000b",
      }),
    }),
    {
      isEnabled: () => true,
      getSupabase: async () => fake.client,
      getProvider: () => createOllamaProvider(config, quiet),
    }
  );
  for (const q of fake.queries) {
    // quest_tasks is looked up by the user's own quest ids.
    if (q.table !== "quest_tasks")
      assert.ok(
        q.filters.some(([, , v]) => v === USER_ID),
        q.table
      );
    assert.ok(!q.filters.some(([, , v]) => v === "00000000-0000-0000-0000-00000000000b"), q.table);
  }
  assert.ok(requests.length > 0);
});

/* ── 8. Debug output ──────────────────────────────────────────────────── */

test("debug details never reach the browser; with STRIVY_DEBUG they go to the server log", async () => {
  const { config } = await fakeOllama({ chat: answer("You're 2/3 done 🔥") });
  const fake = () =>
    fakeSupabase({
      user: { id: USER_ID },
      tables: {
        quest_participants: { data: [QUEST_ROW] },
        quest_tasks: { data: [{ id: "t1", quest_id: "q9" }] },
      },
    });
  const req = () =>
    new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ message: "mera quest kitna hua?" }),
    });
  const base = { isEnabled: () => true, getProvider: () => createOllamaProvider(config, quiet) };
  const plain = (await (
    await handleStrivyChatRequest(req(), { ...base, getSupabase: async () => fake().client })
  ).json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(plain), ["reply"]);

  const lines: string[] = [];
  const res = await handleStrivyChatRequest(req(), {
    ...base,
    getSupabase: async () => fake().client,
    debug: () => true,
    log: (l) => lines.push(l),
  });
  const body = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["reply"], "debug on: still only the reply");
  assert.doesNotMatch(JSON.stringify(body), /ollama|hinglish|rewrite|fallback|ms"/);
  assert.equal(lines.length, 1);
  assert.match(
    lines[0],
    /^\[strivy\] quests · hinglish · ollama · rewrite · fallback: failed the grounding check/
  );
  assert.doesNotMatch(lines[0], /Veer Ji|You are Strivy|FACTS/);

  // An old server that still sends routing details: the panel drops them.
  const msg = responseToMessage(
    200,
    { reply: body.reply, debug: { intent: "quests", provider: "ollama" } } as never,
    "x"
  );
  assert.equal(msg.role, "strivy");
  assert.deepEqual(Object.keys(msg).sort(), ["id", "reply", "role"]);
});

test("health endpoint: signed-in only, detailed in development, bare in production", async () => {
  const { config } = await fakeOllama({ models: ["llama3.2:3b"] });
  const provider = createOllamaProvider(config, quiet);
  const deps = (
    user: { id: string } | null,
    detailed: boolean,
    p: StrivyModelProvider = provider
  ) => ({
    isEnabled: () => true,
    getSupabase: async () => fakeSupabase({ user }).client,
    getProvider: () => p,
    detailed: () => detailed,
  });
  assert.equal((await handleLlmHealthRequest(deps(null, true))).status, 401);
  const dev = (await (await handleLlmHealthRequest(deps({ id: USER_ID }, true))).json()) as Record<
    string,
    unknown
  >;
  assert.equal(dev.ok, false);
  assert.match(String(dev.message), /ollama pull qwen3:8b/);
  const prod = (await (
    await handleLlmHealthRequest(deps({ id: USER_ID }, false))
  ).json()) as Record<string, unknown>;
  assert.deepEqual(prod, { enabled: true, ok: false, provider: "ollama" });
  const off = (await (
    await handleLlmHealthRequest(deps({ id: USER_ID }, true, deterministicProvider))
  ).json()) as Record<string, unknown>;
  assert.equal(off.enabled, false);
});

test("model output is cleaned of reasoning, labels, quotes and markdown", () => {
  assert.equal(
    cleanModelText('<think>let me see</think>\nStrivy: "**Quest** abhi 0/3 pe hai 👀"'),
    "Quest abhi 0/3 pe hai 👀"
  );
  assert.equal(cleanModelText("  "), "");
});

/* ── 8. Ollama integration fix: timeout, casual chat, languages ───────── */

type ChatBody = {
  model: string;
  keep_alive: string;
  messages: { role: string; content: string }[];
  options: { num_ctx: number; num_predict: number; temperature: number };
};

function chatBody(requests: { path: string; body: string }[]): ChatBody {
  const chat = requests.find((r) => r.path === "/api/chat");
  assert.ok(chat, "a chat request was sent");
  return JSON.parse(chat.body) as ChatBody;
}

async function llama(reply: string | Handler) {
  const ollama = await fakeOllama({
    models: ["llama3.2:3b"],
    chat: typeof reply === "string" ? answer(reply) : reply,
  });
  return { ...ollama, config: { ...ollama.config, model: "llama3.2:3b" } };
}

test("fix: the default timeout is 30 s, configurable up to 60 s", () => {
  assert.equal(ollamaConfigFromEnv({ OLLAMA_MODEL: "llama3.2:3b" }).config?.timeoutMs, 30000);
  assert.equal(
    ollamaConfigFromEnv({ OLLAMA_MODEL: "llama3.2:3b", STRIVY_LLM_TIMEOUT_MS: "45000" }).config
      ?.timeoutMs,
    45000
  );
  const junk = ollamaConfigFromEnv({ OLLAMA_MODEL: "m", OLLAMA_KEEP_ALIVE: "forever; rm -rf" });
  assert.equal(junk.config?.keepAlive, "30m");
  assert.equal(
    ollamaConfigFromEnv({ OLLAMA_MODEL: "m", OLLAMA_KEEP_ALIVE: "1h" }).config?.keepAlive,
    "1h"
  );
});

test("fix 1: Ollama on and answering: the model's line is used, with a warm model", async () => {
  const { config, requests } = await llama("All good bro 😎 Just vibing. You?");
  const provider = createOllamaProvider(config, quiet);
  const { reply, meta } = await pipeline("what's up bro", provider);
  assert.equal(meta.intent, "general_chat");
  assert.equal(meta.lang, "en");
  assert.equal(meta.modelUsed, true, JSON.stringify(meta));
  assert.equal(reply.text, "All good bro 😎 Just vibing. You?");
  const body = chatBody(requests);
  assert.equal(body.model, "llama3.2:3b");
  assert.equal(body.keep_alive, "30m");
  assert.equal(body.options.num_ctx, 2048);
  assert.equal(body.options.num_predict, 96, "small talk asks for a short reply");
  // The model is preloaded once, in the background, after the first good health check.
  await new Promise((r) => setTimeout(r, 30));
  const warm = requests.filter((r) => r.path === "/api/generate");
  assert.equal(warm.length, 1);
  assert.deepEqual(JSON.parse(warm[0].body), { model: "llama3.2:3b", keep_alive: "30m" });
  await pipeline("hello bhai", provider);
  assert.equal(requests.filter((r) => r.path === "/api/generate").length, 1);
});

test("fix 2: a genuine timeout falls back to the deterministic draft, on time", async () => {
  const { config } = await llama((req, body, res) =>
    setTimeout(() => answer("too late")(req, body, res), 2000)
  );
  const started = Date.now();
  const { reply, meta } = await pipeline(
    "kya haal bhai",
    createOllamaProvider({ ...config, timeoutMs: 400 }, quiet)
  );
  assert.ok(Date.now() - started < 1500, `${Date.now() - started}ms`);
  assert.equal(meta.fallbackReason, "model timed out");
  assert.match(meta.modelError ?? "", /timed out after 400ms/);
  assert.notEqual(reply.text, "too late");
  assert.ok(reply.text.length > 0);
});

test("fix 3: Ollama not running falls back to the draft", async () => {
  const provider = createOllamaProvider(
    { baseUrl: "http://127.0.0.1:1", model: "llama3.2:3b", timeoutMs: 30000, keepAlive: "30m" },
    quiet
  );
  const started = Date.now();
  const { reply, meta } = await pipeline("ek joke suna", provider);
  assert.ok(Date.now() - started < 2500);
  assert.equal(meta.fallbackReason, "model unavailable");
  assert.equal(meta.intent, "general_chat");
  assert.ok(reply.text.length > 0);
});

test("fix: jokes, banter and 'what's up' are small talk, answered by the model", () => {
  for (const m of [
    "hello bhai",
    "kya haal hai",
    "bhai bore ho raha hu",
    "kuch funny bol",
    "ek joke suna",
    "random funny answer de",
    "tell me a joke",
    "what's up bro",
    "bhai kya kr rha h",
    "भाई क्या कर रहा है",
    "ka haal ba bhai",
    "का हाल बा भाई",
  ]) {
    const intent = classifyIntent(m).intent;
    assert.ok(["greeting", "general_chat"].includes(intent), `${m} → ${intent}`);
  }
  // Data questions keep their own intent.
  assert.equal(classifyIntent("bhai quest ka kya scene hai").intent, "quests");
  assert.equal(classifyIntent("what's my streak?").intent, "streak");
});

test("fix 4–7: the model is asked to reply in the person's language and script", async () => {
  const cases: [string, string, RegExp, string][] = [
    [
      "what's up bro",
      "en",
      /Reply in casual English/,
      "Not much, just guarding streaks from the couch 😎",
    ],
    [
      "bhai kya kr rha h",
      "hinglish",
      /casual Hinglish: Hindi written in English letters.*Never use Devanagari/,
      "Kuch nahi bhai, tera wait kar raha tha 😏",
    ],
    [
      "भाई क्या कर रहा है",
      "hi",
      /casual Hindi, in Devanagari/,
      "बस तुम्हारा इंतज़ार कर रहा था 😏 तुम सुनाओ?",
    ],
    [
      "ka haal ba bhai",
      "hinglish",
      /Bhojpuri written in English letters/,
      "Hum ta ekdam mast bani 😎 Tohar ka haal ba?",
    ],
    ["का हाल बा भाई", "bho", /Bhojpuri, in Devanagari/, "हम त एकदम मस्त बानी 😎 रउआ के का हाल बा?"],
  ];
  for (const [message, lang, style, line] of cases) {
    const { config, requests } = await llama(line);
    const { reply, meta } = await pipeline(message, createOllamaProvider(config, quiet));
    assert.equal(meta.lang, lang, message);
    assert.equal(meta.mode, "chat", message);
    assert.equal(meta.modelUsed, true, `${message}: ${JSON.stringify(meta)}`);
    assert.equal(reply.text, line);
    const body = chatBody(requests);
    assert.match(body.messages[0].content + body.messages[1].content, style, message);
  }
});

test("fix: a reply in the wrong script for the person is rejected", async () => {
  const { config } = await llama("बस तुम्हारा इंतज़ार कर रहा था 😏");
  const { meta } = await pipeline("bhai kya kr rha h", createOllamaProvider(config, quiet));
  assert.equal(meta.modelUsed, false);
  assert.ok(meta.groundingRejected?.includes("wrong language"));
});

test("fix 8: a quest question is still a rewrite of the grounded draft", async () => {
  const { config, requests } = await llama("Veer Ji Chaap pe abhi 0/3 hai 👀 Chal ek task nipta.");
  const { reply, meta } = await pipeline("mera quest kya h?", createOllamaProvider(config, quiet));
  assert.equal(meta.intent, "quests");
  assert.equal(meta.mode, "rewrite");
  assert.equal(meta.modelUsed, true, JSON.stringify(meta));
  assert.match(reply.text, /Veer Ji Chaap/);
  const body = chatBody(requests);
  assert.match(body.messages[1].content, /FACTS \(the only true information\)/);
  assert.match(body.messages[1].content, /CORRECT ANSWER/);
});

test("fix 9: a streak rewrite keeps the real streak; an invented one is rejected", () => {
  const { reply, context } = draft("what's my streak?", SAMPLE);
  assert.equal(reply.intent, "streak");
  assert.match(reply.text, /11/);
  const model = toModelContext(context);
  const good = checkGrounding(
    "11-day streak on 30 Days of Running 🔥 Don't let it cool off.",
    model,
    reply
  );
  assert.equal(good.ok, true, good.reasons.join("; "));
  const bad = checkGrounding("15-day streak 🔥 Keep going!", model, reply);
  assert.equal(bad.ok, false);
  assert.ok(bad.reasons.some((r) => r.includes("15")));
});

test("fix 10: small talk that invents the person's data is rejected, jokes with numbers pass", () => {
  const { reply, context } = draft("ek joke suna", SAMPLE);
  const model = toModelContext(context);
  const invented = checkGrounding("Tera 12 din ka streak hai, joke hi hai 😏", model, reply, {
    mode: "chat",
  });
  assert.equal(invented.ok, false);
  assert.ok(invented.reasons.some((r) => r.includes("12")));
  const joke = checkGrounding(
    "Maine 2 minute ka workout kiya, phir 20 minute ka break 😌",
    model,
    reply,
    { mode: "chat" }
  );
  assert.equal(joke.ok, true, joke.reasons.join("; "));
  // Rewrites are as strict as ever: an everyday number is still a new number there.
  const quest = draft("mera quest kya h?", QUEST_ONLY);
  const strict = checkGrounding(
    "Veer Ji Chaap pe 2 minute me kaam ho jayega 😏",
    toModelContext(quest.context),
    quest.reply
  );
  assert.equal(strict.ok, false);
});

test("fix: explicit or abusive lines are rejected; playful ones pass", () => {
  const { reply, context } = draft("kuch funny bol", SAMPLE);
  const model = toModelContext(context);
  for (const bad of ["Tu sexy lag raha hai aaj 😏", "Chal chutiya mat bana 😂"]) {
    const r = checkGrounding(bad, model, reply, { mode: "chat" });
    assert.ok(r.reasons.includes("explicit or abusive wording"), bad);
  }
  for (const fine of [
    "Chhutti ka mood hai kya? 😏",
    "Mera dil bhi tere proof jaisa hai, bas approve hone ka wait kar raha hai 😏",
    "Ek chutkula: alarm ne kaha uth ja, maine kaha tu so ja 😴",
  ]) {
    const r = checkGrounding(fine, model, reply, { mode: "chat" });
    assert.ok(!r.reasons.includes("explicit or abusive wording"), fine);
  }
});

test("fix 11: small talk stays short; a rambling model reply is cut to 3 sentences", async () => {
  for (const m of ["kya haal", "bored hu", "ek joke suna", "what's up bro", "hmm ok"]) {
    const { reply } = draft(m, SAMPLE);
    assert.ok(reply.text.length <= 120, `${m}: ${reply.text}`);
    assert.doesNotMatch(reply.text, /I can tell you|didn't quite get that|today's scene/i, m);
  }
  const ramble = Array.from({ length: 6 }, (_, i) => `Line ${"abcdef"[i]} of my story.`).join(" ");
  const { config } = await llama(ramble);
  const { meta, reply } = await pipeline("tell me something", createOllamaProvider(config, quiet));
  // Kept, but only its first sentences: a long answer isn't swapped for a canned line.
  assert.equal(meta.modelUsed, true);
  assert.equal(reply.text, "Line a of my story. Line b of my story. Line c of my story.");
  // One long run-on line with no sentence break is still rejected.
  const { config: runOn } = await llama("so ".repeat(120) + "yeah");
  const long = await pipeline("tell me something", createOllamaProvider(runOn, quiet));
  assert.equal(long.meta.modelUsed, false);
  assert.ok(long.meta.groundingRejected?.includes("too long for small talk"));
});

test("fix 12: Strivy doesn't repeat itself", async () => {
  // The model copying its last reply is rejected.
  const last = "Main toh mast 😌 Tu suna, kya chal raha hai?";
  const history: ChatTurn[] = [
    { role: "user", text: "kya haal" },
    { role: "strivy", text: last, intent: "general_chat" },
  ];
  const { config, requests } = await llama(last);
  const { meta, reply } = await pipeline("kya haal", createOllamaProvider(config, quiet), history);
  assert.equal(meta.modelUsed, false);
  assert.ok(meta.groundingRejected?.includes("repeats the last reply"));
  assert.notEqual(reply.text, last, "the fallback picks another wording");
  // The last small-talk exchange goes as real chat turns, and the model is told not to repeat.
  const sent = chatBody(requests).messages;
  assert.match(sent[0].content, /Never repeat your previous reply/);
  assert.deepEqual(
    sent.slice(1).map((m: { role: string; content: string }) => [m.role, m.content]),
    [
      ["user", "kya haal"],
      ["assistant", last],
      ["user", "kya haal"],
    ]
  );

  // Without a model, asking twice gets a different line.
  const first = await pipeline("kya haal", deterministicProvider);
  const second = await pipeline("kya haal", deterministicProvider, [
    { role: "user", text: "kya haal" },
    { role: "strivy", text: first.reply.text, intent: "general_chat" },
  ]);
  assert.notEqual(second.reply.text, first.reply.text);
});
