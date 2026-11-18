/**
 * src/lib/strivy/openrouter.ts
 *
 * STRIVY's text model: OpenRouter's FREE models, called from the server only.
 *
 * ── ₹0 by design ──────────────────────────────────────────────────────────
 * STRIVY must never spend money on text generation. Three independent guards:
 *
 *  1. Model id. Only OpenRouter's Free Models Router ("openrouter/free") or a
 *     model id ending in ":free" is ever sent. Anything else in
 *     OPENROUTER_MODEL (a paid model, a typo) is ignored with a warning and
 *     "openrouter/free" is used instead. See isFreeModelId().
 *  2. Price cap. Every request carries provider.max_price = 0 for prompt and
 *     completion, so OpenRouter may only route it to an endpoint that charges
 *     nothing.
 *  3. Circuit breaker. If a reply ever reports a non-zero cost, the provider
 *     switches itself off for the life of the process and STRIVY falls back to
 *     its built-in grounded replies.
 *
 * Belt and braces on the account side (see the report): keep the OpenRouter
 * account at zero credits, or give the key a $0 credit limit, and a paid call
 * is refused by OpenRouter itself.
 *
 * ── What the model is for ────────────────────────────────────────────────
 * The model is not the source of truth. The pipeline drafts every data answer
 * from Supabase first; the model only rewrites that draft (plus the few facts
 * it rests on) into a natural STRIVY line, and grounding.ts rejects any line
 * that adds a number, name, date, status or claim. Small talk goes to the
 * model with a compact prompt and no personal data at all. When OpenRouter is
 * not configured, rate-limited, slow, down, or returns junk, STRIVY answers
 * with the draft; the chat never depends on OpenRouter being up.
 *
 * Configuration (server-only, never NEXT_PUBLIC_):
 *   OPENROUTER_API_KEY=sk-or-...        required for model replies
 *   OPENROUTER_MODEL=openrouter/free    optional; must be free (see above)
 *   STRIVY_LLM_TIMEOUT_MS=30000         optional, 1000–60000
 *
 * The key is only ever placed in the Authorization header of the request to
 * OpenRouter. It is never logged, returned, or sent to the browser.
 *
 * No streaming: every model reply must pass the grounding check as a whole
 * before the person sees it, so a streamed reply could show text that is then
 * withdrawn. Replies are capped short instead, which keeps them quick.
 */
import { buildModelPrompt } from "./persona";
import type { ModelCallOptions, ModelStats, StrivyModelProvider } from "./model";
import {
  MalformedModelResponseError,
  ModelUnavailableError,
  cleanModelText,
  trimToSentence,
} from "./modeltext";
import { stripInternalMetadata } from "./sanitize";
import type { StrivyModelContext, StrivyReply } from "./types";

/**
 * Content-safety classifiers (Llama Guard, Nemotron Safety Guard…) answer
 * with a verdict ("User Safety: safe"), not a reply. If the free router ever
 * hands a request to one, its output is never used.
 */
export function isSafetyClassifierModel(model: unknown): boolean {
  return typeof model === "string" && /guard|safety|moderat|shield|content[-_]?filter/i.test(model);
}

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/** OpenRouter's Free Models Router: picks among currently free models only. */
export const FREE_ROUTER_MODEL = "openrouter/free";
export const DEFAULT_LLM_TIMEOUT_MS = 30_000;
export const MAX_LLM_TIMEOUT_MS = 60_000;

/**
 * Reply budget in tokens. Small talk is 1 to 3 short sentences and grounding
 * rejects anything over 280 characters anyway. The budget is roomier than
 * that because some free models think before answering and those tokens
 * count against it; reasoning is switched off where the model allows.
 */
const MAX_TOKENS = { chat: 256, rewrite: 320 } as const;
/**
 * When the free router lands on a model whose reasoning can't be switched
 * off, its thinking tokens share the budget with the reply, so the budget
 * grows. Still $0: the model id and the price cap are unchanged.
 */
const REASONING_MAX_TOKENS = { chat: 1024, rewrite: 1024 } as const;
/** Ask for no reasoning; models that allow it skip thinking entirely. */
const REASONING_OFF = { enabled: false, exclude: true } as const;
/**
 * For models that require reasoning: keep it short and leave it out of the
 * reply. Never `enabled: false`, which those endpoints refuse with HTTP 400.
 */
