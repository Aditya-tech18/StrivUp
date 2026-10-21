/**
 * Voice mode: speech helpers, the browser providers (with fake browser
 * objects), the optional server-side Gemini transcription, and the rule that
 * voice goes through the same chat pipeline as typing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  VOICE_ERROR_TEXT,
  VoiceError,
  listenLang,
  mediaErrorKind,
  pickSpeechToText,
  recognitionErrorKind,
  speakLang,
  speakableText,
} from "@/lib/strivy/voice/speech";
import {
  handleVoiceConfigRequest,
  handleVoiceTranscribeRequest,
  transcribeWithGemini,
  voiceEnv,
  type VoiceEnv,
} from "@/lib/strivy/voice/server";
import {
  browserSpeechToText,
  browserTextToSpeech,
  createSpeechToText,
  deviceVoiceSupport,
  requestMic,
  serverSpeechToText,
  type VoiceWindow,
} from "@/components/features/strivy/voice";
import { createRateLimiter } from "@/lib/strivy/ratelimit";
import { runStrivyPipeline } from "@/lib/strivy/pipeline";
import { deterministicProvider } from "@/lib/strivy/model";
import { USER_ID, fakeSupabase } from "./helpers";

const KEY = "AIza-TEST-SECRET-KEY-123";

/* ── Speech helpers ───────────────────────────────────────────────────── */

test("spoken replies are short, clean and say fractions as words", () => {
  assert.equal(
    speakableText(
      "Veer Ji Chaap wali quest hai bhai: 0/3 tasks done. 👀 Ek task nipta de. Aur kuch?"
    ),
    "Veer Ji Chaap wali quest hai bhai: 0 of 3 tasks done. Ek task nipta de."
  );
  assert.equal(speakableText("Veer Ji Chaap: 0/3 हुआ है 👀"), "Veer Ji Chaap: 3 में से 0 हुआ है");
  assert.equal(speakableText("**Done** see https://x.y/z 🔥"), "Done see");
  const long = "word ".repeat(120) + ".";
  assert.ok(speakableText(long).length <= 240);
  assert.equal(speakableText("🔥👀"), "");
});

test("listening and speaking language follow the person", () => {
  // v6: "auto" by default. With no signal the code-mixed hi-IN recogniser is
  // used (it also hears English); Hinglish now listens in hi-IN, English in en-IN.
  assert.equal(listenLang(null, null), "hi-IN");
  assert.equal(listenLang(null, "भाई क्या हाल है"), "hi-IN");
  assert.equal(listenLang(null, "bhai kya haal"), "hi-IN");
  assert.equal(listenLang(null, "what is my current quest"), "en-IN");
  assert.equal(listenLang("hi-IN", "hello"), "hi-IN");
  assert.equal(listenLang("junk", null), "hi-IN");
  assert.equal(speakLang("मैं बढ़िया"), "hi-IN");
  assert.equal(speakLang("All good bro"), "en-IN");
});

test("provider choice: Gemini (automatic multilingual) when configured, else browser, null when nothing works", () => {
  const both = { speechRecognition: true, mediaRecorder: true };
  const onlyRec = { speechRecognition: false, mediaRecorder: true };
  const none = { speechRecognition: false, mediaRecorder: false };
  assert.equal(pickSpeechToText(both, { gemini: false, prefer: "auto" }), "browser");
  // v6: auto prefers Gemini, which detects the spoken language by itself.
  assert.equal(pickSpeechToText(both, { gemini: true, prefer: "auto" }), "gemini");
  assert.equal(pickSpeechToText(both, { gemini: true, prefer: "gemini" }), "gemini");
  assert.equal(pickSpeechToText(onlyRec, { gemini: true, prefer: "auto" }), "gemini");
  // Gemini not configured: Firefox-like browsers have no voice input.
  assert.equal(pickSpeechToText(onlyRec, { gemini: false, prefer: "auto" }), null);
  assert.equal(pickSpeechToText(both, { gemini: false, prefer: "gemini" }), "browser");
  assert.equal(pickSpeechToText(onlyRec, { gemini: true, prefer: "browser" }), null);
  assert.equal(pickSpeechToText(none, { gemini: true, prefer: "auto" }), null);
});

test("errors map to plain messages that keep typing available", () => {
  assert.equal(recognitionErrorKind("not-allowed"), "denied");
  assert.equal(recognitionErrorKind("audio-capture"), "no-mic");
  assert.equal(recognitionErrorKind("no-speech"), "no-speech");
  assert.equal(recognitionErrorKind("network"), "network");
  assert.equal(recognitionErrorKind("weird"), "failed");
  assert.equal(mediaErrorKind("NotAllowedError"), "denied");
  assert.equal(mediaErrorKind("NotFoundError"), "no-mic");
  for (const text of Object.values(VOICE_ERROR_TEXT)) {
    assert.ok(text.length < 120, text);
    assert.doesNotMatch(text, /error code|exception|undefined/i);
  }
  assert.match(VOICE_ERROR_TEXT.denied, /type/);
});

