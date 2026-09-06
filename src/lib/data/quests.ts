/**
 * src/lib/data/quests.ts — server-safe data helpers for quests
 *
 * All functions accept a SupabaseClient so they work in both server
 * components (createClient from @/lib/supabase/server) and browser
 * client components (createClient from @/lib/supabase/client).
 *
 * Schema assumptions:
 *   quests:              id, title, description, category, business_name,
 *                        location_name, latitude, longitude, reward_description,
 *                        proof_type (photo|checkin|none), is_hot, status (active|inactive),
 *                        creator_id, thumbnail_url, created_at
 *   quest_participants:  id, quest_id, user_id, verification_status (pending|approved|rejected),
 *                        completed_at (nullable), joined_at, rejection_reason (nullable),
 *                        proof_type (inherited from quest), media_url (nullable)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/* ── Shared helpers ──────────────────────────────────────────────────────── */

function fallbackThumbnail(seed: string): string {
  return `https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80&seed=${seed}`;
}

/**
 * Haversine distance calculation (km between two lat/lng points)
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface Quest {
  id: string;
  title: string;
  category: string;
  business_name: string;
  location_name: string;
  reward_description: string;
  thumbnail_url: string | null;
  is_hot: boolean;
  status: "active" | "inactive";
  participant_count: number;
}

export interface QuestDetail extends Quest {
  description: string;
  latitude: number;
  longitude: number;
  proof_type: "photo" | "checkin" | "none";
  creator_id: string;
}

export interface QuestParticipant {
  id: string;
  user_id: string;
  verification_status: "pending" | "approved" | "rejected";
  completed_at: string | null;
  joined_at: string;
  rejection_reason: string | null;
  media_url: string | null;
  user_profile: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

/* ── Quests discovery ────────────────────────────────────────────────────── */

/**
 * Hot quests (is_hot = true, status = active) for the horizontal carousel.
 * Limited to 6 items.
 */
export async function getHotQuests(
  supabase: SupabaseClient
): Promise<Quest[]> {
  const { data, error } = await supabase
    .from("quests")
    .select(
      `
      id, title, category, business_name, location_name, reward_description,
      thumbnail_url, is_hot, status,
      quest_participants!quest_id ( user_id )
      `
    )
    .eq("is_hot", true)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(6);

  if (error || !data) {
    if (error) console.error("[getHotQuests]", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    category: row.category as string,
    business_name: row.business_name as string,
    location_name: row.location_name as string,
    reward_description: row.reward_description as string,
    thumbnail_url:
      (row.thumbnail_url as string | null) ?? fallbackThumbnail(row.id as string),
    is_hot: row.is_hot as boolean,
    status: (row.status as "active" | "inactive") ?? "active",
    participant_count: Array.isArray(row.quest_participants)
      ? row.quest_participants.length
      : 0,
  }));
}

/**
 * All active quests, sorted by creation date (newest first).
 * Returns participant count for each.
 */
export async function getTrendingQuests(
  supabase: SupabaseClient
): Promise<Quest[]> {
  const { data, error } = await supabase
    .from("quests")
    .select(
      `
      id, title, category, business_name, location_name, reward_description,
      thumbnail_url, is_hot, status,
      quest_participants!quest_id ( user_id )
      `
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    if (error) console.error("[getTrendingQuests]", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    category: row.category as string,
    business_name: row.business_name as string,
    location_name: row.location_name as string,
    reward_description: row.reward_description as string,
    thumbnail_url:
      (row.thumbnail_url as string | null) ?? fallbackThumbnail(row.id as string),
    is_hot: row.is_hot as boolean,
    status: (row.status as "active" | "inactive") ?? "active",
    participant_count: Array.isArray(row.quest_participants)
      ? row.quest_participants.length
      : 0,
  }));
}

/**
 * Sort quests by distance from user's location using Haversine.
 * Filters to active quests only.
 */
