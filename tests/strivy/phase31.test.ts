/**
 * Phase 3.1: quest vs challenge routing, languages, short replies with
 * personality, grounding of the new templates, and the panel theme.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "@/lib/strivy/intents";
import { detectLanguage, detectMessageLanguage } from "@/lib/strivy/language";
import { PHRASES, count, hasTemplate, say, type PhraseKey } from "@/lib/strivy/phrases";
import { draftReply } from "@/lib/strivy/replies";
import { checkGrounding } from "@/lib/strivy/grounding";
import { needsFor, toModelContext } from "@/lib/strivy/context";
import { BANNED_WORDS, FAKE_AI_CLAIMS } from "@/lib/strivy/persona";
import { runStrivyPipeline } from "@/lib/strivy/pipeline";
import { deterministicProvider } from "@/lib/strivy/model";
import { STARTER_PROMPTS } from "@/lib/strivy/config";
import { loadTheme, saveTheme } from "@/components/features/strivy/chat";
import type { StrivyLang } from "@/lib/strivy/language";
import type { ChatTurn, QuestFact, StrivyContext, StrivyFacts } from "@/lib/strivy/types";
import { SAMPLE, USER_ID, ctx, fakeSupabase } from "./helpers";

/* ── Fixtures: the reported account (one quest, no challenge) ─────────── */

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

