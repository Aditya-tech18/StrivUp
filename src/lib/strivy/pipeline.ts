/**
 * src/lib/strivy/pipeline.ts
 *
 * STRIVY's reply pipeline, end to end:
 *
 *   message → intent → context (user facts + product knowledge) → grounded
 *   draft → text model (OpenRouter free router, when configured) → grounding
 *   check → final reply
 *
 * Every step before the rewrite is deterministic, and the draft is always a
 * complete, correct answer on its own. The rewrite is only used when a
 * provider is enabled, answers in time, and passes checkGrounding(); in every
 * other case the draft is returned. Crisis replies never go to a model.
 *
 * handleStrivyChatRequest() is the whole HTTP handler with its dependencies
 * injected, so tests can run it with a mocked Supabase client and provider.
 * The route file only wires in the real ones.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildStrivyContext, toModelContext } from "./context";
import { checkGrounding } from "./grounding";
import { classifyIntent } from "./intents";
import { detectLanguage, isRomanBhojpuri, type StrivyLang } from "./language";
import { chatLimiter, type RateLimiter } from "./ratelimit";
import {
  MODEL_TIMEOUT_MS,
  withTimeout,
  type ModelMode,
  type ModelStats,
  type StrivyModelProvider,
} from "./model";
import { ModelUnavailableError } from "./modeltext";
import type { StrivyNotifier } from "./notifier";
import { runAccountabilityCheck } from "./proactive";
import { draftReply } from "./replies";
import { wantsRedirect } from "./general";
import { PHRASES, say } from "./phrases";
import { sanitizeReply, stripInternalMetadata } from "./sanitize";
import type { ChatTurn, IntentResult, StrivyIntent, StrivyReply } from "./types";

export const MAX_MESSAGE_CHARS = 500;
export const MAX_HISTORY_TURNS = 8;

const INTENTS = new Set<StrivyIntent>([
  "greeting",
  "thanks",
  "today",
  "focus",
  "streak",
  "proof_status",
  "progress",
  "challenges",
  "quests",
  "rewards",
  "how_it_works",
  "company_info",
  "help",
  "strivy_info",
  "capabilities",
  "general_chat",
  "general_question",
  "banter",
  "action_request",
  "motivation",
  "create",
  "not_built",
  "off_topic",
  "crisis",
  "unknown",
]);

/** Intents whose reply must be shown exactly as written. */
/**
 * company_info: founder and team answers come only from knowledge.ts, so a
 * model can never add (or invent) a name.
 */
const NEVER_REWRITE = new Set<StrivyIntent>(["crisis", "company_info"]);

/**
 * Small talk: the model answers in its own words (no personal data is read or
 * sent for these). Everything else is a rewrite of the grounded draft.
 */
const CHAT_INTENTS = new Set<StrivyIntent>([
  "greeting",
  "thanks",
  "general_chat",
  "general_question",
  "capabilities",
  "strivy_info",
  "off_topic",
]);

/** General questions: answered first, then (sometimes) a short StrivUp nudge. */
const ANSWER_INTENTS = new Set<StrivyIntent>(["general_question", "off_topic"]);

/** Every wording of the StrivUp nudge, to avoid adding it twice in a row. */
const REDIRECT_LINES: string[] = Object.values(PHRASES.strivupRedirect).flat();

/**
 * A general answer plus, about half the time, a short StrivUp nudge in the
 * person's language. Never when the previous reply already ended with one.
 */
function withRedirect(
  reply: StrivyReply,
  message: string,
  lang: StrivyLang,
  dialect: "bhojpuri-roman" | undefined,
  previous: string | null
): StrivyReply {
  const hadOne = Boolean(previous && REDIRECT_LINES.some((l) => previous.includes(l)));
  if (!wantsRedirect(message, hadOne)) return reply;
  const line = say(lang, "strivupRedirect", {}, message, dialect);
  return { ...reply, text: `${reply.text}\n\n${line}` };
}

function modeFor(intent: IntentResult): ModelMode {
  if (CHAT_INTENTS.has(intent.intent)) return "chat";
  // An unrecognised message (not a dangling follow-up) is small talk too.
  if (intent.intent === "unknown" && !intent.matched.includes("follow-up-no-context"))
    return "chat";
  return "rewrite";
}

/** Only the last exchange goes to a model, never the whole chat. */
const MODEL_HISTORY_TURNS = 2;

