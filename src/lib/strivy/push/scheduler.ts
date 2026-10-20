/**
 * src/lib/strivy/push/scheduler.ts
 *
 * One scheduler pass. Meant to be called every hour or so by a cron job (see
 * the cron route); each call only acts inside the three daily windows.
 *
 * Per user:
 *   preferences on? → has a subscription? → load facts (read-only)
 *   → candidates → select (window, dedupe, cap, spacing, priority)
 *   → generate → validate (fallback to the library) → claim (atomic)
 *   → Web Push to each subscription → mark sent/failed, drop dead endpoints
 *
 * Nothing is sent unless it passes every step; "nothing useful to say" is
 * the common, correct outcome.
 */
import type { StrivyFacts } from "../types";
import { PUSH_TITLE, istDay, safeClickUrl, windowAt, type PushWindow } from "./config";
import {
  deterministicGenerator,
  rankedMessages,
  type GenerateContext,
  type PushMessage,
  type PushMessageGenerator,
} from "./messages";
import {
  pushCandidates,
  selectPush,
  type PushCandidate,
  type PushPreferences,
  type SentRecord,
} from "./planner";
import { categorizeStoreError, type PushErrorCategory } from "./diagnostics";
import type { PushSender } from "./sender";
import type { PushStore, PushSubscriptionRecord } from "./store";
import { validatePushMessage } from "./validate";

export interface UserRunResult {
  userId: string;
  outcome: "sent" | "skipped" | "failed";
  reason: string | null;
  type?: string;
  body?: string;
  delivered?: number;
  removedSubscriptions?: number;
  /** On "failed": what kind of failure (see diagnostics.ts). */
  category?: PushErrorCategory;
}

export interface RunInput {
  now: Date;
  store: PushStore;
  sender: PushSender;
  /** Loads one user's facts. Must be read-only and scoped to that user. */
  loadFacts: (userId: string) => Promise<StrivyFacts>;
  generator?: PushMessageGenerator;
  /** Limit the run to these users (dev tools, tests). Default: all subscribed. */
  userIds?: string[];
  /** Dev tools only: pretend it's this window. */
  forceWindow?: PushWindow;
}

async function pickMessage(
  candidate: PushCandidate,
  ctx: GenerateContext,
  generator: PushMessageGenerator
): Promise<PushMessage | null> {
  try {
    const generated = await generator.generate(candidate, ctx);
    if (generated && validatePushMessage(generated, candidate).length === 0) return generated;
  } catch {
    // Fall back to the library below.
  }
  if (generator === deterministicGenerator) {
    return (
      rankedMessages(candidate, ctx).find((m) => validatePushMessage(m, candidate).length === 0) ??
      null
    );
  }
  return pickMessage(candidate, ctx, deterministicGenerator);
}

/** What the scheduler would do for one user right now, before claiming or sending. */
export interface PushPlan {
  userId: string;
  /** "ready": a message is chosen; "skipped": see reason. */
  outcome: "ready" | "skipped";
  reason: string | null;
  window: PushWindow | null;
  localDate: string;
  subscriptions: number;
  candidates: { type: string; dedupeKey: string; alreadySent: boolean }[];
  selected: PushCandidate | null;
  message: PushMessage | null;
  today: SentRecord[];
}

/**
 * Plans one user's push: every check up to and including the message, with
 * no side effects. runForUser acts on it; the dev tools show it.
 */
export async function planForUser(userId: string, input: RunInput): Promise<PushPlan> {
  return (await buildPlan(userId, input)).plan;
}

interface BuiltPlan {
  plan: PushPlan;
  prefs?: PushPreferences;
  subs?: PushSubscriptionRecord[];
}

