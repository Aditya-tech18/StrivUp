/**
 * /dev/coins-preview — dev-only visual harness for the StrivCoin wallet.
 *
 * /coins is behind auth, so it could not otherwise be reviewed. 404s in
 * production, like the other /dev routes. Nothing here touches real data.
 */

import { notFound } from "next/navigation";
import { CoinsView } from "@/components/features/CoinsView";
import type { CoinEvent, CoinRules } from "@/lib/data/coins";

/** Mirrors the live defaults in striv_coin_rules(). */
const RULES: CoinRules = {
  daily_checkin: 1,
  proof_approved: 5,
  proof_approved_daily_max: 3,
  challenge_joined: 2,
  challenge_joined_weekly_max: 3,
  challenge_complete_base: 10,
  challenge_complete_per_day: 3,
  challenge_complete_max: 300,
  challenge_min_duration: 7,
  challenge_min_consistency: 0.5,
  self_created_multiplier: 0.25,
  quest_joined: 2,
  quest_completed: 50,
  daily_global_cap: 25,
};

const HISTORY: CoinEvent[] = [
  { id: "1", delta: 1, reason: "daily_checkin", createdAt: new Date().toISOString() },
  { id: "2", delta: 5, reason: "proof_approved", createdAt: new Date().toISOString() },
  { id: "3", delta: 31, reason: "challenge_completed", createdAt: new Date(Date.now() - 864e5).toISOString() },
  { id: "4", delta: 2, reason: "quest_joined", createdAt: new Date(Date.now() - 2 * 864e5).toISOString() },
  { id: "5", delta: -50, reason: "spend_streak_freeze", createdAt: new Date(Date.now() - 3 * 864e5).toISOString() },
];

const REWARDS = [
  {
    id: "streak_freeze",
    name: "Streak freeze",
    description: "Miss a day without losing your streak. One freeze covers one missed day.",
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

export default function CoinsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  // 96 sits between the 50 and 120 price points, so the affordable and
  // unaffordable states both render on one screen.
  return <CoinsView balance={96} rules={RULES} history={HISTORY} rewards={REWARDS} />;
}