export interface PipelineMeta {
  intent: StrivyIntent;
  confidence: IntentResult["confidence"];
  matched: string[];
  lang: StrivyLang;
  provider: string;
  /** "rewrite" (data answer) or "chat" (small talk). */
  mode: ModelMode;
  /** true when the shown text came from the model rather than the draft. */
  modelUsed: boolean;
  /** Reasons the model's reply was rejected, if it was. */
  groundingRejected: string[] | null;
  /** Set when the provider threw, timed out or was unavailable. */
  modelError: string | null;
  /** Why the draft was shown instead of the model, in a few words. */
  fallbackReason: string | null;
  /** Milliseconds spent waiting for the model, when it was asked. */
  modelMs: number | null;
  /** Where the time went, in milliseconds. Server log only. */
  timings: PipelineTimings;
  /** The model's own breakdown (load, prompt, generation), when it reported one. */
  modelStats: ModelStats | null;
}

export interface PipelineTimings {
  intentMs: number;
  languageMs: number;
  /** Database reads for this intent (0 queries for small talk). */
  contextMs: number;
  draftMs: number;
  groundingMs: number | null;
  totalMs: number;
}

/** Milliseconds with sub-millisecond precision where the runtime has it. */
function clock(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

const round = (n: number) => Math.round(n * 10) / 10;

export interface PipelineResult {
  reply: StrivyReply;
  meta: PipelineMeta;
}

export async function runStrivyPipeline(input: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  history: ChatTurn[];
  provider: StrivyModelProvider;
  timeoutMs?: number;
}): Promise<PipelineResult> {
  const { supabase, userId, message, history, provider } = input;

  const t0 = clock();
  const intent = classifyIntent(message, history);
  const t1 = clock();
  const lang = detectLanguage(message, history);
  const t2 = clock();
  // Small talk needs no personal data: NEEDS lists none, so nothing is queried.
  const context = await buildStrivyContext(supabase, userId, intent, message, lang);
  const t3 = clock();
  // "ka haal ba bhai": Hinglish-script templates, but Bhojpuri small talk.
  const dialect = lang === "hinglish" && isRomanBhojpuri(message) ? "bhojpuri-roman" : undefined;
  if (dialect) context.dialect = dialect;
  const previous = [...history].reverse().find((t) => t.role === "strivy")?.text ?? null;
  let draft = draftReply(context, message);
  // Asked the same thing twice: pick another wording when there is one. The
  // wording is a hash of the message and date, so a few salts can all land on
  // the same one; ten make that vanishingly rare.
  for (let i = 1; i <= 10 && previous && draft.text === previous; i++) {
    const again = draftReply(context, message, `again-${i}`);
    if (again.text !== previous) draft = again;
  }
  const mode = modeFor(intent);
  const t4 = clock();
  const timings: PipelineTimings = {
    intentMs: round(t1 - t0),
    languageMs: round(t2 - t1),
    contextMs: round(t3 - t2),
    draftMs: round(t4 - t3),
    groundingMs: null,
    totalMs: 0,
  };
  // Every reply leaves the pipeline through here: internal labels (safety
  // verdicts, routing/debug lines, JSON wrappers) are removed from the
  // payload itself, so no surface (chat, voice, check-ins) can show them.
  const done = (result: PipelineResult): PipelineResult => {
    timings.totalMs = round(clock() - t0);
    return { ...result, reply: sanitizeReply(result.reply, draft.text) };
  };

  const meta: PipelineMeta = {
    intent: intent.intent,
    confidence: intent.confidence,
    matched: intent.matched,
    lang,
    provider: provider.name,
    mode,
    modelUsed: false,
    groundingRejected: null,
    modelError: null,
    fallbackReason: null,
    modelMs: null,
    timings,
    modelStats: null,
  };

  if (!provider.enabled)
    return done({ reply: draft, meta: { ...meta, fallbackReason: "model off" } });
  if (NEVER_REWRITE.has(intent.intent)) {
    return done({ reply: draft, meta: { ...meta, fallbackReason: "never rewritten" } });
  }
  // "2+2?" is computed exactly; no model needed.
  if (intent.intent === "general_question" && intent.matched.includes("math")) {
    return done({
      reply: withRedirect(draft, message, lang, dialect, previous),
      meta: { ...meta, fallbackReason: "computed" },
    });
  }

  const started = clock();
  const controller = new AbortController();
  try {
    const modelContext = toModelContext(context);
    if (dialect) modelContext.dialect = dialect;
    // A roast may only use what its draft already says (the one streak or
    // quest it teases), so no other number in the facts can be borrowed.
    if (intent.intent === "banter") modelContext.facts = {};
    if (ANSWER_INTENTS.has(intent.intent)) modelContext.chatTone = "answer";
    else if (intent.intent === "general_chat" && intent.matched.includes("general-mood"))
      modelContext.chatTone = "support";
    const candidate = await withTimeout(
      provider.generateResponse(modelContext, draft, message, {
        mode,
        history: history.slice(-MODEL_HISTORY_TURNS),
        signal: controller.signal,
        onStats: (stats) => {
          meta.modelStats = stats;
        },
      }),
      input.timeoutMs ?? provider.timeoutMs ?? MODEL_TIMEOUT_MS,
      () => controller.abort()
    );
    meta.modelMs = round(clock() - started);
    // Safety-classifier verdicts ("User Safety: safe") and other labels are
    // cut before anything else looks at the text.
    const raw = typeof candidate === "string" ? stripInternalMetadata(candidate) : "";
    // A chatty small-talk reply is cut to its first sentences rather than
    // thrown away for a canned line; it still has to pass the grounding check.
    const text = mode === "chat" ? shortenSmallTalk(raw) : raw;
    if (!text) {
      meta.fallbackReason = "empty model reply";
    } else if (text === draft.text) {
      meta.fallbackReason = "model kept the draft";
    } else {
      const g0 = clock();
      const grounding = checkGrounding(text, modelContext, draft, { mode, previous });
      timings.groundingMs = round(clock() - g0);
      if (grounding.ok) {
        meta.modelUsed = true;
        const answered = { ...draft, text };
        return done({
          reply: ANSWER_INTENTS.has(intent.intent)
            ? withRedirect(answered, message, lang, dialect, previous)
            : answered,
          meta,
        });
      }
      meta.groundingRejected = grounding.reasons;
      meta.fallbackReason = "failed the grounding check";
    }
  } catch (err) {
    meta.modelMs = round(clock() - started);
    meta.modelError = err instanceof Error ? err.message : "model failed";
    meta.fallbackReason =
      err instanceof ModelUnavailableError
        ? "model unavailable"
        : /timed out/.test(meta.modelError)
          ? "model timed out"
          : "model error";
  }

  return done({ reply: draft, meta });
}