async function buildPlan(userId: string, input: RunInput): Promise<BuiltPlan> {
  const { now, store } = input;
  const localDate = istDay(now);
  const plan: PushPlan = {
    userId,
    outcome: "skipped",
    reason: null,
    window: null,
    localDate,
    subscriptions: 0,
    candidates: [],
    selected: null,
    message: null,
    today: [],
  };
  const prefs = await store.getPreferences(userId);
  const skip = (reason: string): BuiltPlan => ({ plan: { ...plan, reason }, prefs });
  if (!prefs.enabled) return skip("notifications disabled");

  const subs = await store.listSubscriptions(userId);
  plan.subscriptions = subs.length;
  if (subs.length === 0) return skip("no push subscription");

  const window = input.forceWindow ?? windowAt(now);
  plan.window = window;
  if (!window) return skip("outside the push windows");

  const today = await store.historyForDay(userId, localDate);
  plan.today = today;
  const facts = await input.loadFacts(userId);
  const candidates = pushCandidates(facts, userId, now);
  const sentKeys = await store.sentKeys(
    userId,
    candidates.map((c) => c.dedupeKey)
  );
  plan.candidates = candidates.map((c) => ({
    type: c.type,
    dedupeKey: c.dedupeKey,
    alreadySent: sentKeys.has(c.dedupeKey),
  }));

  const choice = selectPush({ candidates, window, today, sentKeys, prefs, now });
  if (!choice.candidate) return skip(choice.reason);
  plan.selected = choice.candidate;

  const weekAgo = istDay(new Date(now.getTime() - 6 * 86_400_000));
  const recent = await store.recentLog(userId, weekAgo);
  const message = await pickMessage(
    choice.candidate,
    {
      seed: `${userId}|${localDate}`,
      title: PUSH_TITLE,
      avoidBodies: new Set(today.map((r) => r.body)),
      usedTones: today.filter((r) => r.status !== "failed").map((r) => r.tone),
      recentBodies: new Set(recent.map((r) => r.body)),
      lang: prefs.language,
    },
    input.generator ?? deterministicGenerator
  );
  if (!message) return skip("no valid message");
  return { plan: { ...plan, outcome: "ready", message }, prefs, subs };
}

export async function runForUser(userId: string, input: RunInput): Promise<UserRunResult> {
  const { store, sender } = input;
  const skip = (reason: string): UserRunResult => ({ userId, outcome: "skipped", reason });

  const { plan, prefs, subs } = await buildPlan(userId, input);
  if (
    plan.outcome !== "ready" ||
    !plan.selected ||
    !plan.message ||
    !plan.window ||
    !prefs ||
    !subs
  ) {
    return skip(plan.reason ?? "nothing useful to say");
  }
  const candidate = plan.selected;
  const message = plan.message;
  const window = plan.window;
  const localDate = plan.localDate;

  const url = safeClickUrl(candidate.url);
  const claim = await store.claim({
    userId,
    dedupeKey: candidate.dedupeKey,
    pushType: candidate.type,
    entityId: candidate.entityId,
    localDate,
    window,
    tone: message.tone,
    title: message.title,
    body: message.body,
    url,
    maxPerDay: prefs.maxPerDay,
    minSpacingMinutes: prefs.minSpacingMinutes,
  });
  if (!claim.ok) return skip(claim.reason);

  let delivered = 0;
  let removed = 0;
  let lastError = "";
  let lastCategory: PushErrorCategory | undefined;
  for (const sub of subs) {
    const result = await sender.send(sub, {
      title: message.title,
      body: message.body,
      url,
      tag: candidate.dedupeKey,
    });
    if (result.ok) {
      delivered++;
    } else {
      lastError = result.error;
      lastCategory = result.category ?? "send_failed";
      if (result.gone) {
        await store.deleteSubscription(userId, sub.id);
        removed++;
      }
    }
  }

  await store.markResult(
    userId,
    claim.id,
    delivered > 0 ? "sent" : "failed",
    delivered > 0 ? undefined : lastError
  );
  return {
    userId,
    outcome: delivered > 0 ? "sent" : "failed",
    reason: delivered > 0 ? null : lastError || "no delivery",
    type: candidate.type,
    body: message.body,
    delivered,
    removedSubscriptions: removed,
    ...(delivered > 0 ? {} : { category: lastCategory ?? "send_failed" }),
  };
}

/** Runs every subscribed user (or `userIds`), one at a time. */
export async function runPushWindow(input: RunInput): Promise<UserRunResult[]> {
  const users = input.userIds ?? (await input.store.listSubscribedUsers());
  const results: UserRunResult[] = [];
  for (const userId of users) {
    try {
      results.push(await runForUser(userId, input));
    } catch (err) {
      results.push({
        userId,
        outcome: "failed",
        reason: err instanceof Error ? err.message : "error",
        category: categorizeStoreError(err).category,
      });
    }
  }
  return results;
}
