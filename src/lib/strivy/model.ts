/**
 * src/lib/strivy/model.ts
 *
 * The one place a language model plugs into STRIVY.
 *
 * STRIVY never lets a model produce facts. The reply is drafted from the
 * database first (replies.ts); a provider may only turn that draft into a
 * more natural line in Strivy's voice. The pipeline checks whatever a provider
 * returns against the facts (grounding.ts) and falls back to the draft when
 * the provider is off, slow, fails, or adds anything the facts don't support.
 *
 * Two providers:
 *  - openrouter: OpenRouter's FREE models (openrouter.ts), used whenever
 *    OPENROUTER_API_KEY is set. Free-only is enforced there.
 *  - deterministic ("none"): returns the draft unchanged. Used when no key is
 *    set or STRIVY_LLM_ENABLED=false.
 * Paid AI APIs are never used. The voice transcription service is not a text
 * provider and is never called from here. The old local Ollama provider (ollama.ts) is never
 * selected here.
 */
import { createOpenRouterProvider, openRouterConfigFromEnv } from "./openrouter";
import type { ChatTurn, StrivyModelContext, StrivyReply } from "./types";

/**
 * rewrite: rephrase a data answer, keeping every fact.
 * chat: small talk; the model has no personal data and may answer freely,
 * but still in Strivy's voice and still checked.
 */
export type ModelMode = "rewrite" | "chat";

export interface ModelCallOptions {
  mode?: ModelMode;
  /** The last exchange only, for tone and follow-ups. Never the whole chat. */
  history?: ChatTurn[];
  /** Aborted when the pipeline gives up waiting. */
  signal?: AbortSignal;
  /** Receives where the model's time went, when the provider can tell. */
  onStats?: (stats: ModelStats) => void;
}

/** One model call's timings, in milliseconds. null when the provider didn't say. */
export interface ModelStats {
  /** Building the prompt. */
  promptBuildMs: number;
  /** The HTTP call to the model, start to finish. */
  requestMs: number;
  /** Loading the model into memory (about 0 when it was already warm). */
  loadMs: number | null;
  promptTokens: number | null;
  promptEvalMs: number | null;
  /** Load + prompt evaluation: when the first reply token was produced. */
  firstTokenMs: number | null;
  outputTokens: number | null;
  /** Generating the reply. */
  evalMs: number | null;
  ollamaTotalMs: number | null;
  /** "stop", or "length" when the reply hit the token cap. */
  doneReason: string | null;
  /** The model that actually answered (the free router picks one). Server log only. */
  servedBy?: string | null;
}

export interface StrivyModelProvider {
  readonly name: string;
  /** false means the pipeline skips the provider and uses the draft. */
  readonly enabled: boolean;
  /** How long the pipeline waits for this provider. */
  readonly timeoutMs?: number;
  /**
   * Returns a reply, or null to use the draft. `context` is the minimal,
   * id-free view built by toModelContext(); with the user's message and the
   * last exchange, it is all a model sees.
   */
  generateResponse(
    context: StrivyModelContext,
    draft: StrivyReply,
    userMessage: string,
    options?: ModelCallOptions
  ): Promise<string | null>;
}

/** Default: no model. The database-drafted reply is the answer. */
export const deterministicProvider: StrivyModelProvider = {
  name: "none",
  enabled: false,
  async generateResponse(_context, draft) {
    return draft.text;
  },
};

/**
 * true unless the text model is explicitly switched off with
 * STRIVY_LLM_ENABLED=false (a kill switch; no key also means off).
 */
export function isTextModelAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.STRIVY_LLM_ENABLED?.trim().toLowerCase() !== "false";
}

let cached: { key: string; provider: StrivyModelProvider } | null = null;

/**
 * The text provider for this server: OpenRouter's free router when
 * OPENROUTER_API_KEY is set, otherwise the deterministic provider (STRIVY's
 * built-in grounded replies). Kept for the life of the process so its
 * rate-limit state is shared. Whatever is configured, only a free model can
 * be called (see openrouter.ts).
 */
export function getStrivyModelProvider(
  env: Record<string, string | undefined> = process.env,
  log: (message: string) => void = (m) => console.warn(m)
): StrivyModelProvider {
  if (!isTextModelAllowed(env)) return deterministicProvider;
  const key = [env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL, env.STRIVY_LLM_TIMEOUT_MS].join("|");
  if (cached?.key !== key) {
    const result = openRouterConfigFromEnv(env);
    if (result.config) {
      if (result.warning) log(`[strivy] ${result.warning}`);
      cached = { key, provider: createOpenRouterProvider(result.config) };
    } else {
      log(`[strivy] Text model off. ${result.error}`);
      cached = { key, provider: deterministicProvider };
    }
  }
  return cached.provider;
}

export const MODEL_TIMEOUT_MS = 4000;

/** Resolves to the provider's answer, or rejects after `ms` (and calls onTimeout). */
export function withTimeout<T>(
  promise: Promise<T>,
  ms = MODEL_TIMEOUT_MS,
  onTimeout?: () => void
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`model timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
