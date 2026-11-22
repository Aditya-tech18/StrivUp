import { extractOutputText, isRetryableStatus, parseVerdict, type Verdict } from "./policy.ts";

export interface ImageReviewInput {
  bytes: ArrayBuffer;
  mime: string;
  prompt: string;
  apiKey: string;
  model: string;
}
export interface ImageReviewResult {
  verdict: Verdict | null;
  retryable: boolean;
  error: string | null;
}

/** A single bounded attempt. Durable backoff belongs to the database queue. */
export async function reviewImage(
  input: ImageReviewInput,
  fetcher: typeof fetch = fetch,
  timeoutMs = 35_000
): Promise<ImageReviewResult> {
  if (!input.apiKey)
    return { verdict: null, retryable: false, error: "GEMINI_API_KEY not configured" };
  try {
    let binary = "";
    const bytes = new Uint8Array(input.bytes);
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const response = await fetcher(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "x-goog-api-key": input.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          input: [
            { type: "text", text: input.prompt },
            { type: "image", data: btoa(binary), mime_type: input.mime },
          ],
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: {
              type: "object",
              properties: {
                matches: { type: "boolean" },
                confidence: { type: "number" },
                reasoning: { type: "string" },
              },
              required: ["matches", "confidence", "reasoning"],
            },
          },
        }),
      }
    );
    if (!response.ok)
      return {
        verdict: null,
        retryable: isRetryableStatus(response.status),
        error: `${input.model} HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`,
      };
    const verdict = parseVerdict(extractOutputText(await response.json()));
    return {
      verdict,
      retryable: !verdict,
      error: verdict ? null : "Invalid model verdict; retry scheduled",
    };
  } catch {
    return { verdict: null, retryable: true, error: input.model + " timed out or was unreachable" };
  }
}

const FALLBACK_MODEL = "gemini-3.8-flash";

export async function reviewImageWithFallback(
  input: ImageReviewInput,
  fetcher: typeof fetch = fetch
) {
  if (input.model === FALLBACK_MODEL) {
    return { ...(await reviewImage(input, fetcher)), model: input.model };
  }

  // Leave room for storage, DB reads and verdict persistence before pg_net's
  // 60-second dispatch timeout. One fallback per durable attempt.
  const primary = await reviewImage(input, fetcher, 22_000);
  if (primary.verdict || !primary.retryable) return { ...primary, model: input.model };

  const fallback = await reviewImage({ ...input, model: FALLBACK_MODEL }, fetcher, 16_000);
  if (fallback.verdict) return { ...fallback, model: FALLBACK_MODEL };

  // A fallback that is unavailable to this API key must not prevent the
  // original model from recovering on the next scheduled attempt.
  return {
    ...primary,
    model: input.model,
    error: [primary.error, fallback.error].filter(Boolean).join(" | "),
  };
}
