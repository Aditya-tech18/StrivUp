/**
 * src/lib/data/businessMetrics.ts
 *
 * The four headline numbers on the business dashboard, computed from live
 * rows rather than read off business_profiles.
 *
 * business_profiles carries total_customers, total_challenges,
 * total_participants and rating, but nothing in the database maintains them:
 * every business currently reads 0 regardless of its actual activity. These
 * are derived on read instead, so the tiles cannot drift from the truth.
 *
 * Definitions, as the owner specified them:
 *
 *   Orders       completed order verifications. "completed" is the end of the
 *                two-sided handshake: the business confirmed the order code,
 *                then the participant typed back the bill code. Anything
 *                short of that is not an order.
 *   Customers    the distinct people behind those orders who ALSO have at
 *                least one approved task submission in the same quest. A
 *                verified order alone is a transaction; a verified order plus
 *                real work in that quest is a customer.
 *   Challenges   challenges this business owns.
 *   Participants everyone who has ever joined one of them. All time, and no
 *                status filter: someone who joined and later dropped out
 *                still joined.
 *
 * A business owns a challenge through creator_id, which references
 * profiles.id, and business_profiles.id is itself the owner's profile id, so
 * the pair (creator_id = business id, creator_type = 'business') identifies
 * them with no extra column.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface BusinessMetrics {
  customers: number;
  challenges: number;
  participants: number;
  orders: number;
}

export const EMPTY_BUSINESS_METRICS: BusinessMetrics = {
  customers: 0, challenges: 0, participants: 0, orders: 0,
};

/** Challenge ids owned by this business. */
export async function getBusinessChallengeIds(
  supabase: SupabaseClient,
  businessId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select("id")
    .eq("creator_id", businessId)
    .eq("creator_type", "business");

  if (error) { console.error("[getBusinessChallengeIds]", error.message); return []; }
  return (data ?? []).map((r) => (r as { id: string }).id);
}

export async function getBusinessMetrics(
  supabase: SupabaseClient,
  businessId: string,
  questIds: string[]
): Promise<BusinessMetrics> {
  const challengeIds = await getBusinessChallengeIds(supabase, businessId);

  /* Participants: every join across those challenges, ever. head+exact asks
     Postgres for the count without shipping the rows. */
  const participantsP = challengeIds.length === 0
    ? Promise.resolve({ count: 0, error: null })
    : supabase
        .from("challenge_participants")
        .select("id", { count: "exact", head: true })
        .in("challenge_id", challengeIds);

  /* Orders and customers both come from the completed verifications, so read
     them once. user_id is needed for the customer intersection below, which
     rules out a head-only count here. */
  const ordersP = questIds.length === 0
    ? Promise.resolve({ data: [], error: null })
    : supabase
        .from("quest_order_verifications")
        .select("user_id,quest_id")
        .in("quest_id", questIds)
        .eq("status", "completed");

  /* Approved task submissions on those quests. Intersected with the orders
     in JS rather than through an RPC, because adding a database function
     here would mean a migration for a number two joins can answer. */
  const approvedP = questIds.length === 0
    ? Promise.resolve({ data: [], error: null })
    : supabase
        .from("quest_task_submissions")
        .select("user_id,quest_id")
        .in("quest_id", questIds)
        .eq("verification_status", "approved");

  const [participants, orders, approved] = await Promise.all([participantsP, ordersP, approvedP]);

  if (participants.error) console.error("[getBusinessMetrics] participants", participants.error.message);
  if (orders.error) console.error("[getBusinessMetrics] orders", orders.error.message);
  if (approved.error) console.error("[getBusinessMetrics] approved", approved.error.message);

  type Row = { user_id: string; quest_id: string };
  const orderRows = (orders.data ?? []) as Row[];
  const approvedRows = (approved.data ?? []) as Row[];

  /* Keyed per user AND quest, because the rule is "a task done in that
     quest" — an approved task on quest A does not make an order on quest B
     a customer. */
  const didWorkHere = new Set(approvedRows.map((r) => `${r.user_id}:${r.quest_id}`));
  const customers = new Set(
    orderRows
      .filter((r) => didWorkHere.has(`${r.user_id}:${r.quest_id}`))
      .map((r) => r.user_id)
  );

  return {
    customers: customers.size,
    challenges: challengeIds.length,
    participants: participants.count ?? 0,
    orders: orderRows.length,
  };
}
