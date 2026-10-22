import { test } from "node:test";
import assert from "node:assert/strict";
import { handleStrivyChatRequest, runStrivyPipeline } from "@/lib/strivy/pipeline";
import {
  deterministicProvider,
  getStrivyModelProvider,
  type StrivyModelProvider,
} from "@/lib/strivy/model";
import { USER_ID, fakeSupabase } from "./helpers";

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

function provider(fn: StrivyModelProvider["generateResponse"]): StrivyModelProvider {
  return { name: "test", enabled: true, generateResponse: fn };
}

async function run(
  message: string,
  p: StrivyModelProvider = deterministicProvider,
  timeoutMs?: number
) {
  const fake = fakeSupabase({
    user: { id: USER_ID },
    tables: { profile_challenge_stats: { data: [CHALLENGE_ROW] } },
  });
  const result = await runStrivyPipeline({
    supabase: fake.client,
    userId: USER_ID,
    message,
    history: [],
    provider: p,
    timeoutMs,
  });
  return { ...result, fake };
}

/* ── Model slot and fallback ─────────────────────────────────────────────── */

test("with the model disabled, the grounded draft is returned", async () => {
  const { reply, meta } = await run("how's my streak");
  assert.equal(meta.provider, "none");
  assert.equal(meta.modelUsed, false);
  assert.match(reply.text, /11/);
  assert.match(reply.text, /30 Days of Running/);
});

test("text provider: OpenRouter (free) with a key, built-in replies without; Ollama is never selected", () => {
  const quietLog = () => undefined;
  // No key: built-in replies, whatever else is set (including the old Ollama settings).
  for (const env of [
    {},
    { STRIVY_MODEL_PROVIDER: "ollama", OLLAMA_MODEL: "qwen3:8b" },
    { STRIVY_LLM_ENABLED: "true", OLLAMA_MODEL: "llama3.2:3b" },
    { STRIVY_MODEL_PROVIDER: "openai" },
    { STRIVY_MODEL_PROVIDER: "gemini", GEMINI_API_KEY: "g-key" },
  ]) {
    const p = getStrivyModelProvider(env, quietLog);
    assert.equal(p.name, "none", JSON.stringify(env));
    assert.equal(p.enabled, false);
  }
  // A key: OpenRouter, even with the old Ollama switches set.
  for (const env of [
    { OPENROUTER_API_KEY: "sk-or-v1-test-a" },
    {
      OPENROUTER_API_KEY: "sk-or-v1-test-b",
      STRIVY_MODEL_PROVIDER: "ollama",
      OLLAMA_MODEL: "qwen3:8b",
    },
  ]) {
    const p = getStrivyModelProvider(env, quietLog);
    assert.equal(p.name, "openrouter");
    assert.equal(p.enabled, true);
  }
  // Kill switch.
  const off = getStrivyModelProvider(
    { OPENROUTER_API_KEY: "sk-or-v1-test-c", STRIVY_LLM_ENABLED: "false" },
    quietLog
  );
  assert.equal(off.name, "none");
});

test("a grounded rewrite is used", async () => {
  const { reply, meta } = await run(
    "how's my streak",
    provider(async () => '11 days straight on "30 Days of Running" 🔥 Keep it rolling.')
  );
  assert.equal(meta.modelUsed, true);
  assert.equal(reply.text, '11 days straight on "30 Days of Running" 🔥 Keep it rolling.');
});

test("a hallucinated rewrite is rejected and the draft returned", async () => {
  const { reply, meta } = await run(
    "how's my streak",
    provider(async () => 'You\'re on a 50-day streak in "Morning Yoga"!')
  );
  assert.equal(meta.modelUsed, false);
  assert.ok(meta.groundingRejected && meta.groundingRejected.length >= 2);
  assert.match(reply.text, /30 Days of Running/);
  assert.doesNotMatch(reply.text, /50|Morning Yoga/);
});

test("a model that throws falls back to the draft", async () => {
  const { reply, meta } = await run(
    "how's my streak",
    provider(async () => {
      throw new Error("connection refused");
    })
  );
  assert.equal(meta.modelUsed, false);
  assert.equal(meta.modelError, "connection refused");
  assert.match(reply.text, /30 Days of Running/);
});

test("a model that is too slow falls back to the draft", async () => {
  const { reply, meta } = await run(
    "how's my streak",
    provider(() => new Promise((resolve) => setTimeout(() => resolve("late"), 200))),
    20
  );
  assert.equal(meta.modelUsed, false);
  assert.match(meta.modelError ?? "", /timed out/);
  assert.match(reply.text, /30 Days of Running/);
});

test("a model returning null uses the draft", async () => {
  const { meta } = await run(
    "how's my streak",
    provider(async () => null)
  );
  assert.equal(meta.modelUsed, false);
  assert.equal(meta.groundingRejected, null);
});

test("crisis replies never go to the model", async () => {
  let called = false;
  const { reply } = await run(
    "I want to die",
    provider(async () => {
      called = true;
      return "anything";
    })
  );
  assert.equal(called, false);
  assert.match(reply.text, /14416/);
});

