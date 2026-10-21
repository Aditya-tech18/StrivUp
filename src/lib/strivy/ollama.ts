/**
 * src/lib/strivy/ollama.ts
 *
 * LEGACY — NOT USED BY THE APP. STRIVY's text chat runs on OpenRouter's free
 * router (openrouter.ts); getStrivyModelProvider() never returns this
 * provider and no OLLAMA_* setting is read anywhere at runtime. The module is
 * kept, unchanged in behaviour, only because a large part of the pipeline's
 * regression suite drives the pipeline through it (a real HTTP model server,
 * faked locally). Delete it together with those tests when convenient.
 *
 * STRIVY's local language model: Ollama, running on this machine (or the
 * local network), never a cloud AI API.
 *
 * The model is not the source of truth. The pipeline drafts every answer from
 * the database first; Ollama only turns that draft (plus the few facts it
 * rests on) into a more natural STRIVY line, and grounding.ts rejects any
 * line that adds a number, name, date, status or claim. When Ollama is off,
 * unreachable, missing the model, slow, or returns junk, STRIVY answers with
 * the draft; the chat never depends on Ollama being up.
 *
 * Configuration (server-only):
 *   STRIVY_LLM_ENABLED=true            turn the local model on
 *   OLLAMA_BASE_URL=http://127.0.0.1:11434  (default; must be local)
 *   OLLAMA_MODEL=<a model you pulled>  e.g. llama3.2:3b; no default is assumed
 *   STRIVY_LLM_TIMEOUT_MS=30000        optional, 1000–60000
 *   OLLAMA_KEEP_ALIVE=30m              optional, how long Ollama keeps the model loaded
 *
 * Speed: the first request after Ollama starts (or after the model was
 * unloaded) has to load the model into memory, which on a laptop can take
 * several seconds on its own. The provider warms the model up in the
 * background as soon as the health check first passes, asks Ollama to keep it
 * loaded, and caps the prompt window and reply length so a warm reply stays
 * quick. The timeout covers the whole call.
 */
import { buildModelPrompt } from "./persona";
import type { ModelCallOptions, ModelStats, StrivyModelProvider } from "./model";
import type { StrivyModelContext, StrivyReply } from "./types";
import {
  MalformedModelResponseError,
  ModelUnavailableError,
  cleanModelText,
  trimToSentence,
} from "./modeltext";

// Re-exported so older imports keep working.
export { MalformedModelResponseError, ModelUnavailableError, cleanModelText, trimToSentence };

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
/** Local-development default. A cold model load alone can exceed a few seconds. */
export const DEFAULT_LLM_TIMEOUT_MS = 30_000;
export const MAX_LLM_TIMEOUT_MS = 60_000;
export const DEFAULT_KEEP_ALIVE = "30m";
/** Prompt window. Strivy's prompts are small; a smaller window loads faster. */
const NUM_CTX = 2048;
/**
 * Reply length cap in tokens. Small talk is 1 to 3 short sentences, and the
 * grounding check rejects anything over 280 characters anyway (about 80
 * tokens of Hinglish), so generating more only costs time. A reply cut off at
 * the cap is trimmed to its last full sentence (see trimToSentence).
 */
const NUM_PREDICT = { chat: 96, rewrite: 180 } as const;
/**
 * Sampling per mode. Rewrites stay close to the draft. Small talk gets some
 * freedom, but a 3B model at a high temperature with a strong repeat penalty
 * drifts into odd word choices in code-mixed Hinglish, so both stay moderate.
 */
const SAMPLING = {
  chat: { temperature: 0.7, top_p: 0.9, repeat_penalty: 1.1 },
  rewrite: { temperature: 0.4, top_p: 0.9, repeat_penalty: 1.15 },
} as const;
/** A warm-up only refreshes keep_alive when the model is loaded; at most once a minute. */
const WARM_UP_EVERY_MS = 60_000;
const HEALTH_TIMEOUT_MS = 1500;
/** How long a health result is trusted. A failure is retried sooner. */
const HEALTH_OK_TTL_MS = 60_000;
const HEALTH_FAIL_TTL_MS = 10_000;

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Ollama's keep_alive: "30m", "1h", "-1" (forever)… */
  keepAlive: string;
}

