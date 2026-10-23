/**
 * src/lib/data/discover.ts
 *
 * What to put on the home screen of somebody who has joined nothing.
 *
 * A new account has no activity, so the slot that normally holds "what you
 * are doing" is empty. Rather than leave a hole, it holds what everyone else
 * is doing: the busiest things currently running, challenges and quests
 * together, most participants first. Popularity is the only signal available
 * before someone has told us anything about themselves, and it is a fair one.
 *
 * Quests keep a participant_count column. Challenges do not, so their joins
 * are tallied from challenge_participants in one query for the whole page
 * rather than one query per challenge.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface DiscoverItem {
  id: string;
  kind: "challenge" | "quest";
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  participants: number;
  /** Newest first within the same popularity, and used by the "new" filter. */
  createdAt: string;
}

const CANDIDATE_LIMIT = 40;

export async function getPopularOngoing(
  supabase: SupabaseClient,
  limit = 8
): Promise<DiscoverItem[]> {
  const [questRes, challengeRes] = await Promise.all([
    supabase
      .from("quests")
      .select("id,title,description,cover_url,thumbnail_url,participant_count,created_at")
      .eq("quest_status", "active")
      .eq("visibility", "public")
      .order("participant_count", { ascending: false })
      .limit(CANDIDATE_LIMIT),
    supabase
      .from("challenges")
      .select("id,title,description,thumbnail_url,created_at")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_LIMIT),
  ]);

  if (questRes.error) console.error("[getPopularOngoing] quests", questRes.error.message);
  if (challengeRes.error) console.error("[getPopularOngoing] challenges", challengeRes.error.message);

  const challengeRows = (challengeRes.data ?? []) as {
    id: string; title: string; description: string | null;
    thumbnail_url: string | null; created_at: string;
  }[];

  /* One read for every join across every candidate challenge. Asking for a
     count per challenge would be N round trips on the first screen a new
     person ever sees. */
  const counts = new Map<string, number>();
  if (challengeRows.length > 0) {
    const { data, error } = await supabase
      .from("challenge_participants")
      .select("challenge_id")
      .in("challenge_id", challengeRows.map((c) => c.id));
    if (error) console.error("[getPopularOngoing] participants", error.message);
    for (const row of (data ?? []) as { challenge_id: string }[]) {
      counts.set(row.challenge_id, (counts.get(row.challenge_id) ?? 0) + 1);
    }
  }

  const items: DiscoverItem[] = [
    ...((questRes.data ?? []) as {
      id: string; title: string; description: string | null;
      cover_url: string | null; thumbnail_url: string | null;
      participant_count: number | null; created_at: string;
    }[]).map((q) => ({
      id: q.id,
      kind: "quest" as const,
      title: q.title,
      subtitle: q.description,
      imageUrl: q.cover_url ?? q.thumbnail_url,
      participants: q.participant_count ?? 0,
      createdAt: q.created_at,
    })),
    ...challengeRows.map((c) => ({
      id: c.id,
      kind: "challenge" as const,
      title: c.title,
      subtitle: c.description,
      imageUrl: c.thumbnail_url,
      participants: counts.get(c.id) ?? 0,
      createdAt: c.created_at,
    })),
  ];

  /* Busiest first, as asked. Ties break on newest, so a shelf of brand new
     things with nobody in them yet does not sort at random. */
  items.sort((a, b) =>
    b.participants - a.participants ||
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return items.slice(0, limit);
}
