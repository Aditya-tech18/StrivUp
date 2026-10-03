/**
 * app/(app)/coins/page.tsx — the StrivCoin wallet.
 *
 * Fetches; CoinsView renders. The split exists so the screen can be reviewed
 * at /dev/coins-preview without a session, since this route is behind auth.
 *
 * Earning rates come from striv_coin_rules() — the same function the award
 * triggers call — rather than being retyped, so the page cannot quietly drift
 * from the economy it describes.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CoinsView } from "@/components/features/CoinsView";
import {
  getCoinBalance,
  getCoinHistory,
  getCoinRules,
  COIN_REWARDS,
} from "@/lib/data/coins";

export const metadata: Metadata = {
  title: "StrivCoins",
  description: "How you earn StrivCoins and what they unlock.",
};

export default async function CoinsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/coins");

  const [balance, rules, history] = await Promise.all([
    getCoinBalance(supabase, user.id),
    getCoinRules(supabase),
    getCoinHistory(supabase, user.id, 15),
  ]);

  return (
    <CoinsView balance={balance} rules={rules} history={history} rewards={COIN_REWARDS} />
  );
}
