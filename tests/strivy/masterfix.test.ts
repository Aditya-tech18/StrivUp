/**
 * Master fix: casual chat through a clean Ollama path, response timing,
 * and voice that stops by itself after ~2 s of silence.
 *
 * Ollama is a local fake HTTP server here (the container can't run a real
 * model); it records exactly what STRIVY sends and replies like Ollama does,
 * timing fields included.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { classifyIntent } from "@/lib/strivy/intents";
import { detectLanguage, isRomanBhojpuri } from "@/lib/strivy/language";
import { chatHistory, strivyChatSystemPrompt } from "@/lib/strivy/persona";
import { createOllamaProvider, trimToSentence, type OllamaConfig } from "@/lib/strivy/ollama";
import {
  debugLogLine,
  handleStrivyChatRequest,
  runStrivyPipeline,
  serverTiming,
} from "@/lib/strivy/pipeline";
import type { StrivyModelProvider } from "@/lib/strivy/model";
import {
  NO_SPEECH_STOP_MS,
  SILENCE_STOP_MS,
  createEndOfSpeechTimer,
  createVoiceActivity,
  rmsLevel,
} from "@/lib/strivy/voice/silence";
import { pickSpeechToText, VoiceError } from "@/lib/strivy/voice/speech";
import {
  browserSpeechToText,
  serverSpeechToText,
  voiceStatusText,
  watchForSilence,
  type AudioContextLike,
  type ListenStatus,
  type VoiceClock,
  type VoiceWindow,
} from "@/components/features/strivy/voice";

import type { ChatTurn } from "@/lib/strivy/types";
import { USER_ID, fakeSupabase } from "./helpers";

/* ── A fake Ollama ────────────────────────────────────────────────────── */

interface Sent {
  path: string;
  body: Record<string, unknown> & {
    messages?: { role: string; content: string }[];
    options?: Record<string, number>;
  };
}

async function fakeOllama(reply: string, extra: Record<string, unknown> = {}) {
  const requests: Sent[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = req.url ?? "";
      requests.push({ path, body: raw ? JSON.parse(raw) : {} });
      res.setHeader("Content-Type", "application/json");
      if (path === "/api/tags")
        return res.end(JSON.stringify({ models: [{ name: "llama3.2:3b" }] }));
      if (path === "/api/generate") return res.end(JSON.stringify({ done: true }));
      res.end(
        JSON.stringify({
          message: { role: "assistant", content: reply },
          done: true,
          done_reason: "stop",
          total_duration: 900e6,
          load_duration: 20e6,
          prompt_eval_count: 160,
          prompt_eval_duration: 250e6,
          eval_count: 24,
          eval_duration: 600e6,
          ...extra,
        })
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  server.unref();
  const config: OllamaConfig = {
    baseUrl: `http://127.0.0.1:${port}`,
    model: "llama3.2:3b",
    timeoutMs: 30_000,
    keepAlive: "30m",
  };
  const chats = () => requests.filter((r) => r.path === "/api/chat");
  return { config, requests, chats };
}

const quiet = { log: () => undefined, warmUp: false };

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
      quest_participants: { data: [QUEST_ROW] },
      quest_tasks: {
        data: ["t1", "t2", "t3"].map((id) => ({ id, quest_id: "q9", is_required: true })),
      },
      quest_task_submissions: { data: [] },
    },
  });
}

async function ask(message: string, provider: StrivyModelProvider, history: ChatTurn[] = []) {
  const fake = db();
  const result = await runStrivyPipeline({
    supabase: fake.client,
    userId: USER_ID,
    message,
    history,
    provider,
  });
  return { ...result, fake };
}

/* ── Casual chat ─────────────────────────────────────────────────────── */

test("casual messages route to general chat, in the right language, with no DB reads", async () => {
  const cases: [string, string, RegExp][] = [
    ["Hey Strivy, how are you?", "en", /Reply in casual English\./],
    ["bhai kya haal hai?", "hinglish", /casual Hinglish: Hindi written in English letters/],
    ["ka ba haal ba?", "hinglish", /Bhojpuri written in English letters/],
    ["bhai ek funny jawab de", "hinglish", /casual Hinglish/],
    ["How was your day?", "en", /Reply in casual English\./],
  ];
  for (const [message, lang, style] of cases) {
    const { config, chats } = await fakeOllama("All good here, you tell?");
    const { meta, fake } = await ask(message, createOllamaProvider(config, quiet));
    assert.equal(meta.intent, "general_chat", message);
    assert.equal(meta.lang, lang, message);
    assert.equal(meta.mode, "chat", message);
    assert.deepEqual(fake.queries, [], `${message}: small talk reads no personal data`);
    assert.equal(chats().length, 1, `${message}: exactly one Ollama call`);
    assert.match(chats()[0].body.messages![0].content, style, message);
  }
});