const VEER: QuestFact = {
  questId: "q9",
  title: "Veer Ji Chaap",
  businessName: "Veer Ji",
  locationName: null,
  verificationStatus: "pending",
  completed: false,
  endsAt: inDays(6),
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
  availableRewards: [
    { kind: "quest", parentId: "q9", parentTitle: "Veer Ji Chaap", description: "Cash Prize" },
  ],
  week: { activeDays: 0, approvedProofs: 0 },
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

/** Challenge vocabulary that must never appear in a quest answer. */
const CHALLENGE_FACTS = /7 days|\/7|days active|challenge|streak|Day \d/i;

/* ── 1. The reported bug ──────────────────────────────────────────────── */

test("quest progress is answered from the quest, never from challenges", () => {
  const { intent, reply } = draft("How much progress have I made on my quest?", QUEST_ONLY);
  assert.equal(intent.intent, "quests");
  assert.equal(intent.topic, "quest");
  assert.equal(intent.detail, "progress");
  assert.match(reply.text, /Veer Ji Chaap/);
  assert.match(reply.text, /0\/3/);
  assert.doesNotMatch(reply.text, CHALLENGE_FACTS);
  assert.doesNotMatch(reply.text, /No approved proof/);
});

test("quest progress with a challenge running still only talks about the quest", () => {
  const { reply } = draft("how is my quest progress?", SAMPLE);
  assert.match(reply.text, /Café Trail/);
  assert.match(reply.text, /1\/3/);
  assert.doesNotMatch(reply.text, /30 Days of Running|Read Daily|consistent/);
});

/* ── 2. Intent priority: the most specific entity wins ─────────────────── */

const ROUTES: [string, string, string | undefined, string | undefined][] = [
  // message, intent, topic, detail
  ["How is my quest progress?", "quests", "quest", "progress"],
  ["How is my challenge progress?", "challenges", "challenge", "progress"],
  ["How's my streak?", "streak", undefined, undefined],
  ["How many tasks are left in my quest?", "quests", "quest", "progress"],
  ["quest ke kitne task bache hain?", "quests", "quest", "progress"],
  ["mera quest kitna hua?", "quests", "quest", "progress"],
  ["How many days are left?", "challenges", undefined, "deadline"],
  ["how much time do I have?", "challenges", undefined, "deadline"],
  ["when does my quest end?", "quests", "quest", "deadline"],
  ["challenge ke kitne din bache?", "challenges", "challenge", "deadline"],
  ["Show my progress", "progress", undefined, "progress"],
  ["how does quest progress work?", "how_it_works", undefined, undefined],
];

for (const [message, intent, topic, detail] of ROUTES) {
  test(`routing: "${message}" → ${intent}${topic ? `/${topic}` : ""}${detail ? `/${detail}` : ""}`, () => {
    const r = classifyIntent(message);
    assert.equal(r.intent, intent);
    assert.equal(r.topic, topic);
    assert.equal(r.detail, detail);
  });
}

test("natural variants map to existing intents, not new ones", () => {
  const focus = [
    "What accountability events are currently relevant to me?",
    "anything I need to do?",
    "what needs my attention?",
    "what am I supposed to do?",
    "what's pending?",
    "anything pending?",
    "what should I focus on?",
    "what do I need to complete?",
    "aaj kya pending hai?",
    "ab kya karna hai?",
    "mera next kaam kya hai?",
    "ka kaam ba?",
    "aaj kya krna h",
    "आज का करे के बा?",
  ];
  for (const m of focus) assert.equal(classifyIntent(m).intent, "focus", m);

  assert.equal(classifyIntent("did i earn anything?").intent, "rewards");
  assert.equal(classifyIntent("bhai reward mila?").intent, "rewards");
  assert.equal(classifyIntent("meri streak kaisi h").intent, "streak");
  assert.equal(classifyIntent("mera quest kya h").intent, "quests");
  assert.equal(classifyIntent("मेरा क्वेस्ट क्या है?").intent, "quests");
  assert.equal(classifyIntent("हमार क्वेस्ट का बा?").intent, "quests");
  assert.equal(classifyIntent("is my proof pending?").intent, "proof_status");
  assert.equal(classifyIntent("namaste").intent, "greeting");
});

/* ── 11. Context: follow-ups keep the topic ──────────────────────────── */

const afterQuest: ChatTurn[] = [
  { role: "user", text: "mera quest kya h?" },
  { role: "strivy", text: "Tera active quest 'Veer Ji Chaap' hai", intent: "quests" },
];
const afterStreak: ChatTurn[] = [
  { role: "user", text: "meri streak?" },
  { role: "strivy", text: "11 din ki streak", intent: "streak" },
];

test("quest → 'kitna hua?' is quest progress, not the week", () => {
  const { intent, reply } = draft("kitna hua?", QUEST_ONLY, afterQuest);
  assert.equal(intent.intent, "quests");
  assert.equal(intent.detail, "progress");
  assert.match(reply.text, /0\/3/);
  assert.doesNotMatch(reply.text, CHALLENGE_FACTS);

  const progress = draft("kitna progress hua?", QUEST_ONLY, afterQuest);
  assert.equal(progress.intent.intent, "quests");
  assert.match(progress.reply.text, /Veer Ji Chaap/);
});

test("quest → 'how many days are left?' is the quest's deadline", () => {
  const { intent, reply } = draft("how many days are left?", QUEST_ONLY, afterQuest);
  assert.equal(intent.topic, "quest");
  assert.equal(reply.intent, "quests");
  assert.match(reply.text, /Veer Ji Chaap/);
  assert.match(reply.text, /6 (days|din)/);
});

test("streak → 'kab se?' stays on the streak", () => {
  const r = classifyIntent("kab se?", afterStreak);
  assert.equal(r.intent, "streak");
  // Phase 5: "kab se?" is now answered as "since when" about the streak.
  assert.deepEqual(r.matched, ["streak-since"]);
  assert.equal(r.detail, "since");
  assert.equal(classifyIntent("since when?", afterStreak).intent, "streak");
});

test("streak → 'how many days are left?' is the challenge deadline", () => {
  const { intent, reply } = draft("how many days are left?", SAMPLE, afterStreak);
  assert.equal(intent.topic, "challenge");
  assert.match(reply.text, /30 Days of Running/);
  assert.match(reply.text, /18 days/);
  assert.doesNotMatch(reply.text, /Café Trail/);
});

test("ambiguous follow-ups with no context ask instead of guessing", () => {
  assert.deepEqual(classifyIntent("kyun?").matched, ["follow-up-no-context"]);
  const { reply } = draft("kyun?", {});
  assert.match(reply.text, /Kiske baare/);
});

test("a deadline question with no topic reads both challenges and quests", () => {
  assert.deepEqual([...needsFor(classifyIntent("how much time do I have?"))].sort(), [
    "challenges",
    "quests",
  ]);
  assert.deepEqual(needsFor(classifyIntent("when does my quest end?")), ["quests"]);
});

test("a deadline question with only a quest answers with the quest", () => {
  const { reply } = draft("how much time do I have?", QUEST_ONLY);
  assert.equal(reply.intent, "quests");
  assert.match(reply.text, /Veer Ji Chaap/);
  assert.match(reply.text, /about 6 days left/);
});

test("nothing with a deadline says so", () => {
  const { reply } = draft("how much time do I have?", { challenges: [], quests: [] });
  assert.match(reply.text, /No active challenge or open quest/);
});

/* ── 9. Language detection ──────────────────────────────────────────── */

const LANGS: [string, StrivyLang][] = [
  ["how's my streak?", "en"],
  ["did i earn anything?", "en"],
  ["What's pending?", "en"],
  ["meri streak kaisi h?", "hinglish"],
  ["mera quest kya h", "hinglish"],
  ["aaj kya krna h", "hinglish"],
  ["bhai what is my quest?", "hinglish"],
  ["bhai reward mila?", "hinglish"],
  ["ka kaam ba?", "hinglish"],
  ["मेरा क्वेस्ट क्या है?", "hi"],
  ["आज क्या करना है?", "hi"],
  ["हमार क्वेस्ट का बा?", "bho"],
  ["आज का करे के बा?", "bho"],
  ["bhai मेरा quest?", "hi"],
];

for (const [message, lang] of LANGS) {
  test(`language: "${message}" → ${lang}`, () => {
    assert.equal(detectLanguage(message), lang);
  });
}

test("a message with no signal keeps the person's language", () => {
  assert.equal(detectMessageLanguage("streak?"), null);
  assert.equal(detectLanguage("streak?"), "en");
  assert.equal(detectLanguage("streak?", afterQuest), "hinglish");
  assert.equal(detectLanguage("🔥", [{ role: "user", text: "हमार क्वेस्ट का बा?" }]), "bho");
});

/* ── 6–8, 14–15. Replies in each language ───────────────────────────── */

test("Hinglish replies are in Hinglish with real facts", () => {
  assert.match(
    draft("mera quest kya h", QUEST_ONLY).reply.text,
    /Tera active quest 'Veer Ji Chaap' hai/
  );
  assert.match(
    draft("meri streak kaisi h", QUEST_ONLY).reply.text,
    /Abhi (active challenge nahi|streak zero)/
  );
  assert.match(draft("bhai reward mila?", QUEST_ONLY).reply.text, /Cash Prize/);
  assert.match(draft("aaj kya krna h", QUEST_ONLY).reply.text, /Veer Ji Chaap/);
});

test("Devanagari Hindi replies are in Hindi", () => {
  const { reply } = draft("मेरा क्वेस्ट क्या है?", QUEST_ONLY);
  assert.equal(
    reply.text,
    "तुम्हारा active quest 'Veer Ji Chaap' है 👀 अभी 3 में से 0 tasks approved हैं।"
  );
});

test("Bhojpuri replies are in Bhojpuri", () => {
  const quest = draft("हमार क्वेस्ट का बा?", QUEST_ONLY).reply.text;
  assert.equal(
    quest,
    "तोहार active quest 'Veer Ji Chaap' बा 😏 अभी 3 में से 0 task approve भइल बा।"
  );
  const today = draft("आज का करे के बा?", QUEST_ONLY).reply.text;
  assert.match(today, /निपटा द भइया/);
  assert.match(today, /Veer Ji Chaap/);
});

test("reward reply mentions the prize only when the database lists it", () => {
  const withPrize = draft("did i earn anything?", QUEST_ONLY).reply.text;
  assert.match(withPrize, /No reward earned yet/);
  assert.match(withPrize, /Cash Prize/);
  const without = draft("did i earn anything?", { ...QUEST_ONLY, availableRewards: [] }).reply.text;
  assert.doesNotMatch(without, /Cash Prize|prize/i);
});

test("no-proof reply only when proofs loaded and empty", () => {
  assert.match(
    draft("did my proof get verified?", QUEST_ONLY).reply.text,
    /No proof submitted yet/
  );
  assert.match(
    draft("proof ka kya hua?", QUEST_ONLY).reply.text,
    /Abhi proof submit nahi hua 👀 Ek upload kar de, phir main track kar lunga\./
  );
  const failed = draft("did my proof get verified?", { unavailable: ["your proofs"] }).reply.text;
  assert.match(failed, /couldn't load/);
  assert.doesNotMatch(failed, /No proof submitted/);
});

test("unavailable data is never reported as nothing, in any language", () => {
  for (const [m, word] of [
    ["mera quest kya h", /load nahi/],
    ["मेरा क्वेस्ट क्या है?", /load नहीं/],
    ["हमार क्वेस्ट का बा?", /load ना/],
  ] as const) {
    const text = draft(m, { unavailable: ["your quests"] }).reply.text;
    assert.match(text, word, m);
    assert.doesNotMatch(text, /\d/, m);
  }
});

/* ── 3–5, 22. Short, playful, safe ──────────────────────────────────── */

const DATA_PROMPTS = [
  "hey",
  "how's my streak?",
  "what's my quest?",
  "what's pending?",
  "did i earn anything?",
  "how's my progress?",
  "how much time do I have?",
  "mera quest kitna hua?",
  "aaj kya pending h?",
  "हमार क्वेस्ट का बा?",
];

function sentences(text: string): number {
  return text.split(/(?<=[.!?।])\s+|\n+/).filter((s) => /[\p{L}\d]/u.test(s)).length;
}

test("replies are 1 to 3 short sentences by default", () => {
  for (const facts of [QUEST_ONLY, SAMPLE]) {
    for (const m of DATA_PROMPTS) {
      const { reply } = draft(m, facts);
      assert.ok(sentences(reply.text) <= 3, `${m}: ${reply.text}`);
      assert.ok(reply.text.length <= 240, `${m} too long: ${reply.text}`);
    }
  }
});

test("details are given when asked for", () => {
  const short = draft("what's pending today?", SAMPLE).reply.text;
  const long = draft("what's due today? show all details", SAMPLE).reply.text;
  assert.ok(long.length > short.length);
  assert.match(long, /•/);
});

test("playful, but not cheeky every time", () => {
  const texts = DATA_PROMPTS.map((m) => draft(m, QUEST_ONLY).reply.text);
  const cheeky = texts.filter((x) => /😏/.test(x)).length;
  assert.ok(cheeky >= 1, "no personality at all");
  assert.ok(cheeky < texts.length, "teasing every time");
});

test("no teasing after a rejection or in a low moment", () => {
  const today = {
    ...SAMPLE.today,
    tasks: [{ ...SAMPLE.today.tasks[0], state: "rejected" as const }],
  };
  for (const m of ["what should I focus on?", "aaj kya krna h", "what's due today?"]) {
    const text = draft(m, { ...SAMPLE, today }).reply.text;
    assert.doesNotMatch(text, /😏/, m);
  }
  const low = draft("i dont feel like it", SAMPLE).reply.text;
  assert.doesNotMatch(low, /😏/);
});

/** Renders every template in every language with every var filled. */
function renderAll(): { key: string; lang: string; text: string }[] {
  const vars = new Proxy({}, { get: (_t, k) => `‹${String(k)}›`, has: () => true });
  const out: { key: string; lang: string; text: string }[] = [];
  for (const [key, set] of Object.entries(PHRASES)) {
    for (const [lang, templates] of Object.entries(set as Record<string, string[]>)) {
      for (let i = 0; i < templates.length; i++) {
        out.push({ key, lang, text: say(lang as StrivyLang, key as PhraseKey, vars, String(i)) });
      }
      for (const tpl of templates) out.push({ key, lang, text: tpl });
    }
  }
  return out;
}

test("every template is safe: no shaming, abuse, sexual jokes or fake AI claims", () => {
  const UNSAFE = /\b(sexy|sex|horny|naked|nude|kiss|bed|chut|lund|bc|mc|saala|kutta|kutti)\b/i;
  for (const { key, lang, text } of renderAll()) {
    const lower = text.toLowerCase();
    for (const w of BANNED_WORDS) {
      assert.ok(!new RegExp(`\\b${w}\\b`).test(lower), `${key}/${lang} uses "${w}"`);
    }
    assert.doesNotMatch(text, UNSAFE, `${key}/${lang}`);
    assert.doesNotMatch(text, FAKE_AI_CLAIMS, `${key}/${lang}`);
    assert.doesNotMatch(text, /—/, `${key}/${lang} has an em dash`);
  }
});

test("every phrase has English, and every language covers the main replies", () => {
  for (const [key, set] of Object.entries(PHRASES)) {
    assert.ok((set as { en?: string[] }).en?.length, `${key} has no English`);
  }
  for (const lang of ["hinglish", "hi", "bho"] as const) {
    for (const key of Object.keys(PHRASES) as PhraseKey[]) {
      assert.ok(hasTemplate(lang, key), `${key} missing for ${lang}`);
    }
  }
});

test("a missing template falls back to English, and vars are always filled", () => {
  assert.equal(say("hi", "streakBest", { best: "3 दिन" }), " तुम्हारा best 3 दिन है।");
  // Simulate a language with no template for a key.
  const set = PHRASES.thanks as { en: string[]; hi?: string[] };
  const saved = set.hi;
  delete set.hi;
  try {
    assert.ok(set.en.includes(say("hi", "thanks", {}, "x")));
  } finally {
    set.hi = saved;
  }
  assert.equal(count("en", 1, "day"), "1 day");
  assert.equal(count("en", 2, "day"), "2 days");
  assert.equal(count("hinglish", 2, "day"), "2 din");
});

test("replies never leave a template placeholder", () => {
  for (const facts of [QUEST_ONLY, SAMPLE, {}]) {
    for (const m of [...DATA_PROMPTS, "kitna hua?", "details please, what's pending", "i quit"]) {
      const { reply } = draft(m, facts);
      assert.doesNotMatch(reply.text, /\{\w+\}/, `${m}: ${reply.text}`);
    }
  }
});

/* ── 13. Grounding ──────────────────────────────────────────────────── */

test("new templates pass their own grounding check", () => {
  for (const m of DATA_PROMPTS) {
    const { reply, context } = draft(m, QUEST_ONLY);
    const result = checkGrounding(reply.text, toModelContext(context), reply);
    assert.ok(result.ok, `${m}: ${result.reasons.join("; ")}`);
  }
});

test("grounding rejects an invented single-quoted name and fake AI claims", () => {
  const { reply, context } = draft("what's my quest?", QUEST_ONLY);
  const model = toModelContext(context);
  const invented = checkGrounding("Your active quest is 'Momo Madness' 😏", model, reply);
  assert.equal(invented.ok, false);
  assert.ok(invented.reasons.some((x) => x.includes("Momo Madness")));
  // Apostrophes are not names.
  assert.equal(
    checkGrounding(`${reply.text} You're doing fine, aren't you`, model, reply).ok,
    true
  );
  const ai = checkGrounding(`I analyzed your data with AI. ${reply.text}`, model, reply);
  assert.ok(ai.reasons.includes("fake AI claim"));
});

test("model context carries the reply language", () => {
  const { context } = draft("mera quest kya h", QUEST_ONLY);
  assert.equal(toModelContext(context).language, "hinglish");
});

/* ── 19. Quick prompts match supported intents ─────────────────────── */

test("quick prompts are the six from the brief and each routes to data", () => {
  assert.deepEqual(STARTER_PROMPTS, [
    "What's my streak?",
    "What's my quest?",
    "What's pending?",
    "What should I do today?",
    "Did I earn anything?",
    "How's my progress?",
  ]);
  const routes = STARTER_PROMPTS.map((p) => classifyIntent(p).intent);
  assert.deepEqual(routes, ["streak", "quests", "focus", "focus", "rewards", "progress"]);
});

test("every suggestion chip routes to a real intent", () => {
  for (const facts of [QUEST_ONLY, SAMPLE]) {
    for (const m of DATA_PROMPTS) {
      for (const s of draft(m, facts).reply.suggestions) {
        assert.notEqual(classifyIntent(s).intent, "unknown", s);
      }
    }
  }
});

/* ── 23. The 16 prompts from the brief, end to end ─────────────────── */

test("the 16 manual prompts, in order, through the real pipeline", async () => {
  const fake = fakeSupabase({
    user: { id: USER_ID },
    tables: {
      profiles: {
        data: [{ full_name: "Aditya Kumar", username: "aditya", is_deactivated: false }],
      },
      profile_challenge_stats: { data: [] },
      challenge_participants: { data: [] },
      quest_participants: {
        data: [
          {
            quest_id: "q9",
            verification_status: "pending",
            completed_at: null,
            joined_at: inDays(-2),
            quest: {
              title: "Veer Ji Chaap",
              business_name: "Veer Ji",
              location_name: null,
              ends_at: inDays(6),
              end_date: null,
            },
          },
        ],
      },
      quest_tasks: {
        data: ["t1", "t2", "t3"].map((id) => ({ id, quest_id: "q9", is_required: true })),
      },
      quest_task_submissions: { data: [] },
      quest_rewards: {
        data: [{ quest_id: "q9", title: "Cash Prize", quest: { title: "Veer Ji Chaap" } }],
      },
      quest_reward_claims: { data: [] },
      proof_submissions: { data: [] },
      profile_heatmap: { data: [] },
    },
  });

  const expected: [string, RegExp, RegExp?][] = [
    ["hey", /^Hey/],
    ["how's my streak?", /No active challenge yet/],
    ["meri streak kaisi h?", /Abhi (active challenge nahi|streak zero)/],
    [
      "mera quest kya h?",
      /Tera active quest 'Veer Ji Chaap' hai 😏 Abhi 0\/3 tasks approved hain\./,
    ],
    ["mera quest kitna hua?", /0\/3/, CHALLENGE_FACTS],
    ["kitna progress hua?", /Veer Ji Chaap.*0\/3|0\/3.*Veer Ji Chaap/, CHALLENGE_FACTS],
    ["aaj kya pending h?", /Veer Ji Chaap/],
    ["ab kya karna hai?", /Veer Ji Chaap/],
    [
      "did i earn anything?",
      /No reward earned yet 👀 But 'Veer Ji Chaap' still has Cash Prize in play\./,
    ],
    ["bhai reward mila?", /Cash Prize/],
    ["हमार क्वेस्ट का बा?", /तोहार active quest 'Veer Ji Chaap' बा/],
    ["आज का करे के बा?", /निपटा द भइया/],
    ["what's my quest?", /Your active quest is 'Veer Ji Chaap'|You're on 'Veer Ji Chaap'/],
    ["what's pending?", /Veer Ji Chaap/],
    ["how much time do I have?", /Veer Ji Chaap.*6 days/],
    ["quest ke kitne task bache hain?", /0\/3.*3 baaki/, CHALLENGE_FACTS],
  ];

  const history: ChatTurn[] = [];
  for (const [message, want, never] of expected) {
    const { reply } = await runStrivyPipeline({
      supabase: fake.client,
      userId: USER_ID,
      message,
      history,
      provider: deterministicProvider,
    });
    assert.match(reply.text, want, `${message}: ${reply.text}`);
    if (never) assert.doesNotMatch(reply.text, never, `${message}: ${reply.text}`);
    if (/quest|क्वेस्ट/.test(message)) {
      assert.doesNotMatch(
        reply.text,
        /days active|No approved proof/,
        `${message} used challenge data`
      );
    }
    history.push(
      { role: "user", text: message },
      { role: "strivy", text: reply.text, intent: reply.intent }
    );
  }
});

/* ── 16. Panel theme ─────────────────────────────────────────────────── */

function withStorage(store: Record<string, string> | "blocked", fn: () => void) {
  const g = globalThis as unknown as { window?: unknown };
  const before = g.window;
  g.window =
    store === "blocked"
      ? {
          get localStorage(): never {
            throw new Error("blocked");
          },
        }
      : {
          localStorage: {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => {
              store[k] = v;
            },
          },
        };
  try {
    fn();
  } finally {
    g.window = before;
  }
}

test("the panel theme defaults to light and persists on this device", () => {
  const store: Record<string, string> = {};
  withStorage(store, () => {
    assert.equal(loadTheme(), "light");
    saveTheme("dark");
    assert.equal(loadTheme(), "dark");
    saveTheme("light");
    assert.equal(loadTheme(), "light");
  });
  assert.equal(store["strivy:theme:v1"], "light");
  withStorage({ "strivy:theme:v1": "purple" }, () => assert.equal(loadTheme(), "light"));
});

test("blocked storage never breaks the theme toggle", () => {
  withStorage("blocked", () => {
    assert.equal(loadTheme(), "light");
    assert.doesNotThrow(() => saveTheme("dark"));
  });
});
