/**
 * src/lib/data/social.ts — people: suggestions, follow graph, moderation.
 *
 * One module because these all read the same two tables (`profiles` and
 * `followers`) and the same handful of rules about who may see whom. Keeping
 * them together is what stops the follower list and the profile sheet
 * disagreeing about whether someone is followed.
 *
 * Server-safe: every function takes a SupabaseClient, per the
 * src/lib/data/* convention.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/* ── Shared shapes ───────────────────────────────────────────────────────── */

export interface PersonCard {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

export interface SuggestedProfile extends PersonCard {
  challengesCompleted: number;
  questsCompleted: number;
  challengesJoined: number;
  questsJoined: number;
  followerCount: number;
  sharedInterests: number;
}

/** A row in a followers / following / likes / participants list. */
export interface PersonRow extends PersonCard {
  /** Whether the signed-in viewer follows this person. */
  isFollowing: boolean;
  /** A follow request the viewer has sent that is still pending. */
  isRequested: boolean;
  /** This row is the viewer. No follow or block controls apply. */
  isSelf: boolean;
}

export function displayName(p: PersonCard): string {
  return p.fullName ?? (p.username ? `@${p.username}` : "StrivUp member");
}

/** Where a person's public profile lives. Username when there is one, so the
 *  URL is shareable; the uuid otherwise, which /u/[handle] also accepts. */
export function profileHref(p: PersonCard): string {
  return `/u/${p.username ?? p.id}`;
}

/* ── Suggestions ─────────────────────────────────────────────────────────── */

export async function getProfileSuggestions(
  supabase: SupabaseClient,
  limit = 12
): Promise<SuggestedProfile[]> {
  const { data, error } = await supabase.rpc("get_profile_suggestions", {
    p_limit: limit,
  });

  if (error || !data) {
    if (error) console.error("[getProfileSuggestions]", error.message);
    return [];
  }

  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    username: (r.username as string | null) ?? null,
    fullName: (r.full_name as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    bio: (r.bio as string | null) ?? null,
    challengesCompleted: Number(r.challenges_completed ?? 0),
    questsCompleted: Number(r.quests_completed ?? 0),
    challengesJoined: Number(r.challenges_joined ?? 0),
    questsJoined: Number(r.quests_joined ?? 0),
    followerCount: Number(r.follower_count ?? 0),
    sharedInterests: Number(r.shared_interests ?? 0),
  }));
}

/**
 * The line under a suggested account, and the reason to tap it.
 *
 * Finished work outranks started work, because finishing is the thing this
 * product is about. A brand-new account has neither, and gets a line that
 * says so plainly rather than a row of zeroes.
 */
export function suggestionBlurb(p: SuggestedProfile): string {
  const done = p.challengesCompleted + p.questsCompleted;
  if (done > 0) {
    const bits: string[] = [];
    if (p.challengesCompleted > 0) {
      bits.push(`${p.challengesCompleted} challenge${p.challengesCompleted === 1 ? "" : "s"}`);
    }
    if (p.questsCompleted > 0) {
      bits.push(`${p.questsCompleted} quest${p.questsCompleted === 1 ? "" : "s"}`);
    }
    return `${bits.join(" and ")} finished`;
  }

  const joined = p.challengesJoined + p.questsJoined;
  if (joined > 0) {
    const bits: string[] = [];
    if (p.challengesJoined > 0) {
      bits.push(`${p.challengesJoined} challenge${p.challengesJoined === 1 ? "" : "s"}`);
    }
    if (p.questsJoined > 0) {
      bits.push(`${p.questsJoined} quest${p.questsJoined === 1 ? "" : "s"}`);
    }
    return `In ${bits.join(" and ")} right now`;
  }

  return "Just getting started";
}

/** The small grey line: why this account was suggested. */
export function suggestionReason(p: SuggestedProfile): string | null {
  // Kept short: this sits on a 160px card under three other lines, and the
  // longer phrasings ("Shares 3 interests with you") clipped mid-word.
  if (p.sharedInterests > 0) {
    return p.sharedInterests === 1
      ? "1 shared interest"
      : `${p.sharedInterests} shared interests`;
  }
  if (p.followerCount > 0) {
    return `${p.followerCount} follower${p.followerCount === 1 ? "" : "s"}`;
  }
  return null;
}

/* ── Follow graph ────────────────────────────────────────────────────────── */

type Direction = "followers" | "following";

/**
 * The people following `userId`, or the people they follow.
 *
 * Two queries, never one per row: the ids come back first, then one `in`
 * lookup for the profiles and one for the viewer's own follow edges. A list
 * of 500 followers costs three round trips, not 501.
 */