/** Small talk stays within 3 sentences and 280 characters (what grounding allows). */
const SMALL_TALK_SENTENCES = 3;
const SMALL_TALK_CHARS = 280;

/**
 * The first few whole sentences of a small-talk reply. A reply that is
 * already short comes back unchanged; one with no sentence break that is
 * too long is left for the grounding check to reject.
 */
export function shortenSmallTalk(text: string): string {
  const sentences = text.match(
    /[^.!?…।\n]+(?:[.!?…।]+["'”’)]*\s*[\p{Extended_Pictographic}\u{FE0F}\u{200D}]*)?\s*/gu
  );
  if (!sentences || sentences.length <= SMALL_TALK_SENTENCES) {
    return text.length <= SMALL_TALK_CHARS || !sentences ? text : keepWithin(sentences);
  }
  return keepWithin(sentences.slice(0, SMALL_TALK_SENTENCES));
}

function keepWithin(sentences: string[]): string {
  let out = "";
  for (const s of sentences) {
    if ((out + s).trim().length > SMALL_TALK_CHARS) break;
    out += s;
  }
  return out.trim() || sentences.join("").trim();
}

/** What the dev-only debug log holds. Never the prompt or any user fact. */
export function debugInfo(meta: PipelineMeta) {
  return {
    intent: meta.intent,
    matched: meta.matched,
    lang: meta.lang,
    provider: meta.provider,
    mode: meta.mode,
    modelUsed: meta.modelUsed,
    fallbackReason: meta.fallbackReason,
    modelError: meta.modelError,
    validation: meta.groundingRejected ? { ok: false, reasons: meta.groundingRejected } : null,
    modelMs: meta.modelMs,
  };
}

/**
 * One short log line for a reply, e.g.
 * "quests · hinglish · openrouter · rewrite · model used · 812ms". Server log only:
 * it is never sent to the browser.
 */
export function debugLogLine(meta: PipelineMeta): string {
  const d = debugInfo(meta);
  const parts: string[] = [d.intent, d.lang, d.provider, d.mode];
  if (d.modelUsed) parts.push("model used");
  else if (d.fallbackReason) parts.push(`fallback: ${d.fallbackReason}`);
  if (d.validation) parts.push(`rejected: ${d.validation.reasons.slice(0, 3).join("; ")}`);
  if (d.modelError) parts.push(`error: ${d.modelError.slice(0, 120)}`);
  if (typeof d.modelMs === "number") parts.push(`model ${Math.round(d.modelMs)}ms`);
  const t = meta.timings;
  if (t) {
    parts.push(
      `intent ${t.intentMs}ms, lang ${t.languageMs}ms, db ${t.contextMs}ms, draft ${t.draftMs}ms` +
        (t.groundingMs !== null ? `, grounding ${t.groundingMs}ms` : "") +
        `, pipeline ${t.totalMs}ms`
    );
  }
  const s = meta.modelStats;
  if (s && s.servedBy !== undefined) {
    parts.push(
      `model: ${s.servedBy ?? "?"}, request ${s.requestMs}ms, prompt ${s.promptTokens ?? "?"} tok, reply ${s.outputTokens ?? "?"} tok` +
        (s.doneReason === "length" ? " (hit the cap)" : "")
    );
  } else if (s) {
    parts.push(
      `ollama: load ${s.loadMs ?? "?"}ms, prompt ${s.promptTokens ?? "?"} tok in ${s.promptEvalMs ?? "?"}ms, first token ${s.firstTokenMs ?? "?"}ms, reply ${s.outputTokens ?? "?"} tok in ${s.evalMs ?? "?"}ms` +
        (s.doneReason === "length" ? " (hit the cap)" : "")
    );
  }
  return parts.join(" · ");
}

/** Durations only (no names, text or data), for the dev-only Server-Timing header. */
export function serverTiming(meta: PipelineMeta, authMs: number, totalMs: number): string {
  const t = meta.timings;
  const entries: [string, number | null][] = [
    ["auth", authMs],
    ["intent", t.intentMs],
    ["lang", t.languageMs],
    ["db", t.contextMs],
    ["model", meta.modelMs],
    ["first-token", meta.modelStats?.firstTokenMs ?? null],
    ["grounding", t.groundingMs],
    ["total", totalMs],
  ];
  return entries
    .filter((e): e is [string, number] => typeof e[1] === "number")
    .map(([name, dur]) => `${name};dur=${dur}`)
    .join(", ");
}

/** Dev-only: STRIVY_DEBUG=true outside production. Logs to the server console only. */
export function isStrivyDebugEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.STRIVY_DEBUG === "true";
}

/* ── HTTP handler ────────────────────────────────────────────────────────── */

export function parseChatBody(body: unknown): { message: string; history: ChatTurn[] } | null {
  if (typeof body !== "object" || body === null) return null;
  const { message, history } = body as { message?: unknown; history?: unknown };
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > MAX_MESSAGE_CHARS) return null;

  const turns: ChatTurn[] = Array.isArray(history)
    ? history
        .filter(
          (t): t is ChatTurn =>
            typeof t === "object" &&
            t !== null &&
            ((t as ChatTurn).role === "user" || (t as ChatTurn).role === "strivy") &&
            typeof (t as ChatTurn).text === "string"
        )
        .slice(-MAX_HISTORY_TURNS)
        .map((t) => ({
          role: t.role,
          text: t.text.slice(0, MAX_MESSAGE_CHARS * 4),
          ...(t.intent && INTENTS.has(t.intent) ? { intent: t.intent } : {}),
        }))
    : [];

  return { message: trimmed, history: turns };
}

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export interface ChatHandlerDeps {
  isEnabled: () => boolean;
  /** A Supabase client carrying the caller's own session (RLS applies). */
  getSupabase: () => Promise<SupabaseClient>;
  getProvider: () => StrivyModelProvider;
  /** Per-user request limit; the shared chat limiter when not given. */
  limiter?: RateLimiter;
  /** Logs a routing/model line per reply to the server console (development only). */
  debug?: () => boolean;
  /** Where debug lines go; console.info when not given. */
  log?: (line: string) => void;
  /** Where the per-reply provider line goes; console.info when not given. */
  audit?: (entry: ReturnType<typeof auditEntry>) => void;
}