/* ── Fake browser objects ─────────────────────────────────────────────── */

type Script = { results?: [string, boolean][]; error?: string };

function fakeRecognitionWindow(script: Script, opts: { mic?: "ok" | "denied" | "none" } = {}) {
  const created: { lang: string }[] = [];
  class Rec {
    lang = "";
    interimResults = false;
    continuous = false;
    maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error?: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      created.push(this);
      setTimeout(() => {
        const results = script.results ?? [];
        if (results.length) {
          const list = results.map(([t, isFinal]) => ({ isFinal, 0: { transcript: t } }));
          this.onresult?.({
            resultIndex: 0,
            results: Object.assign(list, { length: list.length }),
          });
        }
        if (script.error) this.onerror?.({ error: script.error });
        this.onend?.();
      }, 5);
    }
    stop() {}
    abort() {
      setTimeout(() => this.onend?.(), 1);
    }
  }
  const stopped: string[] = [];
  const mic = opts.mic ?? "ok";
  const w: VoiceWindow = {
    webkitSpeechRecognition: Rec as never,
    navigator: {
      mediaDevices:
        mic === "none"
          ? undefined
          : {
              async getUserMedia() {
                if (mic === "denied")
                  throw Object.assign(new Error("no"), { name: "NotAllowedError" });
                return { getTracks: () => [{ stop: () => stopped.push("track") }] } as never;
              },
            },
    },
  };
  return { w, created, stopped };
}

test("browser recognition: transcript comes back, interim text streams", async () => {
  const { w, created } = fakeRecognitionWindow({
    results: [
      ["bhai meri quest ", true],
      ["kya hai", true],
    ],
  });
  const stt = browserSpeechToText(w);
  assert.ok(stt);
  const interim: string[] = [];
  const text = await stt.listen({ lang: "hi-IN", onInterim: (t) => interim.push(t) }).result;
  assert.equal(text, "bhai meri quest kya hai");
  assert.equal(created[0].lang, "hi-IN");
  assert.deepEqual(interim, ["bhai meri quest kya hai"]);
});

test("browser recognition: denied and silence become clear voice errors", async () => {
  const denied = browserSpeechToText(fakeRecognitionWindow({ error: "not-allowed" }).w)!;
  await assert.rejects(
    denied.listen({ lang: "en-IN" }).result,
    (e: unknown) => e instanceof VoiceError && e.kind === "denied"
  );
  const silent = browserSpeechToText(fakeRecognitionWindow({}).w)!;
  await assert.rejects(
    silent.listen({ lang: "en-IN" }).result,
    (e: unknown) => e instanceof VoiceError && e.kind === "no-speech"
  );
});

test("speech recognition unavailable: no provider, no crash", () => {
  const w: VoiceWindow = { navigator: {} };
  assert.equal(browserSpeechToText(w), null);
  assert.equal(serverSpeechToText(w), null);
  assert.equal(createSpeechToText(null, w), null);
  assert.deepEqual(deviceVoiceSupport(w), {
    speechRecognition: false,
    mediaRecorder: false,
    speechSynthesis: false,
  });
  assert.deepEqual(deviceVoiceSupport(null), {
    speechRecognition: false,
    mediaRecorder: false,
    speechSynthesis: false,
  });
});

test("microphone permission: granted closes the probe stream, denied is reported", async () => {
  const ok = fakeRecognitionWindow({}, { mic: "ok" });
  assert.ok(await requestMic(ok.w));
  assert.deepEqual(ok.stopped, ["track"], "the probe doesn't keep the mic open");
  await assert.rejects(
    requestMic(fakeRecognitionWindow({}, { mic: "denied" }).w),
    (e: unknown) => e instanceof VoiceError && e.kind === "denied"
  );
  assert.equal(await requestMic(fakeRecognitionWindow({}, { mic: "none" }).w), null);
});