export interface OllamaHealth {
  ok: boolean;
  reachable: boolean;
  modelInstalled: boolean;
  model: string;
  baseUrl: string;
  /** Models Ollama reports as pulled, to help fix a wrong OLLAMA_MODEL. */
  installed: string[];
  /** A plain explanation, safe to show a developer. Never a stack trace. */
  message: string;
}

type Fetch = typeof fetch;

/* ── Configuration ─────────────────────────────────────────────────────── */

const PRIVATE_V4 =
  /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|127\.\d+\.\d+\.\d+)$/;

/**
 * Only a local Ollama is allowed: loopback, a private network address, the
 * Docker host alias or a .local name. Anything else (a public host, a cloud
 * AI API) is refused, so user facts can't leave the machine by a typo.
 */
export function isLocalUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "host.docker.internal" ||
    host.endsWith(".local") ||
    PRIVATE_V4.test(host)
  );
}

/** Reads the Ollama settings. Returns an error message instead of throwing. */
export function ollamaConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): { config: OllamaConfig; error: null } | { config: null; error: string } {
  const baseUrl = (env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
  if (!isLocalUrl(baseUrl)) {
    return {
      config: null,
      error: `OLLAMA_BASE_URL (${baseUrl}) must point to Ollama on this machine or your local network, e.g. ${DEFAULT_OLLAMA_BASE_URL}.`,
    };
  }
  const model = env.OLLAMA_MODEL?.trim() ?? "";
  if (!model) {
    return {
      config: null,
      error:
        "STRIVY_LLM_ENABLED is on but OLLAMA_MODEL is empty. Pull a model (for example `ollama pull llama3.2:3b`) and set OLLAMA_MODEL to its name.",
    };
  }
  if (!/^[\w.:/-]{1,100}$/.test(model)) {
    return { config: null, error: `OLLAMA_MODEL "${model}" isn't a valid model name.` };
  }
  const raw = Number(env.STRIVY_LLM_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(raw) && raw > 0
      ? Math.min(MAX_LLM_TIMEOUT_MS, Math.max(1000, Math.round(raw)))
      : DEFAULT_LLM_TIMEOUT_MS;
  const keepAliveRaw = env.OLLAMA_KEEP_ALIVE?.trim() ?? "";
  const keepAlive = /^(-1|\d{1,5}(ms|s|m|h)?)$/.test(keepAliveRaw)
    ? keepAliveRaw
    : DEFAULT_KEEP_ALIVE;
  return { config: { baseUrl, model, timeoutMs, keepAlive }, error: null };
}

/* ── Health check ─────────────────────────────────────────────────────── */

function sameModel(installed: string, wanted: string): boolean {
  const strip = (s: string) => s.toLowerCase().replace(/:latest$/, "");
  return strip(installed) === strip(wanted);
}

/** GET /api/tags: is Ollama up, and is the configured model pulled? */
export async function checkOllamaHealth(
  config: OllamaConfig,
  fetchImpl: Fetch = fetch,
  timeoutMs = HEALTH_TIMEOUT_MS
): Promise<OllamaHealth> {
  const base = { model: config.model, baseUrl: config.baseUrl, installed: [] as string[] };
  let res: Response;
  try {
    res = await fetchImpl(`${config.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    return {
      ...base,
      ok: false,
      reachable: false,
      modelInstalled: false,
      message: `Ollama isn't reachable at ${config.baseUrl}. Start it with \`ollama serve\` (or open the Ollama app).`,
    };
  }
  if (!res.ok) {
    return {
      ...base,
      ok: false,
      reachable: false,
      modelInstalled: false,
      message: `Ollama at ${config.baseUrl} answered HTTP ${res.status}. Is that really Ollama?`,
    };
  }
  let installed: string[] = [];
  try {
    const data = (await res.json()) as { models?: { name?: unknown; model?: unknown }[] };
    installed = (Array.isArray(data.models) ? data.models : [])
      .map((m) =>
        typeof m.name === "string" ? m.name : typeof m.model === "string" ? m.model : ""
      )
      .filter(Boolean);
  } catch {
    return {
      ...base,
      ok: false,
      reachable: true,
      modelInstalled: false,
      message: `Ollama at ${config.baseUrl} sent an unexpected reply to /api/tags.`,
    };
  }
  const modelInstalled = installed.some((m) => sameModel(m, config.model));
  return {
    ...base,
    installed,
    ok: modelInstalled,
    reachable: true,
    modelInstalled,
    message: modelInstalled
      ? `Ollama is up with ${config.model}.`
      : `Ollama is up, but "${config.model}" isn't pulled. Run \`ollama pull ${config.model}\`${
          installed.length
            ? ` or set OLLAMA_MODEL to one of: ${installed.slice(0, 5).join(", ")}`
            : ""
        }.`,
  };
}

/* ── Provider ─────────────────────────────────────────────────────────── */

export interface OllamaProvider extends StrivyModelProvider {
  /** Cached health; `force` re-checks now. */
  health(force?: boolean): Promise<OllamaHealth>;
}

export function createOllamaProvider(
  config: OllamaConfig,
  deps: {
    fetch?: Fetch;
    now?: () => number;
    log?: (message: string) => void;
    /** Preload the model once Ollama is healthy. On unless false. */
    warmUp?: boolean;
  } = {}
): OllamaProvider {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((m: string) => console.warn(m));
  let cached: { health: OllamaHealth; at: number } | null = null;
  let lastState: string | null = null;
  // Some Ollama versions or models refuse the `think` flag; remember and drop it.
  let sendThink = true;
  /** When the model was last warmed up or used; it stays loaded for keep_alive after. */
  let lastWarm = -Infinity;

  /**
   * Loads the model into memory in the background (an empty prompt to
   * /api/generate does only that), so the first real question doesn't pay
   * for the cold start. Fire and forget: a failure only means no head start.
   * Runs again after a quiet spell (the panel pings the health check when it
   * opens), so a model Ollama unloaded is back before the first message.
   */
  function warmUp() {
    if (deps.warmUp === false || now() - lastWarm < WARM_UP_EVERY_MS) return;
    lastWarm = now();
    void fetchImpl(`${config.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, keep_alive: config.keepAlive }),
      signal: AbortSignal.timeout(Math.max(config.timeoutMs, 30_000)),
      cache: "no-store",
    })
      .then((res) => res.body?.cancel())
      .catch(() => {
        lastWarm = -Infinity;
      });
  }

  function remember(health: OllamaHealth) {
    cached = { health, at: now() };
    const state = health.ok ? "ok" : health.message;
    if (health.ok) warmUp();
    if (state !== lastState) {
      lastState = state;
      log(
        health.ok
          ? `[strivy] Local LLM ready: ${config.model} at ${config.baseUrl}`
          : `[strivy] Local LLM unavailable, using deterministic replies. ${health.message}`
      );
    }
    return health;
  }

  function markDown(message: string) {
    remember({
      ok: false,
      reachable: false,
      modelInstalled: false,
      model: config.model,
      baseUrl: config.baseUrl,
      installed: [],
      message,
    });
  }

  async function health(force = false): Promise<OllamaHealth> {
    if (!force && cached) {
      const ttl = cached.health.ok ? HEALTH_OK_TTL_MS : HEALTH_FAIL_TTL_MS;
      if (now() - cached.at < ttl) return cached.health;
    }
    return remember(await checkOllamaHealth(config, fetchImpl));
  }

  async function chat(body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
    return fetchImpl(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  }

  return {
    name: "ollama",
    enabled: true,
    timeoutMs: config.timeoutMs,
    health,
    async generateResponse(
      context: StrivyModelContext,
      draft: StrivyReply,
      userMessage: string,
      options: ModelCallOptions = {}
    ): Promise<string | null> {
      const h = await health();
      if (!h.ok) throw new ModelUnavailableError(h.message);

      const mode = options.mode ?? "rewrite";
      const promptStarted = now();
      const prompt = buildModelPrompt(context, draft, userMessage, {
        mode,
        history: options.history ?? [],
      });
      const promptMs = now() - promptStarted;
      const timeout = AbortSignal.timeout(config.timeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      const body: Record<string, unknown> = {
        model: config.model,
        stream: false,
        keep_alive: config.keepAlive,
        messages: prompt.messages,
        // The grounding check does the rest.
        options: {
          ...SAMPLING[mode],
          num_ctx: NUM_CTX,
          num_predict: NUM_PREDICT[mode],
        },
      };
      if (sendThink) body.think = false;

      let res: Response;
      const requestStarted = now();
      lastWarm = requestStarted;
      try {
        res = await chat(body, signal);
        if (res.status === 400 && sendThink) {
          const text = await res.text().catch(() => "");
          if (/think/i.test(text)) {
            sendThink = false;
            delete body.think;
            res = await chat(body, signal);
          } else {
            throw new MalformedModelResponseError(`Ollama refused the request (HTTP 400)`);
          }
        }
      } catch (err) {
        if (err instanceof MalformedModelResponseError) throw err;
        if (timeout.aborted) throw new Error(`timed out after ${config.timeoutMs}ms`);
        if (options.signal?.aborted) throw new Error("cancelled");
        markDown(`Ollama isn't reachable at ${config.baseUrl}. Start it with \`ollama serve\`.`);
        throw new ModelUnavailableError("Ollama isn't reachable");
      }

      if (res.status === 404) {
        markDown(`Ollama doesn't have "${config.model}". Run \`ollama pull ${config.model}\`.`);
        throw new ModelUnavailableError(`model "${config.model}" not found`);
      }
      if (!res.ok) throw new MalformedModelResponseError(`Ollama answered HTTP ${res.status}`);

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new MalformedModelResponseError();
      }
      const reply = data as OllamaChatResponse | null;
      const content = reply?.message?.content;
      if (typeof content !== "string") throw new MalformedModelResponseError();
      options.onStats?.(chatStats(reply as OllamaChatResponse, promptMs, now() - requestStarted));
      let text = cleanModelText(content);
      if (reply?.done_reason === "length") text = trimToSentence(text);
      return text || null;
    },
  };
}

