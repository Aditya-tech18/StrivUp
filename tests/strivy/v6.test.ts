/**
 * v6 companion upgrade: STRIVUP company questions, the OpenRouter
 * "reasoning is mandatory" 400, automatic multilingual voice, replies in the
 * person's language, and the playful companion popups (rules, cooldowns,
 * dismissal, blockers, safety).
 *
 * OpenRouter and Gemini are faked with injected fetches; nothing here calls
 * a real API or a real database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FREE_ROUTER_MODEL,
  createOpenRouterProvider,
  isReasoningRequiredError,
} from "@/lib/strivy/openrouter";
import { classifyIntent, intentCategory, isCompanyQuestion } from "@/lib/strivy/intents";
import { detectLanguage } from "@/lib/strivy/language";
import { STRIVUP_TEAM } from "@/lib/strivy/knowledge";
import { deterministicProvider, type StrivyModelProvider } from "@/lib/strivy/model";
import { runStrivyPipeline } from "@/lib/strivy/pipeline";
import { BANNED_WORDS } from "@/lib/strivy/persona";
import {
  TRANSCRIBE_PROMPT,
  handleVoiceTranscribeRequest,
  transcribeWithGemini,
} from "@/lib/strivy/voice/server";
import {
  VOICE_LANGS,
  autoListenLang,
  listenLang,
  pickSpeechToText,
  transcribeHint,
  voiceLangChoice,
} from "@/lib/strivy/voice/speech";
import { createRateLimiter } from "@/lib/strivy/ratelimit";
import { serverSpeechToText, type VoiceWindow } from "@/components/features/strivy/voice";
import {
  CELEBRATION_COOLDOWN_MS,
  COOLDOWN_MS,
  DISMISS_SNOOZE_MS,
  MAX_DISMISSALS_PER_DAY,
  MAX_PER_SESSION,
  SERIOUS_QUIET_MS,
  candidateLines,
  decideCompanion,
  emptyPersisted,
  emptySession,
  formatDuration,
  isSafeCompanionLine,
  recordDismiss,
  recordSerious,
  type CompanionBlockers,
  type CompanionEvent,
  type CompanionPersisted,
  type CompanionSession,
} from "@/lib/strivy/companion/engine";
import { COMPANION_LINES } from "@/lib/strivy/companion/messages";
import { isSeriousMessage } from "@/lib/strivy/companion/serious";
import { TYPING_GRACE_MS, readBlockers } from "@/components/features/strivy/companion";
import type { ChatTurn } from "@/lib/strivy/types";
import { USER_ID, fakeSupabase } from "./helpers";

/* ── Shared fakes ────────────────────────────────────────────────────── */