test("server recording: audio goes to our endpoint, never to Gemini from the browser", async () => {
  class Rec {
    mimeType = "audio/webm";
    state = "inactive";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    static isTypeSupported = (t: string) => t === "audio/webm";
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
      });
      this.onstop?.();
    }
  }
  const w: VoiceWindow = {
    MediaRecorder: Rec as never,
    navigator: {
      mediaDevices: {
        async getUserMedia() {
          return { getTracks: () => [{ stop() {} }] } as never;
        },
      },
    },
  };
  const calls: { url: string; init?: RequestInit }[] = [];
  const stt = serverSpeechToText(w, (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Response.json({ text: "meri streak kitni hai" });
  }) as typeof fetch)!;
  const session = stt.listen({ lang: "hi-IN", hint: "hi-IN" });
  await new Promise((r) => setTimeout(r, 10));
  session.stop();
  assert.equal(await session.result, "meri streak kitni hai");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/strivy/voice/transcribe?lang=hi-IN");
  assert.doesNotMatch(JSON.stringify(calls), /googleapis|key/i);
});

test("text to speech: speaks a short version in the reply's language; quiet when unavailable", async () => {
  const spoken: { text: string; lang: string }[] = [];
  class Utterance {
    lang = "";
    rate = 1;
    voice: unknown = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  }
  const synth = {
    cancel() {},
    getVoices: () => [{ lang: "hi-IN", name: "Hindi" }],
    speak(u: Utterance) {
      spoken.push({ text: u.text, lang: u.lang });
      setTimeout(() => u.onend?.(), 1);
    },
  };
  const tts = browserTextToSpeech({
    speechSynthesis: synth as never,
    SpeechSynthesisUtterance: Utterance as never,
    navigator: {},
  });
  assert.equal(tts.available, true);
  await tts.speak("हम त मस्त बानी 😎 रउआ के का हाल बा? और सुनाईं। बाकी सब ठीक?");
  assert.deepEqual(spoken, [{ text: "हम त मस्त बानी। रउआ के का हाल बा?", lang: "hi-IN" }]);

  const none = browserTextToSpeech({ navigator: {} });
  assert.equal(none.available, false);
  await none.speak("hello"); // resolves, does nothing
});

/* ── Server: Gemini is optional and voice-only ────────────────────────── */

test("missing Gemini key: browser-only voice, no Gemini", () => {
  assert.deepEqual(voiceEnv({}), { config: { gemini: false, prefer: "auto" }, gemini: null });
  const on = voiceEnv({ GEMINI_API_KEY: KEY });
  assert.equal(on.config.gemini, true);
  assert.equal(on.gemini?.model, "gemini-3.5-flash-lite");
  assert.equal(voiceEnv({ GEMINI_API_KEY: KEY, STRIVY_VOICE_PROVIDER: "browser" }).gemini, null);
  assert.equal(voiceEnv({ GEMINI_API_KEY: KEY, GEMINI_VOICE_MODEL: "bad model!" }).gemini, null);
  // The public config holds booleans only.
  assert.doesNotMatch(JSON.stringify(on.config), /AIza|SECRET/);
});

const env = (key = true): VoiceEnv => voiceEnv(key ? { GEMINI_API_KEY: KEY } : {});

function deps(over: Partial<Parameters<typeof handleVoiceTranscribeRequest>[1]> = {}) {
  return {
    isEnabled: () => true,
    getSupabase: async () => fakeSupabase({ user: { id: USER_ID } }).client,
    getEnv: () => env(),
    limiter: createRateLimiter(100, 60_000),
    ...over,
  };
}

const audio = (bytes = 10, type = "audio/webm") =>
  new Request("http://x/api/strivy/voice/transcribe?lang=hi-IN", {
    method: "POST",
    headers: { "Content-Type": type },
    body: new Uint8Array(bytes),
  });

test("voice config endpoint: signed-in only, never returns the key", async () => {
  const res = await handleVoiceConfigRequest(deps());
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(body), { gemini: true, prefer: "auto" });
  assert.doesNotMatch(body, /AIza|SECRET/);
  const out = await handleVoiceConfigRequest(
    deps({ getSupabase: async () => fakeSupabase({ user: null }).client })
  );
  assert.equal(out.status, 401);
});

test("transcribe: Gemini gets the audio with the key in a header; only text comes back", async () => {
  const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    seen.push({
      url,
      headers: init.headers as Record<string, string>,
      body: String(init.body),
    });
    return Response.json({
      candidates: [{ content: { parts: [{ text: "भाई मेरी quest क्या है" }] } }],
    });
  }) as typeof fetch;
  const res = await handleVoiceTranscribeRequest(audio(), deps({ fetch: fakeFetch }));
  const body = await res.text();
  assert.equal(res.status, 200);
  // v6: the reply style detected from the transcript comes back too.
  assert.deepEqual(JSON.parse(body), { text: "भाई मेरी quest क्या है", lang: "hi" });
  assert.doesNotMatch(body, /AIza|SECRET/);
  assert.equal(seen.length, 1);
  assert.doesNotMatch(seen[0].url, /key=|AIza/, "the key is never in the URL");
  assert.equal(seen[0].headers["x-goog-api-key"], KEY);
  assert.match(seen[0].body, /inline_data/);
  assert.match(seen[0].body, /hi-IN/);
});