export async function getQuestsByDistance(
  supabase: SupabaseClient,
  userLat: number,
  userLon: number
): Promise<(Quest & { distance: number })[]> {
  const { data, error } = await supabase
    .from("quests")
    .select(
      `
      id, title, category, business_name, location_name, reward_description,
      thumbnail_url, is_hot, status, latitude, longitude,
      quest_participants!quest_id ( user_id )
      `
    )
    .eq("status", "active");

  if (error || !data) {
    if (error) console.error("[getQuestsByDistance]", error.message);
    return [];
  }

  return data
    .map((row) => {
      const distance = haversineDistance(
        userLat,
        userLon,
        (row.latitude as number) ?? 0,
        (row.longitude as number) ?? 0
      );
      return {
        id: row.id as string,
        title: row.title as string,
        category: row.category as string,
        business_name: row.business_name as string,
        location_name: row.location_name as string,
        reward_description: row.reward_description as string,
        thumbnail_url:
          (row.thumbnail_url as string | null) ?? fallbackThumbnail(row.id as string),
        is_hot: row.is_hot as boolean,
        status: (row.status as "active" | "inactive") ?? "active",
        participant_count: Array.isArray(row.quest_participants)
          ? row.quest_participants.length
          : 0,
        distance,
      };
    })
    .sort((a, b) => a.distance - b.distance);
}

/**
 * Get unique categories from all active quests.
 */
export async function getQuestCategories(
  supabase: SupabaseClient
): Promise<string[]> {
  const { data, error } = await supabase
    .from("quests")
    .select("category")
    .eq("status", "active");

  if (error || !data) {
    if (error) console.error("[getQuestCategories]", error.message);
    return [];
  }

  const categories = new Set(data.map((row) => row.category as string));
  return Array.from(categories).sort();
}

/* ── Quest detail page ────────────────────────────────────────────────────– */

/**
 * Fetch a single quest by ID with full details.
 */
export async function getQuestDetail(
  supabase: SupabaseClient,
  id: string
): Promise<QuestDetail | null> {
  const { data, error } = await supabase
    .from("quests")
    .select(
      `
      id, title, description, category, business_name, location_name,
      latitude, longitude, reward_description, proof_type, is_hot, status,
      thumbnail_url, creator_id, created_at,
      quest_participants!quest_id ( user_id )
      `
    )
    .eq("id", id)
    .eq("status", "active")
    .single();

  if (error || !data) {
    if (error) console.error("[getQuestDetail]", error.message);
    return null;
  }

  return {
    id: data.id as string,
    title: data.title as string,
    description: data.description as string,
    category: data.category as string,
    business_name: data.business_name as string,
    location_name: data.location_name as string,
    latitude: data.latitude as number,
    longitude: data.longitude as number,
    reward_description: data.reward_description as string,
    proof_type: (data.proof_type as "photo" | "checkin" | "none") ?? "photo",
    thumbnail_url:
      (data.thumbnail_url as string | null) ?? fallbackThumbnail(data.id as string),
    is_hot: data.is_hot as boolean,
    status: (data.status as "active" | "inactive") ?? "active",
    creator_id: data.creator_id as string,
    participant_count: Array.isArray(data.quest_participants)
      ? data.quest_participants.length
      : 0,
  };
}

/**
 * Check if a user is already a participant in a quest.
 */
export async function isUserQuestParticipant(
  supabase: SupabaseClient,
  questId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("quest_participants")
    .select("id")
    .eq("quest_id", questId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[isUserQuestParticipant]", error.message);
    return false;
  }

  return !!data;
}

/**
 * Get a user's participation record for a quest (if exists).
 */
export async function getUserQuestParticipation(
  supabase: SupabaseClient,
  questId: string,
  userId: string
): Promise<{
  id: string;
  verification_status: "pending" | "approved" | "rejected";
  completed_at: string | null;
  rejection_reason: string | null;
  media_url: string | null;
} | null> {
  const { data, error } = await supabase
    .from("quest_participants")
    .select("id, verification_status, completed_at, rejection_reason, media_url")
    .eq("quest_id", questId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[getUserQuestParticipation]", error.message);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id as string,
    verification_status: (data.verification_status as "pending" | "approved" | "rejected") ?? "pending",
    completed_at: (data.completed_at as string | null) ?? null,
    rejection_reason: (data.rejection_reason as string | null) ?? null,
    media_url: (data.media_url as string | null) ?? null,
  };
}

/* ── Creator review page ────────────────────────────────────────────────── */

/**
 * Get all participants in a quest (for creator review).
 * Includes their proof media and verification status.
 */
