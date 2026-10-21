/**
 * Final polish checks that cut across modules: languages end to end, data
 * that fails to load, and push staying independent of any language model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runStrivyPipeline } from "@/lib/strivy/pipeline";
import { deterministicProvider } from "@/lib/strivy/model";
import { USER_ID, fakeSupabase } from "./helpers";

async function ask(message: string, tables: Parameters<typeof fakeSupabase>[0]["tables"] = {}) {
  const fake = fakeSupabase({ user: { id: USER_ID }, tables });
  return runStrivyPipeline({
    supabase: fake.client,
    userId: USER_ID,
    message,
    history: [],
    provider: deterministicProvider,
  });
}

test("each language and script is answered in kind", async () => {
  const cases: [string, string, RegExp][] = [
    ["what's up bro", "en", /^[^ऀ-ॿ]+$/],
    ["bhai kya haal hai", "hinglish", /^[^ऀ-ॿ]+$/],
    ["mera quest kya hai", "hinglish", /^[^ऀ-ॿ]+$/],
    ["bhai what's my streak yaar", "hinglish", /^[^ऀ-ॿ]+$/],
    ["भाई क्या हाल है", "hi", /[ऀ-ॿ]/],
    ["का हाल बा भाई", "bho", /[ऀ-ॿ]/],
    ["tohar ka haal ba", "hinglish", /\b(bani|ba|tohar|raua|bhai)\b/i],
    ["ka haal ba bhai", "hinglish", /\b(bani|ba|tohar|raua|bhai)\b/i],
  ];
  for (const [message, lang, script] of cases) {
    const { reply, meta } = await ask(message);
    assert.equal(meta.lang, lang, message);
    assert.match(reply.text, script, `${message}: ${reply.text}`);
  }
});

test("a failed query is 'couldn't load', never 'no progress'", async () => {
  for (const message of ["mera progress kya hai?", "meri streak kitni hai?", "what's my quest?"]) {
    const { reply } = await ask(message, {
      profile_heatmap: { error: { message: "boom" } },
      profile_challenge_stats: { error: { message: "boom" } },
      challenge_participants: { error: { message: "boom" } },
      quest_participants: { error: { message: "boom" } },
      proof_submissions: { error: { message: "boom" } },
    });
    assert.match(reply.text, /couldn't|load nahi|load नहीं/i, `${message}: ${reply.text}`);
    assert.doesNotMatch(reply.text, /no (active )?(streak|quest|progress)|zero/i, message);
  }
});

test("push delivery never depends on a language model", () => {
  const dir = new URL("../../src/lib/strivy/push/", import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), "utf8");
    assert.doesNotMatch(
      src,
      /from "\.\.\/(ollama|model)"|getStrivyModelProvider|gemini|googleapis/i,
      f
    );
  }
});