export async function getFollowList(
  supabase: SupabaseClient,
  userId: string,
  direction: Direction,
  viewerId: string | null
): Promise<PersonRow[]> {
  const subjectCol = direction === "followers" ? "followed_id" : "follower_id";
  const otherCol = direction === "followers" ? "follower_id" : "followed_id";

  const { data: edges, error } = await supabase
    .from("followers")
    .select(`${otherCol}, created_at, request_status`)
    .eq(subjectCol, userId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !edges || edges.length === 0) {
    if (error) console.error("[getFollowList]", error.message);
    return [];
  }

  // Pending requests are not yet a follow relationship, so they do not belong
  // in either list; the Alerts screen is where those live.
  const ids = (edges as Record<string, unknown>[])
    .filter((e) => (e.request_status ?? "accepted") === "accepted")
    .map((e) => e[otherCol] as string);

  if (ids.length === 0) return [];

  const [{ data: profiles }, { data: myEdges }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio")
      .in("id", ids)
      .neq("is_deactivated", true),
    viewerId
      ? supabase
          .from("followers")
          .select("followed_id, request_status")
          .eq("follower_id", viewerId)
          .in("followed_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const edgeByTarget = new Map(
    ((myEdges ?? []) as Record<string, unknown>[]).map((e) => [
      e.followed_id as string,
      (e.request_status as string | null) ?? "accepted",
    ])
  );

  // Preserve the newest-first order of the follow edges; `in` does not.
  const byId = new Map(
    ((profiles ?? []) as Record<string, unknown>[]).map((p) => [p.id as string, p])
  );

  return ids.flatMap((id) => {
    const p = byId.get(id);
    if (!p) return [];
    const status = edgeByTarget.get(id);
    return [
      {
        id,
        username: (p.username as string | null) ?? null,
        fullName: (p.full_name as string | null) ?? null,
        avatarUrl: (p.avatar_url as string | null) ?? null,
        bio: (p.bio as string | null) ?? null,
        isFollowing: status === "accepted",
        isRequested: status === "pending",
        isSelf: id === viewerId,
      },
    ];
  });
}

/* ── People behind a number ──────────────────────────────────────────────── */

/**
 * Resolve a set of user ids to list rows, with the viewer's follow state.
 *
 * Shared by "who liked this" and "who joined this", which differ only in
 * where the ids come from.
 */
async function hydratePeople(
  supabase: SupabaseClient,
  ids: string[],
  viewerId: string | null
): Promise<PersonRow[]> {
  if (ids.length === 0) return [];

  const [{ data: profiles }, { data: myEdges }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio")
      .in("id", ids)
      .neq("is_deactivated", true),
    viewerId
      ? supabase
          .from("followers")
          .select("followed_id, request_status")
          .eq("follower_id", viewerId)
          .in("followed_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const edgeByTarget = new Map(
    ((myEdges ?? []) as Record<string, unknown>[]).map((e) => [
      e.followed_id as string,
      (e.request_status as string | null) ?? "accepted",
    ])
  );

  const byId = new Map(
    ((profiles ?? []) as Record<string, unknown>[]).map((p) => [p.id as string, p])
  );

  return ids.flatMap((id) => {
    const p = byId.get(id);
    if (!p) return [];
    const status = edgeByTarget.get(id);
    return [
      {
        id,
        username: (p.username as string | null) ?? null,
        fullName: (p.full_name as string | null) ?? null,
        avatarUrl: (p.avatar_url as string | null) ?? null,
        bio: (p.bio as string | null) ?? null,
        isFollowing: status === "accepted",
        isRequested: status === "pending",
        isSelf: id === viewerId,
      },
    ];
  });
}

/** Who liked a post. RLS on proof_likes already gates this by can_see_proof. */
export async function getPostLikers(
  supabase: SupabaseClient,
  proofId: string,
  viewerId: string | null,
  limit = 100
): Promise<PersonRow[]> {
  const { data, error } = await supabase
    .from("proof_likes")
    .select("user_id, created_at")
    .eq("proof_id", proofId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (error) console.error("[getPostLikers]", error.message);
    return [];
  }
  return hydratePeople(
    supabase,
    (data as Record<string, unknown>[]).map((r) => r.user_id as string),
    viewerId
  );
}

export async function getChallengeMembers(
  supabase: SupabaseClient,
  challengeId: string,
  viewerId: string | null,
  limit = 100
): Promise<PersonRow[]> {
  const { data, error } = await supabase
    .from("challenge_participants")
    .select("user_id, joined_at")
    .eq("challenge_id", challengeId)
    .order("joined_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (error) console.error("[getChallengeMembers]", error.message);
    return [];
  }
  return hydratePeople(
    supabase,
    (data as Record<string, unknown>[]).map((r) => r.user_id as string),
    viewerId
  );
}

export async function getQuestMembers(
  supabase: SupabaseClient,
  questId: string,
  viewerId: string | null,
  limit = 100
): Promise<PersonRow[]> {
  const { data, error } = await supabase
    .from("quest_participants")
    .select("user_id, joined_at")
    .eq("quest_id", questId)
    .order("joined_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (error) console.error("[getQuestMembers]", error.message);
    return [];
  }
  return hydratePeople(
    supabase,
    (data as Record<string, unknown>[]).map((r) => r.user_id as string),
    viewerId
  );
}

/* ── Mutations ───────────────────────────────────────────────────────────── */

/** Each returns an error string or null, so callers can revert an optimistic
 *  update on failure rather than reporting a success that did not happen. */

export async function followUser(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string
): Promise<string | null> {
  // request_status is set by a BEFORE INSERT trigger: 'pending' when the
  // target is private, 'accepted' otherwise. It is deliberately not sent.
  const { error } = await supabase
    .from("followers")
    .insert({ follower_id: viewerId, followed_id: targetId });
  if (error && !/duplicate|unique/i.test(error.message)) return error.message;
  return null;
}

export async function unfollowUser(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string
): Promise<string | null> {
  const { error } = await supabase
    .from("followers")
    .delete()
    .eq("follower_id", viewerId)
    .eq("followed_id", targetId);
  return error?.message ?? null;
}

/**
 * Remove someone from your followers.
 *
 * This is their edge, not yours, so the DELETE policy
 * (follower_id = auth.uid()) does not cover it. It goes through
 * remove_follower, which the migration defines as SECURITY DEFINER scoped to
 * rows where the caller is the followed party.
 */
export async function removeFollower(
  supabase: SupabaseClient,
  followerId: string
): Promise<string | null> {
  const { error } = await supabase.rpc("remove_follower", {
    p_follower_id: followerId,
  });
  if (error) return error.message;
  return null;
}

export async function blockUser(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string
): Promise<string | null> {
  // Blocking also severs the follow graph in both directions, which is what
  // someone expects from it; leaving the edges would keep the blocked
  // account in their follower count.
  const { error } = await supabase
    .from("user_blocks")
    .insert({ blocker_id: viewerId, blocked_id: targetId });
  if (error && !/duplicate|unique/i.test(error.message)) return error.message;

  await supabase
    .from("followers")
    .delete()
    .eq("follower_id", viewerId)
    .eq("followed_id", targetId);
  await supabase.rpc("remove_follower", { p_follower_id: targetId });

  return null;
}

export async function unblockUser(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string
): Promise<string | null> {
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", viewerId)
    .eq("blocked_id", targetId);
  return error?.message ?? null;
}

export const REPORT_REASONS = [
  "Spam or scam",
  "Fake proof",
  "Harassment or bullying",
  "Nudity or sexual content",
  "Hate speech",
  "Something else",
] as const;

export async function reportUser(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string,
  reason: string,
  details?: string
): Promise<string | null> {
  const { error } = await supabase.from("user_reports").insert({
    reporter_id: viewerId,
    reported_id: targetId,
    reason,
    details: details?.trim() || null,
  });
  return error?.message ?? null;
}

export async function isBlocked(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", viewerId)
    .eq("blocked_id", targetId)
    .maybeSingle();
  return data !== null;
}

/* ── A person's own posts ────────────────────────────────────────────────── */

export interface MyPostRow {
  id: string;
  challengeId: string;
  challengeTitle: string;
  mediaUrl: string | null;
  caption: string | null;
  submittedAt: string;
  dayNumber: number;
  status: string;
  hiddenCount: number;
}

/**
 * The viewer's own proofs, for the manage-posts grid on their profile.
 *
 * Includes pending and rejected ones, unlike the public feed: these are
 * theirs, and a rejected proof is exactly the kind someone wants to delete.
 * The hide counts come back in one grouped query rather than one per post.
 */
export async function getMyPosts(
  supabase: SupabaseClient,
  userId: string,
  limit = 60
): Promise<MyPostRow[]> {
  const { data, error } = await supabase
    .from("proof_submissions")
    .select("id, challenge_id, media_url, caption, submitted_at, day_number, verification_status, challenges!challenge_id(title)")
    .eq("user_id", userId)
    .eq("admin_removed", false)
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) {
    if (error) console.error("[getMyPosts]", error.message);
    return [];
  }

  const ids = (data as Record<string, unknown>[]).map((r) => r.id as string);

  const { data: hiddenRows } = await supabase
    .from("proof_hidden_from")
    .select("proof_id")
    .in("proof_id", ids);

  const hiddenCounts = new Map<string, number>();
  for (const row of (hiddenRows ?? []) as { proof_id: string }[]) {
    hiddenCounts.set(row.proof_id, (hiddenCounts.get(row.proof_id) ?? 0) + 1);
  }

  return (data as Record<string, unknown>[]).map((r) => {
    const challenge = r.challenges as unknown as { title: string | null } | null;
    return {
      id: r.id as string,
      challengeId: r.challenge_id as string,
      challengeTitle: challenge?.title ?? "Challenge",
      mediaUrl: (r.media_url as string | null) ?? null,
      caption: (r.caption as string | null) ?? null,
      submittedAt: r.submitted_at as string,
      dayNumber: (r.day_number as number | null) ?? 1,
      status: (r.verification_status as string | null) ?? "pending",
      hiddenCount: hiddenCounts.get(r.id as string) ?? 0,
    };
  });
}

/* ── Facepiles ───────────────────────────────────────────────────────────── */

export interface Facepile {
  /** A few people to show as faces. Never the whole list. */
  people: PersonCard[];
  /** The real total, which the faces are a sample of. */
  total: number;
}

type FacepileSource = "proof_likes" | "challenge_participants" | "quest_participants";

const SOURCE_KEY: Record<FacepileSource, string> = {
  proof_likes: "proof_id",
  challenge_participants: "challenge_id",
  quest_participants: "quest_id",
};

/**
 * Faces and totals for a page of entities, in two queries rather than two
 * per entity.
 *
 * A feed of twenty posts, or a home rail of eight challenges, would
 * otherwise be forty round trips for decoration. This pulls every membership
 * row for the whole set at once, counts them in memory, and resolves only
 * the handful of distinct people who actually appear as faces.
 *
 * `perEntity` is how many faces each one needs, not how many rows to read:
 * the totals have to come from the full set or the counts would be wrong.
 */
export async function getFacepiles(
  supabase: SupabaseClient,
  source: FacepileSource,
  entityIds: string[],
  perEntity = 3
): Promise<Map<string, Facepile>> {
  const out = new Map<string, Facepile>();
  if (entityIds.length === 0) return out;

  const key = SOURCE_KEY[source];
  const { data, error } = await supabase
    .from(source)
    .select(`${key}, user_id`)
    .in(key, entityIds);

  if (error || !data) {
    if (error) console.error("[getFacepiles]", source, error.message);
    return out;
  }

  // The select list is built from `key`, so PostgREST's literal-type
  // inference cannot follow it; the shape is known here even though the
  // types are not.
  const rows = data as unknown as Record<string, string>[];

  const byEntity = new Map<string, string[]>();
  for (const r of rows) {
    const list = byEntity.get(r[key]) ?? [];
    list.push(r.user_id);
    byEntity.set(r[key], list);
  }

  // Only the people who will actually be drawn get looked up.
  const faceIds = new Set<string>();
  for (const list of byEntity.values()) {
    for (const id of list.slice(0, perEntity)) faceIds.add(id);
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .in("id", [...faceIds]);

  const byId = new Map(
    ((profiles ?? []) as Record<string, unknown>[]).map((p) => [
      p.id as string,
      {
        id: p.id as string,
        username: (p.username as string | null) ?? null,
        fullName: (p.full_name as string | null) ?? null,
        avatarUrl: (p.avatar_url as string | null) ?? null,
        bio: null,
      } satisfies PersonCard,
    ])
  );

  for (const [entityId, userIds] of byEntity) {
    out.set(entityId, {
      total: userIds.length,
      people: userIds.slice(0, perEntity).flatMap((id) => {
        const person = byId.get(id);
        return person ? [person] : [];
      }),
    });
  }

  return out;
}

/** The single-entity case, for a detail page. */
export async function getFacepile(
  supabase: SupabaseClient,
  source: FacepileSource,
  entityId: string,
  perEntity = 3
): Promise<Facepile> {
  const map = await getFacepiles(supabase, source, [entityId], perEntity);
  return map.get(entityId) ?? { people: [], total: 0 };
}