test("English input is never pushed to Hindi, and Hinglish never to English", () => {
  const en = strivyChatSystemPrompt({ language: "en" });
  assert.doesNotMatch(en, /Hinglish|Hindi|Devanagari/);
  const hinglish = strivyChatSystemPrompt({ language: "hinglish" });
  assert.match(hinglish, /Never use Devanagari/);
  assert.doesNotMatch(hinglish, /Reply in casual English/);
  // No example words a small model would parrot into a casual reply.
  assert.doesNotMatch(hinglish, /scene|nipta/);
  assert.match(strivyChatSystemPrompt({ language: "hi" }), /Hindi, in Devanagari/);
  assert.match(strivyChatSystemPrompt({ language: "bho" }), /Bhojpuri, in Devanagari/);
});

test("Bhojpuri in Roman letters only when it's clearly Bhojpuri", () => {
  for (const m of ["ka ba haal ba?", "ka haal ba bhai", "hum ta mast bani", "tohar ka haal"]) {
    assert.equal(isRomanBhojpuri(m), true, m);
  }
  for (const m of ["bhai kya haal hai?", "ba", "bhai ek funny jawab de", "ok ba"]) {
    assert.equal(isRomanBhojpuri(m), false, m);
  }
  assert.equal(detectLanguage("Hey Strivy, how are you?"), "en");
  assert.equal(detectLanguage("bhai kya haal hai?"), "hinglish");
  assert.equal(detectLanguage("का हाल बा?"), "bho");
  assert.equal(detectLanguage("क्या हाल है?"), "hi");
});