const REASONING_REQUIRED = { effort: "low", exclude: true } as const;
/**
 * After a "reasoning is mandatory" refusal, send REASONING_REQUIRED for this
 * long. The free router picks a model per request, so this isn't permanent:
 * afterwards STRIVY tries switching reasoning off again.
 */
const REASONING_REQUIRED_MS = 30 * 60_000;
/** Safety net against a refusal loop: one request plus at most this many retries. */
const MAX_RETRIES = 2;

/**
 * OpenRouter's refusal when STRIVY asks a reasoning-only model to stop
 * thinking: "Reasoning is mandatory for this endpoint and cannot be
 * disabled." Matched loosely, since providers word it differently.
 */
export function isReasoningRequiredError(text: string): boolean {
  return (
    /reasoning[^.]{0,80}\b(mandatory|required|cannot be disabled|can ?not be disabled|can't be disabled|must be enabled|cannot be turned off)\b/i.test(
      text
    ) || /\b(mandatory|required)\b[^.]{0,40}\breasoning\b/i.test(text)
  );
}

/** A refusal of the zero-price cap (some routes don't accept it). */
function isPriceCapError(text: string): boolean {
  return /max_price|\bprice\b/i.test(text);
}
const SAMPLING = {
  chat: { temperature: 0.8, top_p: 0.95 },
  rewrite: { temperature: 0.4, top_p: 0.9 },
} as const;
/** After a 429 (free-tier limit), skip the model for this long. */
const RATE_LIMIT_COOLDOWN_MS = 60_000;
/** After a 401/402/403 (bad key, no access), skip the model for this long. */
const AUTH_COOLDOWN_MS = 5 * 60_000;
const KEY_CHECK_TIMEOUT_MS = 4000;

export interface OpenRouterConfig {
  apiKey: string;
  /** Always free: "openrouter/free" or an id ending in ":free". */
  model: string;
  timeoutMs: number;
  baseUrl: string;
  /** Sent as HTTP-Referer for OpenRouter's app attribution; optional. */
  siteUrl?: string;
}

export interface OpenRouterHealth {
  ok: boolean;
  configured: boolean;
  model: string;
  /** From GET /key when checked: is this key on the free tier? */
  freeTier: boolean | null;
  /** A plain explanation, safe to show a developer. Never the key. */
  message: string;
}

type Fetch = typeof fetch;

/* ── Configuration ─────────────────────────────────────────────────────── */

/**
 * true only for ids that are free by OpenRouter's own naming: the Free Models
 * Router, or a specific model's ":free" variant.
 */
export function isFreeModelId(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (id === FREE_ROUTER_MODEL) return true;
  return /^[a-z0-9][\w.-]*\/[\w.:-]+:free$/.test(id) && id.split(":").length === 2;
}

/** "sk-or-v1-abcd…wxyz" style, for logs that must mention which key. Never the whole key. */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return "****";
  return `${k.slice(0, 5)}…${k.slice(-4)}`;
}

export type OpenRouterEnv =
  | { config: OpenRouterConfig; error: null; warning: string | null }
  | { config: null; error: string; warning: null };

/** Reads the OpenRouter settings. Returns an error message instead of throwing. */
export function openRouterConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): OpenRouterEnv {
  const apiKey = env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return {
      config: null,
      error:
        "OPENROUTER_API_KEY is not set, so STRIVY uses its built-in replies. Add a free OpenRouter key to .env.local to turn on natural replies.",
      warning: null,
    };
  }
  if (/\s/.test(apiKey) || apiKey.length > 300) {
    return { config: null, error: "OPENROUTER_API_KEY doesn't look like a key.", warning: null };
  }
  const wanted = env.OPENROUTER_MODEL?.trim() ?? "";
  let model = FREE_ROUTER_MODEL;
  let warning: string | null = null;
  if (wanted) {
    if (isFreeModelId(wanted)) model = wanted.toLowerCase();
    else
      warning = `OPENROUTER_MODEL "${wanted.slice(0, 80)}" is not a free model, so it is ignored and "${FREE_ROUTER_MODEL}" is used. STRIVY only uses free models ("${FREE_ROUTER_MODEL}" or an id ending in ":free").`;
  }
  const raw = Number(env.STRIVY_LLM_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(raw) && raw > 0
      ? Math.min(MAX_LLM_TIMEOUT_MS, Math.max(1000, Math.round(raw)))
      : DEFAULT_LLM_TIMEOUT_MS;
  const site = env.NEXT_PUBLIC_SITE_URL?.trim();
  const siteUrl = site && /^https?:\/\/[^\s]+$/.test(site) ? site : undefined;
  return {
    config: { apiKey, model, timeoutMs, baseUrl: OPENROUTER_BASE_URL, siteUrl },
    error: null,
    warning,
  };
}

