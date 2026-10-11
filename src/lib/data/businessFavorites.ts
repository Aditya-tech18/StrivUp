/**
 * src/lib/data/businessFavorites.ts — follow a business for its future quests.
 *
 * Distinct from saving a single quest: favouriting is about the business, so
 * when they publish anything new the follower is notified by the
 * quests_notify_favorites trigger. Unfavouriting stops that immediately.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function isBusinessFavorited(
  supabase: SupabaseClient,
  userId: string,
  businessId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("business_favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    console.error("[isBusinessFavorited]", error.message);
    return false;
  }
  return Boolean(data);
}

export async function favoriteBusiness(
  supabase: SupabaseClient,
  userId: string,
  businessId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("business_favorites")
    .insert({ user_id: userId, business_id: businessId });

  /* Already favourited is the desired end state, not a failure — two taps in
     quick succession should not surface an error. */
  if (error && !/duplicate|unique/i.test(error.message)) {
    return { error: error.message };
  }
  return { error: null };
}

export async function unfavoriteBusiness(
  supabase: SupabaseClient,
  userId: string,
  businessId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("business_favorites")
    .delete()
    .eq("user_id", userId)
    .eq("business_id", businessId);

  return { error: error?.message ?? null };
}