test("the casual prompt is short: persona, last small-talk turns, the person's words", async () => {
  const { config, chats } = await fakeOllama("Mast hu bhai, tu suna?");
  await ask("bhai kya haal hai?", createOllamaProvider(config, quiet));
  const { messages, options } = chats()[0].body;
  assert.equal(messages!.length, 2);
  assert.equal(messages![1].role, "user");
  assert.equal(messages![1].content, "bhai kya haal hai?", "the message isn't rewritten");
  assert.ok(
    messages![0].content.length < 800,
    `system prompt ${messages![0].content.length} chars`
  );
  const all = JSON.stringify(messages);
  assert.doesNotMatch(all, /FACTS \(|CORRECT ANSWER|Veer Ji|30 Days|couldn't load/);
  assert.equal(options!.num_predict, 96, "short output cap");
  assert.equal(options!.temperature, 0.7);
  assert.equal(options!.repeat_penalty, 1.1);
});

test("a previous data answer is not sent with small talk; a previous small-talk turn is", async () => {
  const afterStreak: ChatTurn[] = [
    { role: "user", text: "meri streak kitni hai" },
    { role: "strivy", text: "'30 Days of Running' pe 11 din ki streak 🔥", intent: "streak" },
  ];
  assert.deepEqual(chatHistory(afterStreak), []);
  const { config, chats } = await fakeOllama("Badhiya bhai, tu bata?");
  await ask("bhai kya haal hai?", createOllamaProvider(config, quiet), afterStreak);
  assert.doesNotMatch(JSON.stringify(chats()[0].body.messages), /11 din|30 Days/);

  const afterChat: ChatTurn[] = [
    { role: "user", text: "hi" },
    { role: "strivy", text: "Hey! Kya scene?", intent: "greeting" },
  ];
  assert.deepEqual(chatHistory(afterChat), afterChat);
  const second = await fakeOllama("Sab mast, tu suna?");
  await ask("bhai kya haal hai?", createOllamaProvider(second.config, quiet), afterChat);
  assert.deepEqual(
    second
      .chats()[0]
      .body.messages!.slice(1)
      .map((m) => m.role),
    ["user", "assistant", "user"]
  );
});

test("a good casual model reply is shown as is", async () => {
  const line = "Main toh ekdum mast hu bhai 😎 Tu suna, kya chal raha hai?";
  const { config } = await fakeOllama(line);
  const { reply, meta } = await ask("bhai kya haal hai?", createOllamaProvider(config, quiet));
  assert.equal(meta.modelUsed, true, JSON.stringify(meta));
  assert.equal(reply.text, line);
});

test("small talk that invents quests, streaks or rewards still falls back", async () => {
  const { config } = await fakeOllama("Your streak is 5 days and you won a reward!");
  const { reply, meta } = await ask(
    "Hey Strivy, how are you?",
    createOllamaProvider(config, quiet)
  );
  assert.equal(meta.modelUsed, false);
  assert.ok(meta.groundingRejected && meta.groundingRejected.length > 0);
  assert.doesNotMatch(reply.text, /5 days|won/);
});

test("a reply cut off at the token cap is trimmed to its last full sentence", async () => {
  assert.equal(trimToSentence("Mast hu bhai! Tu suna, aaj kya"), "Mast hu bhai!");
  assert.equal(trimToSentence("All good 😎 You? Today I was thinking ab"), "All good 😎 You?");
  assert.equal(trimToSentence("no full sentence here"), "");
  const { config } = await fakeOllama("All good here! What about you, did you", {
    done_reason: "length",
  });
  const { reply, meta } = await ask(
    "Hey Strivy, how are you?",
    createOllamaProvider(config, quiet)
  );
  assert.equal(meta.modelUsed, true);
  assert.equal(reply.text, "All good here!");
});

/* ── Grounded answers are unchanged ───────────────────────────────────── */

test("grounded questions still read real data and keep it", async () => {
  const off: StrivyModelProvider = {
    name: "none",
    enabled: false,
    generateResponse: async () => null,
  };
  const quest = await ask("What's my quest?", off);
  assert.equal(quest.meta.intent, "quests");
  assert.equal(quest.meta.mode, "rewrite");
  assert.match(quest.reply.text, /Veer Ji Chaap/);
  assert.ok(quest.fake.queries.some((q) => q.table === "quest_participants"));

  const streak = await ask("Meri streak kitni hai?", off);
  assert.equal(streak.meta.intent, "streak");
  assert.match(streak.reply.text, /11/);
  assert.ok(streak.fake.queries.some((q) => q.table === "profile_challenge_stats"));

  const today = await ask("What did I learn today?", off);
  assert.equal(today.meta.intent, "today");
  assert.match(today.reply.text, /Veer Ji Chaap/);

  const pending = await ask("What's pending?", off);
  assert.equal(pending.meta.intent, "focus");
  assert.match(pending.reply.text, /Veer Ji Chaap/);
  assert.doesNotMatch(pending.reply.text, /11 din|11-day|streak/i, "not just the streak again");
});

test("grounded rewrites still get the facts and the draft, and an invented number is rejected", async () => {
  const { config, chats } = await fakeOllama("Your quest 'Veer Ji Chaap' is at 2/3 🔥");
  const { reply, meta } = await ask("What's my quest?", createOllamaProvider(config, quiet));
  assert.equal(meta.mode, "rewrite");
  assert.match(chats()[0].body.messages![1].content, /FACTS \(the only true information\)/);
  assert.match(chats()[0].body.messages![1].content, /CORRECT ANSWER/);
  assert.equal(meta.modelUsed, false, "2/3 isn't real");
  assert.match(reply.text, /0\/3/);
});

/* ── Timing ──────────────────────────────────────────────────────────── */

test("each reply records where the time went", async () => {
  const { config } = await fakeOllama("All good here, you?");
  const { meta } = await ask("Hey Strivy, how are you?", createOllamaProvider(config, quiet));
  const t = meta.timings;
  for (const k of ["intentMs", "languageMs", "contextMs", "draftMs", "totalMs"] as const) {
    assert.equal(typeof t[k], "number", k);
  }
  assert.equal(typeof t.groundingMs, "number");
  assert.ok(t.totalMs >= (meta.modelMs ?? 0));
  const s = meta.modelStats!;
  assert.equal(s.loadMs, 20);
  assert.equal(s.promptTokens, 160);
  assert.equal(s.firstTokenMs, 270);
  assert.equal(s.outputTokens, 24);
  assert.equal(s.evalMs, 600);
  const line = debugLogLine(meta);
  assert.match(line, /first token 270ms/);
  assert.match(line, /db \d/);
  assert.match(serverTiming(meta, 12, 900), /^auth;dur=12, intent;dur=[\d.]+, .*total;dur=900$/);
});

test("Server-Timing only in debug mode, and never with text or data", async () => {
  const { config } = await fakeOllama("All good here, you?");
  const req = () =>
    new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ message: "hey how are you" }),
    });
  const deps = {
    isEnabled: () => true,
    getSupabase: async () => db().client,
    getProvider: () => createOllamaProvider(config, quiet),
  };
  const plain = await handleStrivyChatRequest(req(), deps);
  assert.equal(plain.headers.get("Server-Timing"), null);
  const lines: string[] = [];
  const dbg = await handleStrivyChatRequest(req(), {
    ...deps,
    debug: () => true,
    log: (l) => lines.push(l),
  });
  const header = dbg.headers.get("Server-Timing") ?? "";
  assert.match(header, /auth;dur=.*model;dur=.*total;dur=/);
  assert.doesNotMatch(header, /hey|how|Aryan|ollama/i);
  assert.match(lines[0], /auth [\d.]+ms · api [\d.]+ms$/);
  assert.deepEqual(Object.keys((await dbg.json()) as object), ["reply"]);
});

