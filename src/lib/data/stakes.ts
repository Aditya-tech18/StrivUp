/**
 * src/lib/data/stakes.ts — daily stake settlement.
 *
 * Both functions here are SECURITY DEFINER in Postgres with EXECUTE revoked
 * from anon and authenticated, so they are reachable only with the service
 * role. That is deliberate: burning and minting coins must never be something
 * a browser can ask for, however the request is shaped.
 *
 * The rules themselves live in the database, not here — see the contract at
 * the top of supabase/migrations/20261021_challenge_stakes.sql. This file only
 * calls them and reports what happened.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface StakeSettlement {
  date: string;
  coins_burned: number;
  users_charged: number;
}

/**
 * Settle one day's missed stakes. Defaults to yesterday in IST.
 *
 * Idempotent per (challenge, date) through the ledger's unique
 * (user_id, reason, dedupe_key) index, so running it twice is harmless.
 */
export async function settleChallengeStakes(date?: string): Promise<StakeSettlement> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settle_challenge_stakes", {
    p_date: date ?? null,
  });

  /* AGENTS.md: check the error on every write whose result is reported back.
     A silent failure here would look exactly like "nobody missed a day". */
  if (error) throw new Error(`stake settlement failed: ${error.message}`);

  const result = (data ?? {}) as Partial<StakeSettlement>;
  return {
    date: result.date ?? "",
    coins_burned: result.coins_burned ?? 0,
    users_charged: result.users_charged ?? 0,
  };
}

/**
 * Mint the completion bonus for one participant of a staked challenge.
 *
 * Returns the coins awarded, or 0 when the challenge has no stake, has no
 * fixed length, the 80% proved floor was not met, or the bonus was already
 * paid. All four are ordinary outcomes, not errors.
 */
export async function awardStakeCompletionBonus(
  userId: string,
  challengeId: string
): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("award_stake_completion_bonus", {
    p_user_id: userId,
    p_challenge_id: challengeId,
  });

  if (error) throw new Error(`stake bonus failed: ${error.message}`);
  return (data as number | null) ?? 0;
}
