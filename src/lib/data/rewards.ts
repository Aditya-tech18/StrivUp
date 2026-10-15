/**
 * src/lib/data/rewards.ts — My Rewards.
 *
 * Every number on this screen is read from reward_allocations under RLS, so
 * a user sees their own rows and nothing else. Nothing here writes: reward
 * amounts, statuses and payouts are decided server-side, and the tables have
 * no insert or update policy for anybody. See
 * supabase/migrations/20261015103000_rewards_rls.sql.
 *
 * The metric definitions below are the load-bearing part of this file. "Paid"
 * in particular means one status and not a family of hopeful ones: a payout
 * that is processing, or that failed, is money the person does not have.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RewardType = "cash" | "coupon" | "badge";

export type RewardStatus =
  | "pending_review" | "approved" | "claim_required" | "processing" | "paid"
  | "failed" | "rejected" | "expired" | "cancelled"
  | "available" | "claimed" | "redeemed" | "revoked";

export interface RewardRow {
  id: string;
  type: RewardType;
  status: RewardStatus;
  amountMinor: number | null;
  currency: string;
  badgeCode: string | null;
  earnedAt: string;
  approvedAt: string | null;
  claimedAt: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  decisionReason: string | null;
  campaignId: string;
  campaignName: string | null;
  /** Whichever of the two the reward came from, resolved to a title. */
  sourceKind: "quest" | "challenge" | null;
  sourceId: string | null;
  sourceTitle: string | null;
  couponDefinitionId: string | null;
  couponTitle: string | null;
  rulesVersionId: string | null;
}

/* ── Status grouping ─────────────────────────────────────────────────────
   The lifecycle has fourteen states and the UI needs four buckets. Keeping
   the mapping here means the summary tiles, the filter chips and the status
   pill can never disagree about what "awaiting" means. */

/** Money the user is owed but does not have yet. */
const CASH_AWAITING: RewardStatus[] = ["approved", "claim_required", "processing"];
/** Money that actually arrived. One status, deliberately. */
const CASH_PAID: RewardStatus[] = ["paid"];
/** A coupon the user can still do something with. */
const COUPON_OPEN: RewardStatus[] = ["available", "approved", "claimed"];
/** Nothing further will happen to these. */
const DEAD: RewardStatus[] = ["rejected", "cancelled", "expired", "revoked", "failed"];

export function isDead(status: RewardStatus): boolean {
  return DEAD.includes(status);
}

export interface RewardSummary {
  /** Every reward still standing: allocated and not rejected, cancelled,
   *  expired or revoked. A failed payout still counts, because the reward
   *  was genuinely earned and is being retried. */
  totalEarned: number;
  /** Cash approved or in flight, in minor units. NOT counted as paid. */
  cashAwaitingMinor: number;
  /** Cash confirmed paid, in minor units. status='paid' only. */
  cashPaidMinor: number;
  /** Coupons the user can still claim or redeem, not expired. */
  couponsOpen: number;
}

export function summarise(rows: RewardRow[]): RewardSummary {
  const now = Date.now();
  const live = (r: RewardRow) =>
    !["rejected", "cancelled", "expired", "revoked"].includes(r.status);

  return {
    totalEarned: rows.filter(live).length,
    cashAwaitingMinor: rows
      .filter((r) => r.type === "cash" && CASH_AWAITING.includes(r.status))
      .reduce((sum, r) => sum + (r.amountMinor ?? 0), 0),
    cashPaidMinor: rows
      .filter((r) => r.type === "cash" && CASH_PAID.includes(r.status))
      .reduce((sum, r) => sum + (r.amountMinor ?? 0), 0),
    couponsOpen: rows.filter(
      (r) =>
        r.type === "coupon" &&
        COUPON_OPEN.includes(r.status) &&
        (r.expiresAt === null || new Date(r.expiresAt).getTime() > now)
    ).length,
  };
}

/* ── Formatting ──────────────────────────────────────────────────────────
   Amounts are stored in paise. Dividing by 100 at the edge, once, is what
   keeps a rupee from ever being a float in the database. */

export function formatMoney(minor: number | null, currency = "INR"): string {
  if (minor === null) return "";
  const major = minor / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: major % 1 === 0 ? 0 : 2,
  }).format(major);
}

/** The human label for a status, and whether it needs the user to act. */
export function statusLabel(status: RewardStatus): string {
  const labels: Record<RewardStatus, string> = {
    pending_review: "Under review",
    approved: "Approved",
    claim_required: "Claim required",
    processing: "Payment processing",
    paid: "Paid",
    failed: "Payment failed",
    rejected: "Not approved",
    expired: "Expired",
    cancelled: "Cancelled",
    available: "Available",
    claimed: "Claimed",
    redeemed: "Redeemed",
    revoked: "Revoked",
  };
  return labels[status] ?? status;
}

/**
 * What a status means for the person holding the reward, in plain words.
 *
 * Written to be accurate rather than encouraging. "Approved" does not say the
 * money is coming shortly, because the payout still has to run; "failed" says
 * the transfer did not go through and that the reward is still theirs. None of
 * these strings promise a date, because nothing in the system guarantees one.
 */