test("opening the panel can re-warm the model after a quiet spell", async () => {
  const { config, requests } = await fakeOllama("ok");
  let now = 0;
  const p = createOllamaProvider(config, { log: () => undefined, now: () => now });
  await p.health(true);
  await new Promise((r) => setTimeout(r, 20));
  await p.health(true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(requests.filter((r) => r.path === "/api/generate").length, 1, "once a minute");
  now = 61_000;
  await p.health(true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(requests.filter((r) => r.path === "/api/generate").length, 2);
});

/* ── Silence detection ───────────────────────────────────────────────── */

/** Feeds the timer one observation every 50 ms; returns the first stop. */
function run(timer: ReturnType<typeof createEndOfSpeechTimer>, plan: [boolean, number][]) {
  let now = 0;
  const states: string[] = [];
  for (const [voiced, ms] of plan) {
    for (let t = 0; t < ms; t += 50) {
      const s = timer.observe(voiced, now);
      if (states.at(-1) !== s.state) states.push(s.state);
      if (s.stop) return { stop: s.stop, at: now, states };
      now += 50;
    }
  }
  return { stop: null, at: now, states };
}

test("speech then 2 s of silence stops the recording", () => {
  const r = run(createEndOfSpeechTimer(), [
    [false, 500],
    [true, 1500],
    [false, 5000],
  ]);
  assert.equal(r.stop, "silence");
  assert.equal(r.at, 2000 + SILENCE_STOP_MS, "2 s after the last speech, not a fixed length");
  assert.deepEqual(r.states, ["waiting", "speaking", "pausing"]);
});

test("a short pause mid-sentence resets the silence timer", () => {
  // "Bhai meri… [1.5 s] quest kya hai?"
  const r = run(createEndOfSpeechTimer(), [
    [true, 800],
    [false, 1500],
    [true, 1000],
    [false, 5000],
  ]);
  assert.equal(r.stop, "silence");
  assert.equal(r.at, 3300 + SILENCE_STOP_MS);
  assert.deepEqual(r.states, ["waiting", "speaking", "pausing", "speaking", "pausing"]);
});

test("silence before any speech doesn't stop at 2 s; no speech at all stops at 8 s", () => {
  const r = run(createEndOfSpeechTimer(), [[false, 20_000]]);
  assert.equal(r.stop, "no-speech");
  assert.equal(r.at, NO_SPEECH_STOP_MS);
  // A click shorter than real speech doesn't count as speech.
  const click = run(createEndOfSpeechTimer(), [
    [true, 50],
    [false, 3000],
  ]);
  assert.equal(click.stop, null);
});

test("loudness becomes speech above the room's background, with hysteresis", () => {
  const vad = createVoiceActivity();
  assert.equal(vad.sawSignal, false);
  for (let i = 0; i < 10; i++) assert.equal(vad.level(0.003), false, "quiet room");
  assert.equal(vad.level(0.08), true, "talking");
  assert.equal(vad.level(0.01), true, "a softer word ending stays speech");
  assert.equal(vad.level(0.003), false, "quiet again");
  assert.equal(vad.sawSignal, true);
  assert.equal(rmsLevel([0.5, -0.5, 0.5, -0.5]), 0.5);
  assert.equal(rmsLevel([]), 0);
});

/* ── Silence detection in the recorders ───────────────────────────────── */

function fakeClock() {
  let now = 0;
  const timers = new Map<number, { fn: () => void; ms: number; next: number }>();
  let id = 0;
  const clock: VoiceClock = {
    now: () => now,
    setInterval: (fn, ms) => {
      timers.set(++id, { fn, ms, next: now + ms });
      return id;
    },
    clearInterval: (i) => void timers.delete(i as number),
  };
  const advance = (ms: number) => {
    const end = now + ms;
    while (true) {
      const due = [...timers.entries()].sort((a, b) => a[1].next - b[1].next)[0];
      if (!due || due[1].next > end) break;
      now = due[1].next;
      due[1].next += due[1].ms;
      due[1].fn();
    }
    now = end;
  };
  return { clock, advance, active: () => timers.size };
}

/** An AudioContext whose microphone level the test sets. */
function fakeAudio(state = "running") {
  const audio = {
    level: 0,
    closed: false,
    disconnected: false,
    Ctx: null as unknown as new () => AudioContextLike,
  };
  class Ctx implements AudioContextLike {
    state = state;
    async resume() {}
    async close() {
      audio.closed = true;
    }
    createMediaStreamSource() {
      return {
        connect() {},
        disconnect() {
          audio.disconnected = true;
        },
      };
    }
    createAnalyser() {
      return {
        fftSize: 0,
        getFloatTimeDomainData(a: Float32Array) {
          for (let i = 0; i < a.length; i++) a[i] = i % 2 ? audio.level : -audio.level;
        },
      };
    }
  }
  audio.Ctx = Ctx;
  return audio;
}

function recorderWindow(opts: { audio?: ReturnType<typeof fakeAudio>; denied?: boolean } = {}) {
  const stopped: string[] = [];
  const recorders: { state: string; stop(): void }[] = [];
  class Rec {
    mimeType = "audio/webm";
    state = "inactive";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    static isTypeSupported = (t: string) => t === "audio/webm";
    start() {
      this.state = "recording";
      recorders.push(this);
    }
    stop() {
      if (this.state !== "recording") return;
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
      });
      this.onstop?.();
    }
  }
  const w: VoiceWindow = {
    MediaRecorder: Rec as never,
    ...(opts.audio ? { AudioContext: opts.audio.Ctx as never } : {}),
    navigator: {
      mediaDevices: {
        async getUserMedia() {
          if (opts.denied) throw Object.assign(new Error("no"), { name: "NotAllowedError" });
          return { getTracks: () => [{ stop: () => stopped.push("track") }] } as never;
        },
      },
    },
  };
  return { w, stopped, recorders };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function transcriber(text: string) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    return Response.json({ text });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test("Gemini recording: speech, 2 s of silence, stops by itself and sends the transcript", async () => {
  const audio = fakeAudio();
  const { w, stopped, recorders } = recorderWindow({ audio });
  const { clock, advance, active } = fakeClock();
  const { fetchImpl, calls } = transcriber("Bhai meri quest kya hai?");
  const statuses: ListenStatus[] = [];
  const session = serverSpeechToText(w, fetchImpl, clock)!.listen({
    lang: "hi-IN",
    // v6: a hint is only sent when the person overrode "Auto".
    hint: "hi-IN",
    onStatus: (s) => statuses.push(s),
  });
  await tick();
  advance(500); // a moment before speaking
  audio.level = 0.1;
  advance(1200); // "Bhai meri…"
  audio.level = 0.001;
  advance(1200); // short pause: still recording
  assert.equal(recorders[0].state, "recording", "a short pause doesn't stop it");
  audio.level = 0.1;
  advance(800); // "…quest kya hai?"
  audio.level = 0.001;
  advance(1900);
  assert.equal(recorders[0].state, "recording", "not yet 2 s of silence");
  advance(200);
  assert.equal(recorders[0].state, "inactive", "stopped after 2 s of silence");
  assert.equal(await session.result, "Bhai meri quest kya hai?");
  assert.deepEqual(calls, ["/api/strivy/voice/transcribe?lang=hi-IN"]);
  assert.deepEqual(statuses, [
    "waiting",
    "speaking",
    "pausing",
    "speaking",
    "pausing",
    "transcribing",
  ]);
  assert.deepEqual(stopped, ["track"], "mic closed");
  assert.equal(audio.closed, true, "AudioContext closed");
  assert.equal(audio.disconnected, true);
  assert.equal(active(), 0, "no timer left running");
});

test("Gemini recording: the Stop button still works mid-speech", async () => {
  const audio = fakeAudio();
  const { w, recorders } = recorderWindow({ audio });
  const { clock, advance, active } = fakeClock();
  const { fetchImpl } = transcriber("meri streak");
  const session = serverSpeechToText(w, fetchImpl, clock)!.listen({ lang: "en-IN" });
  await tick();
  audio.level = 0.1;
  advance(600);
  session.stop();
  assert.equal(recorders[0].state, "inactive");
  assert.equal(await session.result, "meri streak");
  assert.equal(audio.closed, true);
  assert.equal(active(), 0);
});

test("Gemini recording: nothing said for 8 s closes the mic without uploading", async () => {
  const audio = fakeAudio();
  const { w, stopped } = recorderWindow({ audio });
  const { clock, advance } = fakeClock();
  const { fetchImpl, calls } = transcriber("x");
  const session = serverSpeechToText(w, fetchImpl, clock)!.listen({ lang: "en-IN" });
  await tick();
  audio.level = 0.002;
  advance(NO_SPEECH_STOP_MS + 100);
  await assert.rejects(
    session.result,
    (e: unknown) => e instanceof VoiceError && e.kind === "no-speech"
  );
  assert.deepEqual(calls, [], "no empty audio sent to the speech service");
  assert.deepEqual(stopped, ["track"]);
});

test("Gemini recording: no AudioContext, or a suspended one, means manual stop only", async () => {
  for (const audio of [undefined, fakeAudio("suspended")]) {
    const { w, recorders } = recorderWindow({ audio });
    const { clock, advance } = fakeClock();
    const { fetchImpl } = transcriber("hello");
    const session = serverSpeechToText(w, fetchImpl, clock)!.listen({ lang: "en-IN" });
    await tick();
    if (audio) audio.level = 0.1;
    advance(15_000);
    assert.equal(recorders[0].state, "recording", "never cut off by mistake");
    session.stop();
    assert.equal(await session.result, "hello");
  }
});

test("Gemini recording: a denied microphone is a clear error", async () => {
  const { w } = recorderWindow({ denied: true });
  const session = serverSpeechToText(w, transcriber("x").fetchImpl, fakeClock().clock)!.listen({
    lang: "en-IN",
  });
  await assert.rejects(
    session.result,
    (e: unknown) => e instanceof VoiceError && e.kind === "denied"
  );
});

test("watchForSilence cleans up once, however often it's called", () => {
  const audio = fakeAudio();
  const { clock, active } = fakeClock();
  const dispose = watchForSilence(
    { getTracks: () => [] } as never,
    { navigator: {}, AudioContext: audio.Ctx as never },
    () => undefined,
    undefined,
    clock
  );
  assert.equal(active(), 1);
  dispose();
  dispose();
  assert.equal(active(), 0);
  assert.equal(audio.closed, true);
});

/** A Web Speech recogniser the test drives by hand. */
function manualRecognition() {
  const recs: {
    continuous: boolean;
    stopped: boolean;
    say(text: string, final?: boolean): void;
  }[] = [];
  class Rec {
    lang = "";
    interimResults = false;
    continuous = false;
    maxAlternatives = 1;
    stopped = false;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error?: string }) => void) | null = null;
    onend: (() => void) | null = null;
    private results: { isFinal: boolean; 0: { transcript: string } }[] = [];
    start() {
      recs.push(this);
    }
    say(text: string, final = true) {
      this.results.push({ isFinal: final, 0: { transcript: text } });
      this.onresult?.({
        resultIndex: this.results.length - 1,
        results: Object.assign([...this.results], { length: this.results.length }),
      });
    }
    stop() {
      this.stopped = true;
      this.onend?.();
    }
    abort() {
      this.onend?.();
    }
  }
  return { w: { webkitSpeechRecognition: Rec as never, navigator: {} } as VoiceWindow, recs };
}

