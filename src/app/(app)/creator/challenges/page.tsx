/**
 * /creator/challenges — "My Challenges": challenges the current user created,
 * with participation metrics. Views are not tracked for challenges, so only
 * measured numbers are shown.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MyChallengesClient, type CreatedChallenge } from "./MyChallengesClient";

export const dynamic = "force-dynamic";

export default async function MyChallengesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/creator/challenges");

  const { data: rows } = await supabase
    .from("challenges")
    .select("id,title,category,duration_days,visibility,thumbnail_url,created_at,featured")
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false });

  const challenges: CreatedChallenge[] = await Promise.all(
    (rows ?? []).map(async (c) => {
      const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then(r => r.count ?? 0);
      const [members, active, completed, pendingProofs] = await Promise.all([
        count(supabase.from("challenge_participants").select("id", { count: "exact", head: true }).eq("challenge_id", c.id)),
        count(supabase.from("challenge_participants").select("id", { count: "exact", head: true }).eq("challenge_id", c.id).eq("status", "active")),
        count(supabase.from("challenge_participants").select("id", { count: "exact", head: true }).eq("challenge_id", c.id).eq("status", "completed")),
        count(supabase.from("proof_submissions").select("id", { count: "exact", head: true }).eq("challenge_id", c.id).eq("verification_status", "pending")),
      ]);
      return {
        id: c.id as string,
        title: c.title as string,
        category: (c.category as string | null) ?? null,
        durationDays: (c.duration_days as number | null) ?? null,
        visibility: (c.visibility as string) === "private" ? "private" : "public",
        thumbnailUrl: (c.thumbnail_url as string | null) ?? null,
        createdAt: c.created_at as string,
        featured: !!c.featured,
        members,
        active,
        completed,
        pendingProofs,
      };
    })
  );

  return <MyChallengesClient challenges={challenges} />;
}