/* ── Provider ─────────────────────────────────────────────────────────── */

export interface OpenRouterProvider extends StrivyModelProvider {
  /** Configuration state; `force` also asks OpenRouter about the key (dev only). */
  health(force?: boolean): Promise<OpenRouterHealth>;
}

interface ChatCompletion {
  model?: unknown;
  choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown };
  error?: { message?: unknown; code?: unknown; metadata?: { raw?: unknown } };
}

/** OpenRouter's short error text, without anything that could carry the key. */
function errorText(data: unknown): string {
  const e = (data as ChatCompletion | null)?.error;
  const msg = typeof e?.message === "string" ? e.message : "";
  return msg.replace(/sk-or-[\w-]+/g, "[key]").slice(0, 160);
}

/**
 * The error message plus the upstream provider's raw text, for recognising
 * a refusal. The upstream reason ("Reasoning is mandatory…") is often only
 * in metadata.raw. Used for matching, never logged.
 */
function errorDetail(data: unknown): string {
  const e = (data as ChatCompletion | null)?.error;
  const raw = e?.metadata?.raw;
  const rawText = typeof raw === "string" ? raw : raw ? JSON.stringify(raw) : "";
  return `${errorText(data)} ${rawText.slice(0, 500)}`;
}

/**
 * A 200 with nothing usable in it: no text (a reasoning model that spent its
 * budget thinking), or a safety classifier's verdict. The free router picks
 * a model per request, so one more try usually lands on a model that answers.
 */
class UnusableReplyError extends MalformedModelResponseError {}