test("browser recognition: keeps listening through a pause, stops 2 s after the last words", async () => {
  const { w, recs } = manualRecognition();
  const { clock, advance, active } = fakeClock();
  const statuses: ListenStatus[] = [];
  const session = browserSpeechToText(w, clock)!.listen({
    lang: "hi-IN",
    onStatus: (s) => statuses.push(s),
  });
  const rec = recs[0];
  assert.equal(rec.continuous, true, "the recogniser's own quick cut-off is off");
  advance(1000);
  rec.say("Bhai meri ");
  advance(1500); // pause
  assert.equal(rec.stopped, false);
  rec.say("quest kya hai?");
  advance(1900);
  assert.equal(rec.stopped, false);
  advance(200);
  assert.equal(rec.stopped, true);
  assert.equal(await session.result, "Bhai meri quest kya hai?");
  assert.deepEqual(statuses, ["waiting", "speaking", "pausing", "speaking", "pausing"]);
  assert.equal(active(), 0);
});

test("browser recognition: manual stop and silence-only both behave", async () => {
  const a = manualRecognition();
  const c1 = fakeClock();
  const s1 = browserSpeechToText(a.w, c1.clock)!.listen({ lang: "en-IN" });
  a.recs[0].say("what's my streak");
  s1.stop();
  assert.equal(await s1.result, "what's my streak");
  assert.equal(c1.active(), 0);

  const b = manualRecognition();
  const c2 = fakeClock();
  const s2 = browserSpeechToText(b.w, c2.clock)!.listen({ lang: "en-IN" });
  c2.advance(NO_SPEECH_STOP_MS + 200);
  assert.equal(b.recs[0].stopped, true);
  await assert.rejects(
    s2.result,
    (e: unknown) => e instanceof VoiceError && e.kind === "no-speech"
  );
});