/** The timing fields of a non-streamed /api/chat reply (durations in nanoseconds). */
interface OllamaChatResponse {
  message?: { content?: unknown };
  done_reason?: unknown;
  total_duration?: unknown;
  load_duration?: unknown;
  prompt_eval_count?: unknown;
  prompt_eval_duration?: unknown;
  eval_count?: unknown;
  eval_duration?: unknown;
}

const ms = (ns: unknown) => (typeof ns === "number" && ns >= 0 ? Math.round(ns / 1e6) : null);
const count = (n: unknown) => (typeof n === "number" && n >= 0 ? n : null);

/**
 * Where the model's time went. Ollama doesn't stream here, so "first token"
 * is load + prompt evaluation: the moment generation started.
 */
function chatStats(r: OllamaChatResponse, promptMs: number, requestMs: number): ModelStats {
  const loadMs = ms(r.load_duration);
  const promptEvalMs = ms(r.prompt_eval_duration);
  return {
    promptBuildMs: promptMs,
    requestMs,
    loadMs,
    promptTokens: count(r.prompt_eval_count),
    promptEvalMs,
    firstTokenMs: loadMs !== null && promptEvalMs !== null ? loadMs + promptEvalMs : null,
    outputTokens: count(r.eval_count),
    evalMs: ms(r.eval_duration),
    ollamaTotalMs: ms(r.total_duration),
    doneReason: typeof r.done_reason === "string" ? r.done_reason : null,
  };
}

/** A provider that is switched on but misconfigured: always falls back, says why. */
export function misconfiguredProvider(message: string): OllamaProvider {
  const health: OllamaHealth = {
    ok: false,
    reachable: false,
    modelInstalled: false,
    model: "",
    baseUrl: "",
    installed: [],
    message,
  };
  let logged = false;
  return {
    name: "ollama",
    enabled: true,
    async health() {
      return health;
    },
    async generateResponse() {
      if (!logged) {
        logged = true;
        console.warn(`[strivy] Local LLM unavailable, using deterministic replies. ${message}`);
      }
      throw new ModelUnavailableError(message);
    },
  };
}