/**
 * One line per reply, logged in production too, so the server logs show
 * whether a reply came from the model. Routing facts only: never the message,
 * the reply, the user id, keys or headers.
 */
export function auditEntry(meta: PipelineMeta) {
  return {
    intent: meta.intent,
    mode: meta.mode,
    provider: meta.provider,
    servedBy: meta.modelStats?.servedBy ?? null,
    modelUsed: meta.modelUsed,
    modelMs: meta.modelMs,
    fallbackReason: meta.fallbackReason,
    totalMs: meta.timings.totalMs,
  };
}

type Authorized =
  { ok: true; supabase: SupabaseClient; userId: string } | { ok: false; response: Response };

/**
 * Shared gate for every STRIVY endpoint: feature flag, a server-validated
 * user (getUser, never getSession), and the deactivation flag. The user id
 * always comes from the session, never from the request.
 */
export async function authorizeStrivyRequest(deps: {
  isEnabled: () => boolean;
  getSupabase: () => Promise<SupabaseClient>;
}): Promise<Authorized> {
  if (!deps.isEnabled()) return { ok: false, response: error(404, "Not found") };

  const supabase = await deps.getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: error(401, "Sign in to chat with Strivy.") };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_deactivated")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_deactivated === true) {
    return { ok: false, response: error(403, "This account is deactivated.") };
  }
  return { ok: true, supabase, userId: user.id };
}