/* ── Voice UI and provider ───────────────────────────────────────────── */

test("the voice bar says what's happening at each step", () => {
  assert.equal(voiceStatusText("off", null), "");
  assert.equal(voiceStatusText("starting", null), "Getting the mic ready…");
  assert.equal(voiceStatusText("listening", "waiting"), "Listening… go ahead");
  assert.equal(voiceStatusText("listening", "speaking"), "Listening…");
  assert.match(voiceStatusText("listening", "pausing"), /Still listening/);
  assert.match(voiceStatusText("thinking", "transcribing"), /writing that down/);
  assert.equal(voiceStatusText("thinking", null), "On it…");
  assert.doesNotMatch(
    ["waiting", "speaking", "pausing", "transcribing"]
      .map((h) => voiceStatusText("listening", h as ListenStatus))
      .join(" "),
    /gemini|api|error|vad|rms/i,
    "no technical words"
  );
});

test("STRIVY_VOICE_PROVIDER=gemini still picks Gemini recording", () => {
  assert.equal(
    pickSpeechToText(
      { speechRecognition: true, mediaRecorder: true },
      { gemini: true, prefer: "gemini" }
    ),
    "gemini"
  );
});

test("a spoken quest question gets the same grounded answer as typed text", async () => {
  const typed = classifyIntent("Bhai meri quest kya hai?");
  assert.equal(typed.intent, "quests");
  const off: StrivyModelProvider = {
    name: "none",
    enabled: false,
    generateResponse: async () => null,
  };
  const { reply, meta } = await ask("Bhai meri quest kya hai?", off);
  assert.equal(meta.intent, "quests");
  assert.match(reply.text, /Veer Ji Chaap/);
});

test("a chatty casual reply keeps its first sentences instead of a canned fallback", async () => {
  const chatty =
    "Main toh mast hu bhai! Aaj mausam bhi badhiya hai. Tu suna, kya chal raha hai? Chai pi? Aur bata, weekend plan?";
  const { config } = await fakeOllama(chatty);
  const { reply, meta } = await ask("bhai kya haal hai?", createOllamaProvider(config, quiet));
  assert.equal(meta.modelUsed, true, JSON.stringify(meta));
  assert.equal(
    reply.text,
    "Main toh mast hu bhai! Aaj mausam bhi badhiya hai. Tu suna, kya chal raha hai?"
  );
});