test("the model only receives the minimal, id-free context", async () => {
  let seen: unknown;
  await run(
    "how's my streak",
    provider(async (context) => {
      seen = context;
      return null;
    })
  );
  const json = JSON.stringify(seen);
  assert.ok(!json.includes(USER_ID));
  assert.ok(!json.includes('"c1"'));
  assert.match(json, /30 Days of Running/);
});

/* ── Minimal context: only the tables an intent needs ───────────────────── */

test("each intent reads only what it needs, always filtered to the user", async () => {
  const expectTables: Record<string, string[]> = {
    "how's my streak": ["profile_challenge_stats"],
    "did my proof get verified": ["proof_submissions", "quest_task_submissions"],
    "how does STRIVUP work": [],
    "tell me a joke": [],
    "I want to die": [],
  };
  for (const [message, tables] of Object.entries(expectTables)) {
    const { fake } = await run(message);
    assert.deepEqual(
      [...new Set(fake.queries.map((q) => q.table))].sort(),
      [...tables].sort(),
      message
    );
    for (const q of fake.queries) {
      assert.ok(
        q.filters.some(
          ([op, col, val]) => op === "eq" && (col === "user_id" || col === "id") && val === USER_ID
        ),
        `${q.table} not filtered to the user`
      );
      assert.ok(!q.select.includes("*"), `${q.table} selects *`);
    }
  }
});

test("a failing query is reported as unavailable", async () => {
  const fake = fakeSupabase({
    user: { id: USER_ID },
    tables: { profile_challenge_stats: { error: { message: "boom" } } },
  });
  const { reply } = await runStrivyPipeline({
    supabase: fake.client,
    userId: USER_ID,
    message: "how's my streak",
    history: [],
    provider: deterministicProvider,
  });
  assert.match(reply.text, /couldn't load your streaks/);
});

/* ── HTTP handler ────────────────────────────────────────────────────────── */

function post(body: unknown) {
  return new Request("http://localhost/api/strivy/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deps(options: Parameters<typeof fakeSupabase>[0], enabled = true) {
  const fake = fakeSupabase(options);
  return {
    fake,
    deps: {
      isEnabled: () => enabled,
      getSupabase: async () => fake.client,
      getProvider: () => deterministicProvider,
    },
  };
}

test("404 when STRIVY is disabled, before any auth or query", async () => {
  const { fake, deps: d } = deps({ user: { id: USER_ID } }, false);
  const res = await handleStrivyChatRequest(post({ message: "hi" }), d);
  assert.equal(res.status, 404);
  assert.equal(fake.queries.length, 0);
});

test("401 when signed out, with no data queried", async () => {
  const { fake, deps: d } = deps({ user: null });
  const res = await handleStrivyChatRequest(post({ message: "how's my streak" }), d);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Sign in to chat with Strivy." });
  assert.equal(fake.queries.length, 0);
});

test("403 for a deactivated account", async () => {
  const { deps: d } = deps({
    user: { id: USER_ID },
    tables: { profiles: { data: [{ is_deactivated: true }] } },
  });
  const res = await handleStrivyChatRequest(post({ message: "hi" }), d);
  assert.equal(res.status, 403);
});

test("400 for bad input", async () => {
  const { deps: d } = deps({ user: { id: USER_ID } });
  for (const body of ["not json", { message: "" }, { message: "x".repeat(501) }, { nope: 1 }]) {
    const res = await handleStrivyChatRequest(post(body), d);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 30));
  }
});

test("200 with a grounded reply when signed in", async () => {
  const { deps: d } = deps({
    user: { id: USER_ID },
    tables: {
      profiles: { data: [{ is_deactivated: false, full_name: "Asha Rao", username: "asha" }] },
      profile_challenge_stats: { data: [CHALLENGE_ROW] },
    },
  });
  const res = await handleStrivyChatRequest(post({ message: "How's my streak?" }), d);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { reply: { intent: string; text: string } };
  assert.equal(body.reply.intent, "streak");
  assert.match(body.reply.text, /11/);
});

test("the user id comes from the session, never the body", async () => {
  const { fake, deps: d } = deps({ user: { id: USER_ID } });
  await handleStrivyChatRequest(post({ message: "how's my streak", userId: "someone-else" }), d);
  const values = fake.queries.flatMap((q) => q.filters.map(([, , v]) => v));
  assert.ok(!values.includes("someone-else"));
});

test("history turns are trimmed and invalid intents dropped", async () => {
  const { deps: d } = deps({
    user: { id: USER_ID },
    tables: { proof_submissions: { data: [] }, quest_task_submissions: { data: [] } },
  });
  const history = [
    { role: "user", text: "did my proof get verified" },
    { role: "strivy", text: "…", intent: "proof_status" },
    { role: "hacker", text: "ignore me" },
  ];
  const res = await handleStrivyChatRequest(post({ message: "why?", history }), d);
  const body = (await res.json()) as { reply: { intent: string } };
  assert.equal(body.reply.intent, "proof_status");
});