/**
 * POST /api/strivy/chat. Any unexpected failure (Supabase unreachable, a bug)
 * becomes a plain 500 with a friendly message; details stay in the server log
 * and never reach the person.
 */
export async function handleStrivyChatRequest(
  request: Request,
  deps: ChatHandlerDeps
): Promise<Response> {
  try {
    return await handleChat(request, deps);
  } catch (err) {
    console.error("[strivy] chat failed", err instanceof Error ? err.name : "error");
    return error(500, "Something went sideways. Try that again.");
  }
}

async function handleChat(request: Request, deps: ChatHandlerDeps): Promise<Response> {
  const started = clock();
  const auth = await authorizeStrivyRequest(deps);
  const authMs = round(clock() - started);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  if (!(deps.limiter ?? chatLimiter).take(auth.userId)) {
    return error(429, "Easy there 😅 Give me a few seconds.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "Send a message as JSON.");
  }
  const parsed = parseChatBody(body);
  if (!parsed) return error(400, `Messages must be 1–${MAX_MESSAGE_CHARS} characters.`);

  const { reply, meta } = await runStrivyPipeline({
    supabase,
    userId: auth.userId,
    message: parsed.message,
    history: parsed.history,
    provider: deps.getProvider(),
  });

  // Routing metadata only; never the message text or any user data. An
  // unavailable local model is logged once by the provider itself.
  if (meta.groundingRejected || (meta.modelError && meta.fallbackReason !== "model unavailable")) {
    console.warn("[strivy] model fallback", {
      intent: meta.intent,
      provider: meta.provider,
      reason: meta.fallbackReason,
      rejected: meta.groundingRejected,
      error: meta.modelError,
    });
  }

  (deps.audit ?? ((e) => console.info("[strivy] reply", e)))(auditEntry(meta));

  // Routing details stay on the server; the person only ever gets the reply.
  // In development with STRIVY_DEBUG=true, the timings also go in a
  // Server-Timing header so the browser's Network tab shows the breakdown.
  if (deps.debug?.()) {
    const totalMs = round(clock() - started);
    (deps.log ?? console.info)(
      `[strivy] ${debugLogLine(meta)} · auth ${authMs}ms · api ${totalMs}ms`
    );
    return Response.json(
      { reply: sanitizeReply(reply) },
      { headers: { "Server-Timing": serverTiming(meta, authMs, totalMs) } }
    );
  }
  // Only the reply (text, chips, links, suggestions) ever leaves the server.
  return Response.json({ reply: sanitizeReply(reply) });
}

/* ── Check-in handler (proactive path) ──────────────────────────────────── */

export interface CheckinHandlerDeps {
  isEnabled: () => boolean;
  getSupabase: () => Promise<SupabaseClient>;
  getNotifier: (supabase: SupabaseClient) => StrivyNotifier;
  now?: () => Date;
}

/**
 * POST /api/strivy/checkin. Takes no input: the user is the session's, and
 * everything else is derived from their own data. Returns the check-ins to
 * show in the panel and whether notifications were written.
 */
export async function handleStrivyCheckinRequest(
  _request: Request,
  deps: CheckinHandlerDeps
): Promise<Response> {
  try {
    return await handleCheckin(deps);
  } catch (err) {
    console.error("[strivy] check-in failed", err instanceof Error ? err.name : "error");
    return error(500, "Something went sideways. Try that again.");
  }
}

async function handleCheckin(deps: CheckinHandlerDeps): Promise<Response> {
  const auth = await authorizeStrivyRequest(deps);
  if (!auth.ok) return auth.response;

  const result = await runAccountabilityCheck({
    supabase: auth.supabase,
    userId: auth.userId,
    notifier: deps.getNotifier(auth.supabase),
    now: deps.now?.(),
  });

  return Response.json({
    checkIns: result.checkIns.map((c) => ({
      key: c.event.dedupeKey,
      reply: sanitizeReply(c.reply),
    })),
    notifications: { status: result.delivery.status, created: result.delivery.inserted },
  });
}
