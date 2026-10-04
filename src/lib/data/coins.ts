/**
 * src/lib/data/coins.ts — StrivCoin reads and the daily check-in.
 *
 * StrivCoin is a loyalty point, not money: earned only, never purchased, never
 * cashable, never transferable, and spendable only on things that cost StrivUp
 * nothing. That keeps it out of RBI Prepaid Payment Instrument territory and
 * off the balance sheet as a liability. The full contract is documented at the
 * top of supabase/migrations/20260928_strivcoin.sql — read it before changing
 * anything here.
 *
 * There is deliberately no `spend` or `award` helper in this module. Every
 * credit is written by a Postgres trigger or a SECURITY DEFINER function; the
 * ledger has no INSERT policy, so a client holding the anon key cannot mint
 * coins even if it tries.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CoinState {
  balance: number;
  /** Coins credited by this page load's check-in — 0 on every visit after the
   *  first of the day. Drives the "+1 today" flourish. */
  earnedToday: number;
}

/**
 * Claim the daily check-in and return the resulting balance.
 *
 * The check-in dedupes on the IST calendar date inside Postgres, so calling
 * this on every feed load is safe: it credits once per day no matter how many
 * times the page is opened, refreshed, or loaded on a second device.
 *
 * Never throws — a coin balance must not be able to take the home feed down.
 */
export async function getCoinStateWithCheckin(
  supabase: SupabaseClient,
  userId: string
): Promise<CoinState> {
  let earnedToday = 0;

  const { data: claimed, error: claimError } = await supabase.rpc("claim_daily_checkin");
  if (claimError) {
    console.error("[coins] daily check-in", claimError.message);
  } else {
    earnedToday = (claimed as number | null) ?? 0;
  }

  const { data: balance, error: balError } = await supabase.rpc("striv_coin_balance", {
    p_user_id: userId,
  });
  if (balError) {
    console.error("[coins] balance", balError.message);
    return { balance: 0, earnedToday };
  }

  return { balance: (balance as number | null) ?? 0, earnedToday };
}

/** Read-only balance, for surfaces that must not trigger a check-in. */
export async function getCoinBalance(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await supabase.rpc("striv_coin_balance", { p_user_id: userId });
  if (error) {
    console.error("[coins] balance", error.message);
    return 0;
  }
  return (data as number | null) ?? 0;
}

/** One line of earning history. */
export interface CoinEvent {
  id: string;
  delta: number;
  reason: string;
  createdAt: string;
}

/** Human labels for the ledger's reason vocabulary. */
export const COIN_REASON_LABEL: Record<string, string> = {
  daily_checkin: "Daily check-in",
  proof_approved: "Proof approved",
  challenge_joined: "Joined a challenge",
  challenge_completed: "Completed a challenge",
  quest_joined: "Joined a quest",
  quest_completed: "Completed a quest",
  spend_streak_freeze: "Streak freeze",
  spend_cosmetic: "Profile item",
  spend_challenge_boost: "Challenge boost",
  adjustment: "Adjustment",
};

export async function getCoinHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = 20
): Promise<CoinEvent[]> {
  const { data, error } = await supabase
    .from("striv_coin_ledger")
    .select("id, delta, reason, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as Array<{ id: string; delta: number; reason: string; created_at: string }>).map(
    (row) => ({
      id: row.id,
      delta: row.delta,
      reason: row.reason,
      createdAt: row.created_at,
    })
  );
}

/**
 * The live economy constants.
 *
 * Read from striv_coin_rules() — the same function the award triggers call —
 * so the "how you earn" table can never drift from what actually pays out. If
 * a rate changes in the database, this page changes with it.
 */
export interface CoinRules {
  daily_checkin: number;
  proof_approved: number;
  proof_approved_daily_max: number;
  challenge_joined: number;
  challenge_joined_weekly_max: number;
  challenge_complete_base: number;
  challenge_complete_per_day: number;
  challenge_complete_max: number;
  challenge_min_duration: number;
  challenge_min_consistency: number;
  self_created_multiplier: number;
  quest_joined: number;
  quest_completed: number;
  daily_global_cap: number;
}

export async function getCoinRules(supabase: SupabaseClient): Promise<CoinRules | null> {
  const { data, error } = await supabase.rpc("striv_coin_rules");
  if (error || !data) {
    console.error("[coins] rules", error?.message);
    return null;
  }
  return data as CoinRules;
}

/**
 * What coins can be spent on.
 *
 * Every item is zero cost of goods to StrivUp by design — that is what keeps
 * StrivCoin a loyalty point with no balance-sheet liability rather than a
 * financial product. Real-world quest rewards are funded by the sponsoring
 * business and are claimed on the quest itself, not from here.
 *
 * `available: false` means the redemption path is not built yet. Shown rather
 * than hidden so people know what the balance is FOR, which is the whole point
 * of earning it.
 */
export interface CoinReward {
  id: string;
  name: string;
  description: string;
  cost: number;
  available: boolean;
}

export const COIN_REWARDS: CoinReward[] = [
  {
    id: "streak_freeze",
    name: "Streak freeze",
    description:
      "Miss a day without losing your streak. One freeze covers one missed day.",
    cost: 50,
    available: false,
  },
  {
    id: "profile_frame",
    name: "Profile frame",
    description: "A badge frame on your avatar, visible to everyone who opens your profile.",
    cost: 120,
    available: false,
  },
  {
    id: "challenge_boost",
    name: "Challenge boost",
    description: "Push a challenge you created to the top of Explore for 48 hours.",
    cost: 200,
    available: false,
  },
];