export function statusExplanation(status: RewardStatus): string {
  const copy: Record<RewardStatus, string> = {
    pending_review:
      "This reward is being reviewed. Nothing is owed to you until the review is complete, and the review can decide it does not qualify.",
    approved:
      "This reward has been approved. Payment has not been sent yet and will only be sent after you complete the claim step.",
    claim_required:
      "You need to claim this reward before it can be paid. The claim step asks for the UPI ID you want the money sent to. StrivUp never asks for your UPI PIN, an OTP or your banking password.",
    processing:
      "A transfer has been started for this reward. The money is not in your account yet. If the transfer fails it will show here as failed and the reward stays yours.",
    paid:
      "This reward has been paid. The transfer was confirmed against the payment reference recorded against it.",
    failed:
      "The transfer for this reward did not go through. The reward is still yours. Check that the UPI ID you gave is correct, and the payout can be retried.",
    rejected:
      "This reward was not approved. The reason, where one was recorded, is shown below.",
    expired:
      "This reward passed its expiry date before it was claimed, so it can no longer be claimed.",
    cancelled:
      "This reward was cancelled. Nothing is owed on it.",
    available: "This coupon is yours to use. The code and how to redeem it are shown below.",
    claimed: "You have claimed this coupon. It has not been marked redeemed yet.",
    redeemed: "This coupon has been redeemed and cannot be used again.",
    revoked: "This reward was withdrawn. The reason, where one was recorded, is shown below.",
  };
  return copy[status] ?? "";
}

export type StatusTone = "neutral" | "info" | "action" | "success" | "danger";

export function statusTone(status: RewardStatus): StatusTone {
  if (status === "paid" || status === "redeemed") return "success";
  if (isDead(status)) return "danger";
  if (status === "claim_required" || status === "available") return "action";
  if (status === "processing" || status === "claimed" || status === "approved") return "info";
  return "neutral";
}

/* ── Reads ───────────────────────────────────────────────────────────────── */

const SELECT = `
  id, type, status, amount_minor, currency, badge_code,
  earned_at, approved_at, claimed_at, paid_at, expires_at, decision_reason,
  campaign_id, coupon_definition_id, rules_version_id,
  source_quest_id, source_challenge_id,
  reward_campaigns!campaign_id ( name ),
  quests!source_quest_id ( title ),
  challenges!source_challenge_id ( title ),
  coupon_definitions!coupon_definition_id ( title )
`;

function toRow(r: Record<string, unknown>): RewardRow {
  const campaign = r.reward_campaigns as unknown as { name: string | null } | null;
  const quest = r.quests as unknown as { title: string | null } | null;
  const challenge = r.challenges as unknown as { title: string | null } | null;
  const coupon = r.coupon_definitions as unknown as { title: string | null } | null;

  const sourceKind = r.source_quest_id ? "quest" : r.source_challenge_id ? "challenge" : null;

  return {
    id: r.id as string,
    type: r.type as RewardType,
    status: r.status as RewardStatus,
    amountMinor: (r.amount_minor as number | null) ?? null,
    currency: (r.currency as string) ?? "INR",
    badgeCode: (r.badge_code as string | null) ?? null,
    earnedAt: r.earned_at as string,
    approvedAt: (r.approved_at as string | null) ?? null,
    claimedAt: (r.claimed_at as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
    decisionReason: (r.decision_reason as string | null) ?? null,
    campaignId: r.campaign_id as string,
    campaignName: campaign?.name ?? null,
    sourceKind,
    sourceId: (r.source_quest_id as string | null) ?? (r.source_challenge_id as string | null) ?? null,
    sourceTitle: quest?.title ?? challenge?.title ?? null,
    couponDefinitionId: (r.coupon_definition_id as string | null) ?? null,
    couponTitle: coupon?.title ?? null,
    rulesVersionId: (r.rules_version_id as string | null) ?? null,
  };
}

export async function getMyRewards(
  supabase: SupabaseClient,
  userId: string
): Promise<RewardRow[]> {
  const { data, error } = await supabase
    .from("reward_allocations")
    .select(SELECT)
    .eq("user_id", userId)
    .order("earned_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    if (error) console.error("[getMyRewards]", error.message);
    return [];
  }
  return (data as Record<string, unknown>[]).map(toRow);
}

export async function getRewardById(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<RewardRow | null> {
  const { data, error } = await supabase
    .from("reward_allocations")
    .select(SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[getRewardById]", error.message);
    return null;
  }
  return toRow(data as Record<string, unknown>);
}

/**
 * The status history for one reward, from the timestamps on the row itself.
 *
 * Deliberately not read from reward_audit_events: that table is admin-only
 * and contains reviewer identities and internal reasons. What a user is
 * entitled to see is what happened to their own reward and when.
 */
export interface RewardEvent {
  label: string;
  at: string;
}

export function rewardHistory(r: RewardRow): RewardEvent[] {
  const events: RewardEvent[] = [{ label: "Earned", at: r.earnedAt }];
  if (r.approvedAt) events.push({ label: "Approved", at: r.approvedAt });
  if (r.claimedAt) events.push({ label: "Claimed", at: r.claimedAt });
  if (r.paidAt) events.push({ label: "Paid", at: r.paidAt });
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