export function createOpenRouterProvider(
  config: OpenRouterConfig,
  deps: { fetch?: Fetch; now?: () => number; log?: (message: string) => void } = {}
): OpenRouterProvider {
  if (!isFreeModelId(config.model)) {
    // Defence in depth: the env reader never produces this, but a caller might.
    throw new Error(`Refusing non-free OpenRouter model "${config.model}"`);
  }
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((m: string) => console.warn(m));
  /** Until when the model is skipped (rate limit, bad key). */
  let pausedUntil = 0;
  let pauseReason = "";
  /** Set for good if a reply ever reports a cost. */
  let costTripped = false;
  /** Some routes refuse the price cap; then the free model id alone guards. */
  let sendPriceCap = true;
  /** Until when requests carry REASONING_REQUIRED instead of REASONING_OFF. */
  let reasoningRequiredUntil = 0;
  let lastState: string | null = null;

  function note(state: string, message: string) {
    if (state === lastState) return;
    lastState = state;
    log(message);
  }

  function pause(ms: number, reason: string) {
    pausedUntil = now() + ms;
    pauseReason = reason;
    note(`paused:${reason}`, `[strivy] OpenRouter paused (${reason}); using built-in replies.`);
  }

  async function post(body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "STRIVUP",
    };
    if (config.siteUrl) headers["HTTP-Referer"] = config.siteUrl;
    return fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  }

  async function health(force = false): Promise<OpenRouterHealth> {
    const base = { configured: true, model: config.model, freeTier: null as boolean | null };
    if (costTripped)
      return {
        ...base,
        ok: false,
        message: "Switched off: OpenRouter reported a cost. STRIVY only uses free models.",
      };
    if (now() < pausedUntil)
      return { ...base, ok: false, message: `Paused for a moment (${pauseReason}).` };
    if (!force)
      return { ...base, ok: true, message: `OpenRouter is configured with ${config.model}.` };
    try {
      const res = await fetchImpl(`${config.baseUrl}/key`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403)
        return { ...base, ok: false, message: "OpenRouter rejected OPENROUTER_API_KEY." };
      if (!res.ok)
        return {
          ...base,
          ok: false,
          message: `OpenRouter answered HTTP ${res.status} to the key check.`,
        };
      const data = (await res.json().catch(() => null)) as {
        data?: { is_free_tier?: unknown };
      } | null;
      const freeTier =
        typeof data?.data?.is_free_tier === "boolean" ? data.data.is_free_tier : null;
      return {
        ...base,
        freeTier,
        ok: true,
        message: `OpenRouter key works; text chat uses ${config.model}.`,
      };
    } catch {
      return { ...base, ok: false, message: "OpenRouter isn't reachable from this server." };
    }
  }

  return {
    name: "openrouter",
    enabled: true,
    timeoutMs: config.timeoutMs,
    health,
    async generateResponse(context, draft, userMessage, options = {}) {
      // One shared deadline across the retry, so the person never waits
      // longer than a single timeout.
      const deadline = AbortSignal.timeout(config.timeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
      const run = () => generateOnce(context, draft, userMessage, { ...options, signal });
      try {
        try {
          const text = await run();
          if (text !== null) return text;
          if (signal.aborted) return null;
          note(
            "retry-empty",
            "[strivy] OpenRouter returned no text; asking once more (still free)."
          );
        } catch (err) {
          if (!(err instanceof UnusableReplyError) || signal.aborted) throw err;
          note(
            "retry-unusable",
            `[strivy] OpenRouter reply unusable (${err.message}); asking once more (still free).`
          );
        }
        return await run();
      } catch (err) {
        if (deadline.aborted && !options.signal?.aborted) {
          throw new Error(`timed out after ${config.timeoutMs}ms`);
        }
        throw err;
      }
    },
  };

  async function generateOnce(
    context: StrivyModelContext,
    draft: StrivyReply,
    userMessage: string,
    options: ModelCallOptions = {}
  ): Promise<string | null> {
    if (costTripped) throw new ModelUnavailableError("switched off after a reported cost");
    if (now() < pausedUntil) throw new ModelUnavailableError(`paused (${pauseReason})`);

    const mode = options.mode ?? "rewrite";
    const promptStarted = now();
    const prompt = buildModelPrompt(context, draft, userMessage, {
      mode,
      history: options.history ?? [],
    });
    const promptMs = now() - promptStarted;
    const timeout = AbortSignal.timeout(config.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const reasoningRequired = now() < reasoningRequiredUntil;
    const body: Record<string, unknown> = {
      model: config.model,
      messages: prompt.messages,
      max_tokens: (reasoningRequired ? REASONING_MAX_TOKENS : MAX_TOKENS)[mode],
      ...SAMPLING[mode],
      stream: false,
      // A one-line reply needs no thinking. Models that must think refuse
      // `enabled: false` (HTTP 400), so after such a refusal the request
      // asks for brief, hidden reasoning instead (see below).
      reasoning: reasoningRequired ? REASONING_REQUIRED : REASONING_OFF,
    };
    if (sendPriceCap) body.provider = { max_price: { prompt: 0, completion: 0 } };

    /**
     * A refusal STRIVY can fix by changing the request, or null. The model
     * id is never changed, so a retry is as free as the first try.
     */
    const fixRefusal = (data: unknown): "price" | "reasoning" | null => {
      const detail = errorDetail(data);
      if (isReasoningRequiredError(detail) && body.reasoning !== REASONING_REQUIRED) {
        reasoningRequiredUntil = now() + REASONING_REQUIRED_MS;
        body.reasoning = REASONING_REQUIRED;
        body.max_tokens = REASONING_MAX_TOKENS[mode];
        note(
          "reasoning-required",
          "[strivy] OpenRouter picked a model that must reason; retrying with brief hidden reasoning (still free)."
        );
        return "reasoning";
      }
      if (sendPriceCap && isPriceCapError(detail)) {
        // The id is still free-only; only the extra cap is dropped.
        sendPriceCap = false;
        delete body.provider;
        return "price";
      }
      return null;
    };

    const requestStarted = now();
    let res: Response;
    /** A 200 that carried a fixable refusal in its body, already read. */
    let data: ChatCompletion | null = null;
    try {
      for (let attempt = 0; ; attempt++) {
        data = null;
        res = await post(body, signal);
        if (res.status === 400 || res.status === 422) {
          const refusal = await res.json().catch(() => null);
          if (attempt < MAX_RETRIES && fixRefusal(refusal)) continue;
          throw new MalformedModelResponseError(
            `OpenRouter refused the request (HTTP ${res.status}${errorText(refusal) ? `: ${errorText(refusal)}` : ""})`
          );
        }
        if (res.ok) {
          // OpenRouter can report an upstream refusal inside a 200.
          try {
            data = (await res.json()) as ChatCompletion | null;
          } catch {
            throw new MalformedModelResponseError();
          }
          if (data?.error && attempt < MAX_RETRIES && fixRefusal(data)) continue;
        }
        break;
      }
    } catch (err) {
      if (err instanceof MalformedModelResponseError) throw err;
      if (timeout.aborted) throw new Error(`timed out after ${config.timeoutMs}ms`);
      if (options.signal?.aborted) throw new Error("cancelled");
      throw new ModelUnavailableError("OpenRouter isn't reachable");
    }

    if (res.status === 401 || res.status === 403) {
      pause(AUTH_COOLDOWN_MS, "the API key was rejected");
      throw new ModelUnavailableError("OpenRouter rejected the API key");
    }
    if (res.status === 402) {
      pause(AUTH_COOLDOWN_MS, "OpenRouter wants credits; STRIVY never pays");
      throw new ModelUnavailableError("OpenRouter asked for credits (402)");
    }
    if (res.status === 429) {
      pause(RATE_LIMIT_COOLDOWN_MS, "free-tier rate limit");
      throw new ModelUnavailableError("OpenRouter free-tier rate limit (429)");
    }
    if (!res.ok) {
      const failure = await res.json().catch(() => null);
      throw new MalformedModelResponseError(
        `OpenRouter answered HTTP ${res.status}${errorText(failure) ? `: ${errorText(failure)}` : ""}`
      );
    }

    // OpenRouter can report an upstream failure inside a 200.
    if (data?.error) throw new MalformedModelResponseError(`OpenRouter: ${errorText(data)}`);

    const cost = typeof data?.usage?.cost === "number" ? data.usage.cost : 0;
    if (cost > 0) {
      costTripped = true;
      log(
        `[strivy] OpenRouter reported a cost (${cost}) for model ${String(data?.model ?? "?")}. ` +
          "The model is switched off until the server restarts; STRIVY only uses free models."
      );
      throw new ModelUnavailableError("a reply reported a cost");
    }

    const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined;
    const content = choice?.message?.content;
    if (typeof content !== "string") throw new UnusableReplyError("no text in the reply");
    const finish = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
    options.onStats?.(
      completionStats(data as ChatCompletion, promptMs, now() - requestStarted, finish)
    );
    if (isSafetyClassifierModel(data?.model)) {
      throw new UnusableReplyError(
        `a safety classifier answered (${String(data?.model).slice(0, 80)})`
      );
    }
    note("ok", `[strivy] OpenRouter text model ready (${config.model}).`);
    let text = stripInternalMetadata(cleanModelText(content));
    if (finish === "length") text = trimToSentence(text);
    return text || null;
  }
}

const count = (n: unknown) => (typeof n === "number" && n >= 0 ? n : null);

function completionStats(
  r: ChatCompletion,
  promptMs: number,
  requestMs: number,
  finish: string | null
): ModelStats {
  return {
    promptBuildMs: promptMs,
    requestMs,
    loadMs: null,
    promptTokens: count(r.usage?.prompt_tokens),
    promptEvalMs: null,
    firstTokenMs: null,
    outputTokens: count(r.usage?.completion_tokens),
    evalMs: null,
    ollamaTotalMs: null,
    doneReason: finish,
    servedBy: typeof r.model === "string" ? r.model.slice(0, 80) : null,
  };
}
