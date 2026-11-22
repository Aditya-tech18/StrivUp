import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRetryableStatus,
  parseVerdict,
  extractOutputText,
} from "../../supabase/functions/review-proof/policy.ts";
import {
  reviewImage,
  reviewImageWithFallback,
} from "../../supabase/functions/review-proof/review.ts";

const input = {
  bytes: new ArrayBuffer(0),
  mime: "image/jpeg",
  prompt: "Check task",
  apiKey: "test",
  model: "primary",
};
const validVerdict = (matches: boolean) =>
  Response.json({
    outputs: [
      {
        type: "text",
        text: JSON.stringify({ matches, confidence: 0.9, reasoning: "Task evidence" }),
      },
    ],
  });

test("Gemini 3.8 Flash takes over after primary overload", async () => {
  const models: string[] = [];
  const result = await reviewImageWithFallback(input, async (_, request) => {
    const { model } = JSON.parse(String(request?.body));
    models.push(model);
    return model === "primary" ? new Response("busy", { status: 503 }) : validVerdict(true);
  });
  assert.deepEqual(models, ["primary", "gemini-3.8-flash"]);
  assert.equal(result.model, "gemini-3.8-flash");
  assert.equal(result.verdict?.matches, true);
});

test("a valid rejection or permanent credential error does not call the fallback", async () => {
  for (const response of [validVerdict(false), new Response("unauthorized", { status: 403 })]) {
    let calls = 0;
    const result = await reviewImageWithFallback(input, async () => {
      calls++;
      return response;
    });
    assert.equal(calls, 1);
    assert.equal(result.retryable, false);
  }
});

test("a failed fallback preserves the primary model's durable retry", async () => {
  const result = await reviewImageWithFallback(input, async (_, request) => {
    const { model } = JSON.parse(String(request?.body));
    return new Response("unavailable", { status: model === "primary" ? 503 : 404 });
  });
  assert.equal(result.retryable, true);
  assert.equal(result.verdict, null);
  assert.match(result.error ?? "", /primary HTTP 503.*gemini-3\.8-flash HTTP 404/);
});

test("proof review retries only transient upstream HTTP failures", () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504])
    assert.equal(isRetryableStatus(status), true);
  for (const status of [400, 401, 403, 404, 413, 422])
    assert.equal(isRetryableStatus(status), false);
});

test("upstream outages are retryable and never produce an approval", async () => {
  const result = await reviewImage(
    {
      bytes: new Uint8Array([1, 2]).buffer,
      mime: "image/jpeg",
      prompt: "Check task",
      apiKey: "test",
      model: "test-model",
    },
    async () => new Response("busy", { status: 503 })
  );
  assert.equal(result.retryable, true);
  assert.equal(result.verdict, null);
});

test("credential/configuration errors go to human review instead of endless paid retries", async () => {
  const result = await reviewImage(
    {
      bytes: new ArrayBuffer(0),
      mime: "image/jpeg",
      prompt: "task",
      apiKey: "test",
      model: "test-model",
    },
    async () => new Response("bad key", { status: 403 })
  );
  assert.equal(result.retryable, false);
  assert.equal(result.verdict, null);
});

test("temporary network failures and malformed AI output remain retryable", async () => {
  const input = {
    bytes: new ArrayBuffer(0),
    mime: "image/jpeg",
    prompt: "task",
    apiKey: "test",
    model: "test-model",
  };
  assert.equal(
    (
      await reviewImage(input, async () => {
        throw new Error("network down");
      })
    ).retryable,
    true
  );
  assert.equal(
    (
      await reviewImage(input, async () =>
        Response.json({ outputs: [{ type: "text", text: "not JSON" }] })
      )
    ).retryable,
    true
  );
});

test("proof verdict validation rejects incomplete and non-finite decisions", () => {
  for (const text of [
    "{}",
    '{"matches":true}',
    '{"matches":true,"confidence":1e999}',
    "no verdict",
  ]) {
    assert.equal(parseVerdict(text), null);
  }
  assert.deepEqual(parseVerdict('{"matches":true,"confidence":1.5,"reasoning":"Visible task"}'), {
    matches: true,
    confidence: 1,
    reasoning: "Visible task",
  });
});

test("proof review reads both current and legacy Interactions response shapes", () => {
  assert.equal(
    extractOutputText({
      steps: [{ type: "model_output", content: [{ type: "text", text: "legacy" }] }],
    }),
    "legacy"
  );
  assert.equal(extractOutputText({ outputs: [{ type: "text", text: "current" }] }), "current");
  assert.equal(extractOutputText({}), "");
});
