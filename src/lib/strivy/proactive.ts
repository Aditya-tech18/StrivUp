/**
 * src/lib/strivy/proactive.ts
 *
 * STRIVY's proactive path, which runs without a chat message:
 *
 *   facts (user-scoped, RLS) → detectEvents → decideCheckIns (grounded
 *   templates + checkEventMessage) → optional notifications (deduped) →
 *   check-ins for the Strivy panel
 *
 * runAccountabilityCheck() is the one entry point. Today it is called by
 * POST /api/strivy/checkin when the signed-in user opens the app (at most once
 * per tab per day, see StrivyLauncher). The same function is what a future
 * scheduler would call per user; STRIVUP has no scheduler yet (pg_cron is not
 * installed), so nothing runs in the background. See the Phase 3 report.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideCheckIns, type CheckIn } from "./accountability";
import { loadFacts, type Need } from "./context";
import { detectEvents } from "./events";
import type { DeliveryResult, StrivyNotifier } from "./notifier";

/** Everything the event detectors read. No names, no knowledge. */
export const CHECKIN_NEEDS: readonly Need[] = [
  "today",
  "challenges",
  "quests",
  "proofs",
  "rewards",
  "week",
];

export interface AccountabilityResult {
  checkIns: CheckIn[];
  delivery: DeliveryResult;
  /** Facts that failed to load; their events were skipped, not guessed. */
  unavailable: string[];
}

export async function runAccountabilityCheck(input: {
  supabase: SupabaseClient;
  userId: string;
  notifier: StrivyNotifier;
  now?: Date;
}): Promise<AccountabilityResult> {
  const now = input.now ?? new Date();
  const facts = await loadFacts(input.supabase, input.userId, CHECKIN_NEEDS);
  const events = detectEvents(facts, input.userId, now);
  const checkIns = decideCheckIns(events);

  const drafts = checkIns.flatMap((c) => (c.notification ? [c.notification] : []));
  const delivery = await input.notifier.deliver(drafts);

  return { checkIns, delivery, unavailable: facts.unavailable };
}