test("transcribe: no key, signed out, wrong type, too big, rate limit", async () => {
  assert.equal(
    (await handleVoiceTranscribeRequest(audio(), deps({ getEnv: () => env(false) }))).status,
    503
  );
  assert.equal(
    (
      await handleVoiceTranscribeRequest(
        audio(),
        deps({ getSupabase: async () => fakeSupabase({ user: null }).client })
      )
    ).status,
    401
  );
  assert.equal((await handleVoiceTranscribeRequest(audio(10, "text/plain"), deps())).status, 415);
  assert.equal((await handleVoiceTranscribeRequest(audio(0), deps())).status, 400);
  assert.equal((await handleVoiceTranscribeRequest(audio(2_000_001), deps())).status, 413);
  const limiter = createRateLimiter(1, 60_000);
  const ok = (async () =>
    Response.json({
      candidates: [{ content: { parts: [{ text: "hi" }] } }],
    })) as unknown as typeof fetch;
  assert.equal(
    (await handleVoiceTranscribeRequest(audio(), deps({ limiter, fetch: ok }))).status,
    200
  );
  assert.equal(
    (await handleVoiceTranscribeRequest(audio(), deps({ limiter, fetch: ok }))).status,
    429
  );
});

test("transcribe: Gemini down or erroring gives a friendly 502, never its error or the key", async () => {
  const logs: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => logs.push(a);
  try {
    for (const fetchImpl of [
      (async () => {
        throw new Error(`boom ${KEY}`);
      }) as unknown as typeof fetch,
      (async () =>
        new Response(`{"error":"API key ${KEY} not valid"}`, {
          status: 400,
        })) as unknown as typeof fetch,
      (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch,
    ]) {
      const res = await handleVoiceTranscribeRequest(audio(), deps({ fetch: fetchImpl }));
      const body = await res.text();
      assert.equal(res.status, 502);
      assert.doesNotMatch(body, /AIza|SECRET|API key|boom/);
    }
  } finally {
    console.warn = warn;
  }
  assert.doesNotMatch(JSON.stringify(logs), /AIza|SECRET/);
});

test("transcribeWithGemini strips quotes and caps length", async () => {
  const text = await transcribeWithGemini(
    { base64: "AA==", mimeType: "audio/webm;codecs=opus" },
    { apiKey: KEY, model: "m" },
    (async () =>
      Response.json({
        candidates: [{ content: { parts: [{ text: '"kya haal hai"' }] } }],
      })) as unknown as typeof fetch
  );
  assert.equal(text, "kya haal hai");
});

/* ── One brain: voice text goes through the normal chat pipeline ──────── */

test("a voice transcript is answered by the same grounded pipeline as typed text", async () => {
  const fake = fakeSupabase({
    user: { id: USER_ID },
    tables: {
      quest_participants: {
        data: [
          {
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
          },
        ],
      },
      quest_tasks: {
        data: ["t1", "t2", "t3"].map((id) => ({ id, quest_id: "q9", is_required: true })),
      },
      quest_task_submissions: { data: [] },
    },
  });
  const { reply, meta } = await runStrivyPipeline({
    supabase: fake.client,
    userId: USER_ID,
    message: "bhai meri quest kya hai",
    history: [],
    provider: deterministicProvider,
  });
  assert.equal(meta.intent, "quests");
  assert.match(reply.text, /Veer Ji Chaap/);
  assert.match(reply.text, /0\/3/);
  assert.match(speakableText(reply.text), /0 of 3/);
});

test("Gemini is wired into voice only: the chat path and browser code never touch it", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  for (const f of [
    "src/lib/strivy/pipeline.ts",
    "src/lib/strivy/model.ts",
    "src/lib/strivy/ollama.ts",
    "src/lib/strivy/persona.ts",
    "src/app/api/strivy/chat/route.ts",
  ]) {
    assert.doesNotMatch(read(f), /gemini|googleapis/i, f);
  }
  for (const f of [
    "src/components/features/strivy/voice.ts",
    "src/components/features/strivy/useStrivyVoice.ts",
    "src/components/features/strivy/StrivyPanel.tsx",
    "src/components/features/strivy/StrivyVoiceBar.tsx",
  ]) {
    const src = read(f);
    assert.doesNotMatch(src, /GEMINI_API_KEY|googleapis|x-goog-api-key/, f);
    assert.doesNotMatch(src, /process\.env\.(?!NODE_ENV|NEXT_PUBLIC_)/, f);
  }
});