/** A person with a 4-day streak on "CDS preparation" and quest "Veer Ji Chaap" 0/3. */
function db() {
  return fakeSupabase({
    user: { id: USER_ID },
    tables: {
      profiles: { data: [{ full_name: "Aditya", username: "aditya" }] },
      profile_challenge_stats: {
        data: [
          {
            challenge_id: "c-cds",
            title: "CDS preparation",
            status: "active",
            current_day: 5,
            duration_days: 30,
            current_streak: 4,
            longest_streak: 4,
            consistency_pct: 80,
            joined_at: "2026-09-28T00:00:00Z",
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
  provider: StrivyModelProvider = deterministicProvider,
  history: ChatTurn[] = []
) {
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

interface Sent {
  body: {
    model?: string;
    max_tokens?: number;
    reasoning?: Record<string, unknown>;
    provider?: { max_price?: { prompt: number; completion: number } };
  };
}

type FakeReply = { status: number; json: unknown };

function completion(content: string, extra: Record<string, unknown> = {}): FakeReply {
  return {
    status: 200,
    json: {
      model: "some-lab/thinking-model:free",
      choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0 },
      ...extra,
    },
  };
}

/** OpenRouter's exact refusal for a reasoning-only endpoint. */
const REASONING_400: FakeReply = {
  status: 400,
  json: {
    error: {
      code: 400,
      message: "Reasoning is mandatory for this endpoint and cannot be disabled.",
    },
  },
};

function openRouter(...replies: (FakeReply | ((s: Sent) => FakeReply))[]) {
  const sent: Sent[] = [];
  const logs: string[] = [];
  let i = 0;
  const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
    const s: Sent = { body: init?.body ? JSON.parse(String(init.body)) : {} };
    sent.push(s);
    const r = replies[Math.min(i++, replies.length - 1)];
    const out = typeof r === "function" ? r(s) : r;
    return new Response(JSON.stringify(out.json), {
      status: out.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  let clock = 1_000_000;
  const provider = createOpenRouterProvider(
    {
      apiKey: "sk-or-v1-test0000000000000000000000000000",
      model: FREE_ROUTER_MODEL,
      timeoutMs: 2000,
      baseUrl: "https://openrouter.ai/api/v1",
    },
    { fetch: fetchImpl, log: (m) => logs.push(m), now: () => clock }
  );
  return {
    provider,
    sent,
    logs,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

/* ══ A. Founder and company questions ═════════════════════════════════ */

const COMPANY_QUESTIONS = [
  "bhai strivup k co founder kon h",
  "founder",
  "co-founder of strivup?",
  "cofounder kaun hai",
  "who are the founders of strivup",
  "who founded STRIVUP?",
  "who created STRIVUP",
  "STRIVUP team",
  "strivup team members",
  "who is the CEO?",
  "CTO kaun hai",
  "strivup ka CMO kon hai",
  "who is the COO of strivup",
  "strivup kisne banaya",
  "strivup ke co founder kon hain",
  "team me kaun kaun hai",
  "स्ट्रिवअप के संस्थापक कौन हैं",
];

test("A. founder, team and leadership questions route to company_info", () => {
  for (const m of COMPANY_QUESTIONS) {
    const r = classifyIntent(m);
    assert.equal(r.intent, "company_info", `${m} → ${r.intent} (${r.matched.join(",")})`);
    assert.equal(intentCategory(r), "COMPANY");
    for (const wrong of ["how_it_works", "challenges", "quests", "streak", "general_chat"]) {
      assert.notEqual(r.intent, wrong, m);
    }
  }
});

test("A. the reported bug: 'bhai strivup k co founder kon h' no longer gets the how-it-works answer", async () => {
  const { reply, meta, fake } = await ask("bhai strivup k co founder kon h");
  assert.equal(meta.intent, "company_info");
  assert.equal(reply.intent, "company_info");
  assert.doesNotMatch(reply.text, /pick a challenge or quest|upload proof, get it verified/i);
  assert.match(reply.text, /founders/i);
  assert.equal(fake.queries.length, 0, "a company question reads no personal data");
});

test("A. other companies and app items are not STRIVUP company questions", () => {
  for (const m of [
    "who is the founder of google",
    "tesla ka ceo kaun hai",
    "ye challenge kisne banaya",
    "who created this challenge",
    "how does strivup work",
    "what is strivup",
    "my team lost the match",
  ]) {
    assert.equal(isCompanyQuestion(m.toLowerCase()), false, m);
    assert.notEqual(classifyIntent(m).intent, "company_info", m);
  }
});

test("A. names are never invented: with no published team, STRIVY says it doesn't know", async () => {
  assert.equal(STRIVUP_TEAM.length, 0, "no founder names exist in STRIVUP's own content");
  for (const m of [
    "who founded STRIVUP?",
    "bhai strivup k co founder kon h",
    "स्ट्रिवअप के संस्थापक कौन हैं",
  ]) {
    const { reply } = await ask(m);
    assert.match(
      reply.text,
      /current knowledge|knowledge me nahi|जानकारी में नहीं/,
      `${m}: ${reply.text}`
    );
    assert.match(reply.text, /strivup\.officialteam@gmail\.com/);
    assert.deepEqual(reply.links, [{ label: "About STRIVUP", href: "/settings/about" }]);
  }
});

test("A. a model can never rewrite a company answer (so it can't add a name)", async () => {
  let called = 0;
  const { provider } = openRouter((): FakeReply => {
    called++;
    return completion("STRIVUP was founded by Rahul Sharma and Priya Verma.");
  });
  const { reply, meta } = await ask("who is the cofounder of strivup", provider);
  assert.equal(called, 0, "the model is not asked");
  assert.equal(meta.fallbackReason, "never rewritten");
  assert.doesNotMatch(reply.text, /Rahul|Priya/);
});

test("A. company answers follow the person's language", async () => {
  const en = await ask("who founded STRIVUP?");
  assert.match(en.reply.text, /^I don't have the names/);
  const hinglish = await ask("bhai strivup k co founder kon h");
  assert.match(hinglish.reply.text, /^Bhai, STRIVUP ke founders/);
  const hi = await ask("स्ट्रिवअप के संस्थापक कौन हैं");
  assert.match(hi.reply.text, /मेरी अभी की जानकारी/);
});

/* ══ B. Follow-up company questions ═══════════════════════════════════ */

const AFTER_COMPANY: ChatTurn[] = [
  { role: "user", text: "strivup ke founder kaun hai" },
  { role: "strivy", text: "Bhai, STRIVUP ke founders…", intent: "company_info" },
];

test("B. short follow-ups after a company answer stay on the company", () => {
  for (const m of [
    "unka naam kya hai?",
    "and the CEO?",
    "contact kaise karu?",
    "aur team?",
    "where is it based",
  ]) {
    assert.equal(classifyIntent(m, AFTER_COMPANY).intent, "company_info", m);
  }
  // A data question after a company answer is still a data question.
  assert.equal(classifyIntent("meri streak?", AFTER_COMPANY).intent, "streak");
  assert.equal(classifyIntent("what is my current quest", AFTER_COMPANY).intent, "quests");
  // Without a company answer before it, "unka naam kya hai?" isn't company.
  assert.notEqual(classifyIntent("unka naam kya hai?").intent, "company_info");
});

/* ══ C. OpenRouter "reasoning is mandatory" 400 ═══════════════════════ */

test("C. the exact OpenRouter refusal is recognised", () => {
  assert.ok(
    isReasoningRequiredError("Reasoning is mandatory for this endpoint and cannot be disabled.")
  );
  assert.ok(isReasoningRequiredError("reasoning is required for this model"));
  assert.ok(isReasoningRequiredError("Provider returned error: mandatory reasoning"));
  assert.equal(isReasoningRequiredError("Invalid provider.max_price"), false);
  assert.equal(isReasoningRequiredError("Rate limit exceeded"), false);
});

test("C. a reasoning-mandatory 400 is retried once with reasoning on, still free, and the reply is used", async () => {
  const or = openRouter(REASONING_400, completion("Arre waah, chal batao kya scene hai 😏"));
  const { reply, meta } = await ask("kya haal hai bhai", or.provider);
  assert.equal(or.sent.length, 2, "one retry");
  // First try: reasoning off (cheapest). Retry: never `enabled: false`.
  assert.deepEqual(or.sent[0].body.reasoning, { enabled: false, exclude: true });
  assert.deepEqual(or.sent[1].body.reasoning, { effort: "low", exclude: true });
  assert.ok((or.sent[1].body.max_tokens ?? 0) > (or.sent[0].body.max_tokens ?? 0), "room to think");
  for (const s of or.sent) {
    assert.equal(s.body.model, FREE_ROUTER_MODEL, "free model id on every try");
    assert.deepEqual(s.body.provider?.max_price, { prompt: 0, completion: 0 }, "$0 cap kept");
  }
  assert.equal(meta.modelUsed, true);
  assert.equal(meta.modelError, null);
  assert.match(reply.text, /kya scene hai/);
});

test("C. after the refusal, the next requests send reasoning-required settings straight away (no wasted 400)", async () => {
  const or = openRouter(REASONING_400, completion("Sab badhiya 😄"), completion("Haan bhai 😄"));
  await ask("kya haal hai", or.provider);
  await ask("bored hoon yaar", or.provider);
  assert.equal(or.sent.length, 3);
  assert.deepEqual(or.sent[2].body.reasoning, { effort: "low", exclude: true });
  // Not forever: after the window, STRIVY tries switching reasoning off again.
  or.advance(31 * 60_000);
  await ask("kaise ho", or.provider);
  assert.deepEqual(or.sent[3].body.reasoning, { enabled: false, exclude: true });
});

test("C. the refusal inside a 200 body (upstream error) and in metadata.raw is handled too", async () => {
  const inBody = openRouter(
    {
      status: 200,
      json: {
        error: {
          code: 400,
          message: "Provider returned error",
          metadata: {
            raw: '{"error":"Reasoning is mandatory for this endpoint and cannot be disabled."}',
          },
        },
      },
    },
    completion("Haan bolo 😄")
  );
  const { meta } = await ask("kya chal raha hai", inBody.provider);
  assert.equal(inBody.sent.length, 2);
  assert.deepEqual(inBody.sent[1].body.reasoning, { effort: "low", exclude: true });
  assert.equal(meta.modelUsed, true);
});

test("C. a second refusal does not loop: STRIVY falls back to its grounded reply", async () => {
  const or = openRouter(REASONING_400, REASONING_400, REASONING_400);
  const { reply, meta } = await ask("meri streak kitni hai?", or.provider);
  assert.ok(or.sent.length <= 3, `at most one request plus two retries, got ${or.sent.length}`);
  assert.equal(meta.modelUsed, false);
  assert.match(String(meta.modelError), /HTTP 400/);
  assert.match(reply.text, /4/, "the grounded draft (4-day streak) is shown");
  assert.doesNotMatch(reply.text, /Reasoning is mandatory|HTTP|400/);
});

test("C. a reasoning-required retry still trips the cost breaker and never calls a paid model", async () => {
  const or = openRouter(
    REASONING_400,
    completion("hi", { usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0004 } })
  );
  const first = await ask("hello bhai", or.provider);
  assert.equal(first.meta.modelUsed, false);
  const before = or.sent.length;
  await ask("kya haal", or.provider);
  assert.equal(or.sent.length, before, "switched off after a reported cost");
  for (const s of or.sent) assert.equal(s.body.model, FREE_ROUTER_MODEL);
});

test("C. reasoning text never reaches the person", async () => {
  const or = openRouter(
    REASONING_400,
    completion("<think>The user greets me, respond casually.</think>Hey! Kya scene hai? 😄")
  );
  const { reply } = await ask("hey kya haal", or.provider);
  assert.doesNotMatch(reply.text, /think|The user greets/);
});

/* ══ D–I. Multilingual voice ══════════════════════════════════════════ */

const VOICE_SAMPLES: { text: string; intent: string; lang: string }[] = [
  // E. English
  { text: "what is my current quest?", intent: "quests", lang: "en" },
  // F. Hinglish
  { text: "bhai meri streak kitni hai?", intent: "streak", lang: "hinglish" },
  { text: "meri quest ka kya pending hai?", intent: "quests", lang: "hinglish" },
  { text: "bhai aaj kya scene hai?", intent: "today", lang: "hinglish" },
  { text: "bhai kal se pakka start karunga", intent: "general_chat", lang: "hinglish" },
  // G. Hindi + English mixed in one sentence
  { text: "tell me meri progress kya hai", intent: "progress", lang: "hinglish" },
  // D. Hindi, as the hi-IN recogniser writes it (English app words in Devanagari)
  { text: "भाई मेरी स्ट्रीक कितनी है", intent: "streak", lang: "hi" },
  { text: "मेरी क्वेस्ट का क्या पेंडिंग है", intent: "quests", lang: "hi" },
  { text: "टेल मी मेरी प्रोग्रेस क्या है", intent: "progress", lang: "hi" },
  // H. Bhojpuri (Roman and Devanagari)
  { text: "ka ba haal ba bhai?", intent: "general_chat", lang: "hinglish" },
  { text: "का बा हाल बा भाई", intent: "general_chat", lang: "bho" },
  { text: "हमार streak केतना बा", intent: "streak", lang: "bho" },
];

test("D–H. spoken English, Hindi, Hinglish, mixed and Bhojpuri route to the right intent and language", () => {
  for (const s of VOICE_SAMPLES) {
    assert.equal(classifyIntent(s.text).intent, s.intent, s.text);
    assert.equal(detectLanguage(s.text), s.lang, s.text);
  }
});

test("D–H. a voice transcript gets a grounded answer in the speaker's language (DB facts exact)", async () => {
  const en = await ask("what is my streak");
  assert.match(en.reply.text, /4/);
  assert.doesNotMatch(en.reply.text, /[ऀ-ॿ]/, "English stays English");
  const hinglish = await ask("bhai meri streak kitni hai?");
  assert.match(hinglish.reply.text, /4 din/);
  const hi = await ask("भाई मेरी स्ट्रीक कितनी है");
  assert.match(hi.reply.text, /[ऀ-ॿ]/);
  assert.match(hi.reply.text, /4/);
  const bho = await ask("हमार streak केतना बा");
  assert.match(bho.reply.text, /4/);
  assert.match(bho.reply.text, /बा|के|रउआ|तोहार/);
  // Facts never change with the language.
  for (const r of [en, hinglish, hi, bho])
    assert.doesNotMatch(r.reply.text, /\b(3|5|30) (days|din)\b/);
});

test("I. automatic language: 'Auto' is the default and needs no choice", () => {
  assert.equal(VOICE_LANGS[0], "auto");
  assert.equal(voiceLangChoice(null), "auto");
  assert.equal(voiceLangChoice("en-IN"), "en-IN");
  assert.equal(voiceLangChoice("anything else"), "auto");
  // Auto sends no language hint to Gemini; an override does.
  assert.equal(transcribeHint("auto"), null);
  assert.equal(transcribeHint("hi-IN"), "hi-IN");
});

test("I. browser recogniser follows the language the person is actually using", () => {
  assert.equal(autoListenLang([]), "hi-IN", "no signal: the code-mixed Indian model");
  assert.equal(autoListenLang(["what is my current quest?"]), "en-IN");
  assert.equal(autoListenLang(["bhai meri streak kitni hai"]), "hi-IN");
  assert.equal(autoListenLang(["भाई क्या हाल है"]), "hi-IN");
  assert.equal(autoListenLang(["ka ba haal ba"]), "hi-IN");
  // Newest first; "ok" has no signal so the one before decides.
  assert.equal(autoListenLang(["ok", "how many tasks are left today"]), "en-IN");
  assert.equal(autoListenLang(["meri quest?", "what is my streak"]), "hi-IN");
  // An override always wins.
  assert.equal(listenLang("en-IN", ["bhai kya haal"]), "en-IN");
});

test("I. with Gemini set up, Auto uses it (it detects the language itself)", () => {
  const both = { speechRecognition: true, mediaRecorder: true };
  assert.equal(pickSpeechToText(both, { gemini: true, prefer: "auto" }), "gemini");
  assert.equal(pickSpeechToText(both, { gemini: false, prefer: "auto" }), "browser");
  assert.equal(pickSpeechToText(both, { gemini: true, prefer: "browser" }), "browser");
});

test("I. Gemini transcription prompt asks for automatic, multilingual detection", async () => {
  for (const want of [
    /automatically/,
    /Hindi/,
    /Hinglish/,
    /Bhojpuri/,
    /Tamil/,
    /Bengali/,
    /mid-sentence/,
  ]) {
    assert.match(TRANSCRIBE_PROMPT, want);
  }
  let body = "";
  const fake = (async (_u: string, init: RequestInit) => {
    body = String(init.body);
    return Response.json({
      candidates: [{ content: { parts: [{ text: "bhai meri streak kitni hai" }] } }],
    });
  }) as unknown as typeof fetch;
  const text = await transcribeWithGemini(
    { base64: "AAAA", mimeType: "audio/webm" },
    { apiKey: "AIza-test", model: "gemini-test" },
    fake
  );
  assert.equal(text, "bhai meri streak kitni hai");
  assert.doesNotMatch(body, /prefers (en|hi)-IN/, "no language hint in auto mode");
});

test("I. transcribe endpoint: no lang means auto; the reply style comes back with the text", async () => {
  const bodies: string[] = [];
  const gemini = (reply: string) =>
    (async (_u: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return Response.json({ candidates: [{ content: { parts: [{ text: reply }] } }] });
    }) as unknown as typeof fetch;
  const deps = (reply: string) => ({
    isEnabled: () => true,
    getSupabase: async () => fakeSupabase({ user: { id: USER_ID } }).client,
    getEnv: () => ({
      config: { gemini: true, prefer: "auto" as const },
      gemini: { apiKey: "AIza-test", model: "gemini-test" },
    }),
    limiter: createRateLimiter(100, 60_000),
    fetch: gemini(reply),
  });
  const req = (q = "") =>
    new Request(`http://x/api/strivy/voice/transcribe${q}`, {
      method: "POST",
      headers: { "Content-Type": "audio/webm" },
      body: new Uint8Array(10),
    });
  for (const [spoken, lang] of [
    ["what is my current quest", "en"],
    ["bhai meri streak kitni hai", "hinglish"],
    ["भाई मेरी स्ट्रीक कितनी है", "hi"],
    ["हमार streak केतना बा", "bho"],
  ] as const) {
    const res = await handleVoiceTranscribeRequest(req(), deps(spoken));
    assert.deepEqual(await res.json(), { text: spoken, lang });
  }
  assert.ok(
    bodies.every((b) => !/prefers/.test(b)),
    "no hint without lang"
  );
  await handleVoiceTranscribeRequest(req("?lang=auto"), deps("ok"));
  assert.doesNotMatch(bodies.at(-1)!, /prefers/);
  await handleVoiceTranscribeRequest(req("?lang=hi-IN"), deps("ok"));
  assert.match(
    bodies.at(-1)!,
    /prefers hi-IN, but transcribe whatever language is actually spoken/
  );
});

test("I. browser recording in auto mode sends no language to our endpoint", async () => {
  class Rec {
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["x"]) });
      this.onstop?.();
    }
  }
  const w = {
    MediaRecorder: Object.assign(Rec, { isTypeSupported: () => true }),
    navigator: {
      mediaDevices: {
        async getUserMedia() {
          return { getTracks: () => [{ stop() {} }] } as never;
        },
      },
    },
  } as unknown as VoiceWindow;
  const urls: string[] = [];
  const stt = serverSpeechToText(w, (async (url: string) => {
    urls.push(url);
    return Response.json({ text: "bhai meri streak kitni hai", lang: "hinglish" });
  }) as unknown as typeof fetch)!;
  const session = stt.listen({ lang: "hi-IN", hint: null });
  await new Promise((r) => setTimeout(r, 10));
  session.stop();
  assert.equal(await session.result, "bhai meri streak kitni hai");
  assert.deepEqual(urls, ["/api/strivy/voice/transcribe"]);
});

test("I. text chat stays on OpenRouter and voice stays on Gemini", () => {
  const pipeline = readFileSync("src/lib/strivy/pipeline.ts", "utf8");
  const openrouter = readFileSync("src/lib/strivy/openrouter.ts", "utf8");
  const voice = readFileSync("src/lib/strivy/voice/server.ts", "utf8");
  assert.doesNotMatch(pipeline + openrouter, /generativelanguage|gemini/i);
  assert.doesNotMatch(voice, /openrouter/i);
  assert.match(openrouter, /FREE_ROUTER_MODEL = "openrouter\/free"/);
});

/* ══ J–Q. Companion popups ═══════════════════════════════════════════ */

const T0 = new Date(2026, 9, 3, 12, 0, 0).getTime();
const always = () => 0;

function decide(
  event: CompanionEvent,
  over: {
    now?: number;
    persisted?: CompanionPersisted;
    session?: CompanionSession;
    blockers?: Partial<CompanionBlockers>;
    panelOpen?: boolean;
    visible?: boolean;
    lang?: "en" | "hinglish";
    rand?: () => number;
  } = {}
) {
  return decideCompanion({
    event,
    now: over.now ?? T0,
    persisted: over.persisted ?? emptyPersisted(),
    session: over.session ?? emptySession(),
    blockers: { typing: false, form: false, voice: false, hidden: false, ...over.blockers },
    panelOpen: over.panelOpen ?? false,
    visible: over.visible ?? false,
    lang: over.lang ?? "hinglish",
    rand: over.rand ?? always,
  });
}

test("J. dark mode gets a playful line; light mode says how long dark mode really lasted", () => {
  const dark = decide({ type: "THEME_CHANGED", variant: "dark" }, { panelOpen: true });
  assert.ok(dark.show);
  assert.match(dark.line.text, /dark mode/i);
  const light = decide(
    { type: "THEME_CHANGED", variant: "light", darkForMs: 12_000 },
    { panelOpen: true, rand: () => 0 }
  );
  assert.ok(light.show);
  assert.match(light.line.text, /The mysterious era lasted 12 seconds 😂|professional mode/);
  // The "{duration}" line only shows when the real time is known.
  const unknown = candidateLines({ type: "THEME_CHANGED", variant: "light" });
  assert.ok(unknown.every((l) => !/\{duration\}/.test(l.en)));
  assert.equal(formatDuration(12_000), "12 seconds");
  assert.equal(formatDuration(180_000), "3 minutes");
});

test("K. challenge completion: a celebration line, even right after another popup", () => {
  const first = decide({ type: "QUEST_OPENED" });
  assert.ok(first.show);
  const done = decide(
    { type: "CHALLENGE_COMPLETED" },
    { now: T0 + CELEBRATION_COOLDOWN_MS, persisted: first.persisted, session: first.session }
  );
  assert.ok(done.show);
  assert.match(done.line.text, /getting things done|Respect/);
});

test("L. quest completion: its own line", () => {
  const done = decide({ type: "QUEST_COMPLETED" });
  assert.ok(done.show);
  assert.match(done.line.text, /Quest (done|complete)/);
});

test("M. cooldown: ambient popups keep a gap; per-session and per-day caps hold", () => {
  const a = decide({ type: "ACTIVE_BROWSING" });
  assert.ok(a.show);
  const tooSoon = decide(
    { type: "QUEST_OPENED" },
    { now: T0 + 60_000, persisted: a.persisted, session: a.session }
  );
  assert.deepEqual(tooSoon, { show: false, reason: "cooldown" });
  const later = decide(
    { type: "QUEST_OPENED" },
    { now: T0 + COOLDOWN_MS + 1, persisted: a.persisted, session: a.session }
  );
  assert.ok(later.show);
  const full = decide(
    { type: "IDLE" },
    { now: T0 + 10 * COOLDOWN_MS, session: { shown: MAX_PER_SESSION, moments: [] } }
  );
  assert.deepEqual(full, { show: false, reason: "session limit" });
  // A new day resets the daily counters.
  const tomorrow = decide(
    { type: "IDLE" },
    { now: T0 + 24 * 60 * 60_000, persisted: { ...a.persisted, shownToday: 99 } }
  );
  assert.ok(tomorrow.show);
});

test("N. dismissal snoozes popups; three closes end them for the day", () => {
  let p = recordDismiss(emptyPersisted(), T0);
  assert.deepEqual(decide({ type: "IDLE" }, { now: T0 + 60_000, persisted: p }), {
    show: false,
    reason: "snoozed after a dismissal",
  });
  assert.ok(decide({ type: "IDLE" }, { now: T0 + DISMISS_SNOOZE_MS + 1, persisted: p }).show);
  for (let i = 1; i < MAX_DISMISSALS_PER_DAY; i++) p = recordDismiss(p, T0 + i);
  assert.deepEqual(
    decide({ type: "QUEST_COMPLETED" }, { now: T0 + 5 * 60 * 60_000, persisted: p }),
    { show: false, reason: "dismissed too often today" }
  );
});

test("O. no popup while typing (in STRIVY or anywhere) or in a form", () => {
  assert.deepEqual(decide({ type: "ACTIVE_BROWSING" }, { blockers: { typing: true } }), {
    show: false,
    reason: "typing",
  });
  assert.deepEqual(decide({ type: "CHALLENGE_COMPLETED" }, { blockers: { form: true } }), {
    show: false,
    reason: "in a form",
  });
  const input = (value: string, inStrivy: boolean) =>
    ({
      tagName: "INPUT",
      value,
      getAttribute: () => "text",
      closest: (sel: string) => (inStrivy && sel === ".strivy-panel" ? {} : null),
    }) as unknown as Element;
  const page = { hidden: false, pathname: "/feed", lastKeyAt: 0, now: T0 };
  assert.equal(readBlockers({ ...page, activeElement: input("meri str", true) }).typing, true);
  assert.equal(readBlockers({ ...page, activeElement: input("", true) }).typing, false);
  assert.equal(readBlockers({ ...page, activeElement: input("", false) }).form, true);
  assert.equal(
    readBlockers({ ...page, activeElement: null, lastKeyAt: T0 - TYPING_GRACE_MS + 500 }).typing,
    true
  );
  assert.equal(
    readBlockers({ ...page, activeElement: null, pathname: "/challenges/new" }).form,
    true
  );
  assert.equal(
    readBlockers({ ...page, activeElement: null, pathname: "/settings/about" }).form,
    true
  );
  const free = readBlockers({ ...page, activeElement: null });
  assert.deepEqual(free, { typing: false, form: false, voice: false, hidden: false });
});

test("P. no popup while recording voice or with the tab hidden", () => {
  assert.deepEqual(decide({ type: "QUEST_COMPLETED" }, { blockers: { voice: true } }), {
    show: false,
    reason: "voice in use",
  });
  assert.deepEqual(decide({ type: "RETURNED_TO_APP" }, { blockers: { hidden: true } }), {
    show: false,
    reason: "tab hidden",
  });
  const hook = readFileSync("src/components/features/strivy/useStrivyVoice.ts", "utf8");
  assert.match(hook, /busyRef\.current\?\.\(phase !== "off"\)/, "the mic reports busy while on");
  const panel = readFileSync("src/components/features/strivy/StrivyPanel.tsx", "utf8");
  assert.match(panel, /setCompanionBusy\("voice", busy\)/);
});

test("Q. no repeated popup spam: each moment once per session, no line repeats, one at a time", () => {
  const a = decide({ type: "ACTIVE_BROWSING" });
  assert.ok(a.show);
  const again = decide(
    { type: "ACTIVE_BROWSING" },
    { now: T0 + 2 * COOLDOWN_MS, persisted: a.persisted, session: a.session }
  );
  assert.deepEqual(again, { show: false, reason: "already shown this session" });
  assert.deepEqual(decide({ type: "QUEST_COMPLETED" }, { visible: true }), {
    show: false,
    reason: "one already showing",
  });
  // A new session can show the moment again, but with a different line.
  const next = decide(
    { type: "ACTIVE_BROWSING" },
    { now: T0 + 2 * COOLDOWN_MS, persisted: a.persisted }
  );
  assert.ok(next.show);
  assert.notEqual(next.line.id, a.line.id);
  // Ambient moments are only sometimes; random 0.99 skips them.
  assert.deepEqual(decide({ type: "SCREEN_OPENED", variant: "explore" }, { rand: () => 0.99 }), {
    show: false,
    reason: "not this time",
  });
  // While the chat is open only chat moments (theme, opening) may show.
  assert.deepEqual(decide({ type: "IDLE" }, { panelOpen: true }), {
    show: false,
    reason: "chat is open",
  });
  // APP_OPENED only arms the browsing timer; it never pops up by itself.
  assert.equal(decide({ type: "APP_OPENED" }).show, false);
});

test("R. serious or low messages never get a roast and silence the playful popups", async () => {
  for (const m of [
    "main bekaar hoon",
    "I feel hopeless",
    "aaj mood off hai",
    "I am useless",
    "feel like quitting everything",
    "mann nahi lag raha, sad hu",
  ]) {
    assert.ok(isSeriousMessage(m), m);
    assert.notEqual(classifyIntent(m).intent, "banter", m);
    const { reply } = await ask(m);
    assert.notEqual(reply.intent, "banter", m);
    assert.doesNotMatch(reply.text, /attitude|roast|😂/, m);
  }
  assert.equal(isSeriousMessage("bhai meri streak kitni hai"), false);
  const quiet = recordSerious(emptyPersisted(), T0);
  assert.deepEqual(
    decide({ type: "CHALLENGE_COMPLETED" }, { now: T0 + 60_000, persisted: quiet }),
    {
      show: false,
      reason: "quiet after a serious message",
    }
  );
  assert.ok(
    decide({ type: "CHALLENGE_COMPLETED" }, { now: T0 + SERIOUS_QUIET_MS + 1, persisted: quiet })
      .show
  );
});

test("popup library: every line is safe, short, clean and has both languages", () => {
  const ids = new Set<string>();
  for (const line of COMPANION_LINES) {
    assert.ok(!ids.has(line.id), `duplicate id ${line.id}`);
    ids.add(line.id);
    for (const text of [line.en, line.hinglish]) {
      assert.ok(isSafeCompanionLine(text), `${line.id}: ${text}`);
      assert.ok(text.length <= 90, `${line.id} is short`);
      assert.ok(text.split("\n").length <= 2, `${line.id}: two lines at most`);
      for (const banned of BANNED_WORDS) {
        assert.doesNotMatch(
          text.toLowerCase(),
          new RegExp(`\\b${banned}\\b`),
          `${line.id}: ${banned}`
        );
      }
      assert.doesNotMatch(
        text,
        /\d+ (day|din)|streak is|your streak/i,
        "no facts about the person"
      );
    }
  }
  // The safety filter itself catches what must never show.
  for (const bad of [
    "you need me",
    "don't leave me",
    "sexy",
    "you're lazy",
    "I'm disappointed in you",
    "😘💋",
  ]) {
    assert.equal(isSafeCompanionLine(bad), false, bad);
  }
  // Every event that can pop up has at least one line.
  for (const event of [
    "ACTIVE_BROWSING",
    "STRIVY_OPENED",
    "THEME_CHANGED",
    "CHALLENGE_OPENED",
    "QUEST_OPENED",
    "SCREEN_OPENED",
    "CHALLENGE_COMPLETED",
    "QUEST_COMPLETED",
    "TASK_COMPLETED",
    "IDLE",
    "RETURNED_TO_APP",
  ]) {
    assert.ok(
      COMPANION_LINES.some((l) => l.event === event),
      event
    );
  }
  // Not everything is flirty.
  const flirty = COMPANION_LINES.filter((l) => l.tone === "flirty").length;
  assert.ok(flirty / COMPANION_LINES.length < 0.4);
});

test("popup language follows the person: English lines for English chatters", () => {
  const en = decide({ type: "QUEST_COMPLETED" }, { lang: "en", rand: () => 0.5 });
  assert.ok(en.show);
  assert.doesNotMatch(en.line.text, /bhai|hoon/);
});

test("popups are one engine, not scattered timers: screens only emit events", () => {
  for (const file of [
    "src/app/(app)/challenges/[id]/ChallengeDetailClient.tsx",
    "src/app/(app)/quests/[id]/tasks/page.tsx",
    "src/app/(app)/quests/[id]/QuestDetailClient.tsx",
  ]) {
    const src = readFileSync(file, "utf8");
    assert.match(src, /emitStrivyEvent\(\{ type: "(CHALLENGE|QUEST|TASK)_COMPLETED" \}\)/, file);
    assert.doesNotMatch(src, /StrivyCompanionPopup|decideCompanion/, file);
  }
  const launcher = readFileSync("src/components/features/strivy/StrivyLauncher.tsx", "utf8");
  assert.match(launcher, /useStrivyCompanion/);
  assert.match(launcher, /StrivyCompanionPopup/);
});