export async function getQuestParticipants(
  supabase: SupabaseClient,
  questId: string
): Promise<QuestParticipant[]> {
  const { data, error } = await supabase
    .from("quest_participants")
    .select(
      `
      id, user_id, verification_status, completed_at, joined_at,
      rejection_reason, media_url,
      profiles!user_id ( full_name, avatar_url )
      `
    )
    .eq("quest_id", questId)
    .order("joined_at", { ascending: false });

  if (error || !data) {
    if (error) console.error("[getQuestParticipants]", error.message);
    return [];
  }

  return data.map((row) => {
    const profile = row.profiles as unknown as { full_name: string | null; avatar_url: string | null } | null;
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      verification_status: (row.verification_status as "pending" | "approved" | "rejected") ?? "pending",
      completed_at: (row.completed_at as string | null) ?? null,
      joined_at: row.joined_at as string,
      rejection_reason: (row.rejection_reason as string | null) ?? null,
      media_url: (row.media_url as string | null) ?? null,
      user_profile: {
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      },
    };
  });
}

/**
 * Approve a participant's submission.
 */
export async function approveQuestParticipation(
  supabase: SupabaseClient,
  participationId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("quest_participants")
    .update({
      verification_status: "approved",
      completed_at: new Date().toISOString(),
    })
    .eq("id", participationId);

  if (error) {
    console.error("[approveQuestParticipation]", error.message);
    return false;
  }

  return true;
}

/**
 * Reject a participant's submission with a reason.
 */
export async function rejectQuestParticipation(
  supabase: SupabaseClient,
  participationId: string,
  rejectionReason: string
): Promise<boolean> {
  const { error } = await supabase
    .from("quest_participants")
    .update({
      verification_status: "rejected",
      rejection_reason: rejectionReason.trim(),
    })
    .eq("id", participationId);

  if (error) {
    console.error("[rejectQuestParticipation]", error.message);
    return false;
  }

  return true;
}

/* ── Quest creation ──────────────────────────────────────────────────────– */

export interface CreateQuestInput {
  title: string;
  description: string;
  category: string;
  business_name: string;
  location_name: string;
  latitude: number;
  longitude: number;
  reward_description: string;
  proof_type: "photo" | "checkin" | "none";
  thumbnail_url?: string | null;
}

/**
 * Create a new quest. is_hot and status default to false and 'active'.
 */
export async function createQuest(
  supabase: SupabaseClient,
  creatorId: string,
  input: CreateQuestInput
): Promise<string | null> {
  const { data, error } = await supabase
    .from("quests")
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category.trim(),
      business_name: input.business_name.trim(),
      location_name: input.location_name.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      reward_description: input.reward_description.trim(),
      proof_type: input.proof_type,
      thumbnail_url: input.thumbnail_url ?? null,
      creator_id: creatorId,
      is_hot: false,
      status: "active",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createQuest]", error.message);
    return null;
  }

  return (data?.id as string) ?? null;
}

/* ── Quest joining ───────────────────────────────────────────────────────– */

/**
 * Join a quest (create a quest_participant row).
 * For proof_type = 'none', immediately set completed_at.
 */
export async function joinQuest(
  supabase: SupabaseClient,
  questId: string,
  userId: string,
  proofType: "photo" | "checkin" | "none"
): Promise<string | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("quest_participants")
    .insert({
      quest_id: questId,
      user_id: userId,
      verification_status: proofType === "none" ? "approved" : "pending",
      completed_at: proofType === "none" ? now : null,
      joined_at: now,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Duplicate constraint: user already joined
      return (
        (await getUserQuestParticipation(supabase, questId, userId))?.id ?? null
      );
    }
    console.error("[joinQuest]", error.message);
    return null;
  }

  return (data?.id as string) ?? null;
}

/**
 * Update a quest participant's media_url and set verification_status to 'pending'.
 */
export async function submitQuestProof(
  supabase: SupabaseClient,
  participationId: string,
  mediaUrl: string
): Promise<boolean> {
  const { error } = await supabase
    .from("quest_participants")
    .update({
      media_url: mediaUrl,
      verification_status: "pending",
    })
    .eq("id", participationId);

  if (error) {
    console.error("[submitQuestProof]", error.message);
    return false;
  }

  return true;
}

/**
 * Mark quest as visited (for proof_type = 'checkin').
 * Sets verification_status to 'pending' without media_url.
 */
export async function markQuestVisited(
  supabase: SupabaseClient,
  participationId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("quest_participants")
    .update({
      verification_status: "pending",
    })
    .eq("id", participationId);

  if (error) {
    console.error("[markQuestVisited]", error.message);
    return false;
  }

  return true;
}
