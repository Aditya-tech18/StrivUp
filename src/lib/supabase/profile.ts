/**
 * src/lib/supabase/profile.ts
 * 
 * FAULT-TOLERANT: works whether or not the 20260909 migration has been run.
 * Extended columns (is_deactivated, is_private, gender, pinned_challenge_ids)
 * are fetched in a separate query that silently falls back to defaults on error.
 */
import { createClient } from "@/lib/supabase/client";

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  account_type: string;
  verification_status: string;
  profile_completed: boolean;
  is_deactivated: boolean;
  is_private: boolean;
  gender: string | null;
  pinned_challenge_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ProfilePrivate {
  id: string;
  age: number | null;
  email: string | null;
  phone: string | null;
  phone_verified: boolean;
  gender: string | null;
}

export interface Interest { id: number; name: string; slug: string; }

export type SocialPlatform =
  | "instagram" | "linkedin" | "github" | "twitter"
  | "youtube" | "portfolio" | "other";

export interface SocialLink {
  id: string;
  user_id: string;
  platform: SocialPlatform;
  url: string;
}

export interface FollowerUser {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  verification_status: string;
}

const MIN_INTERESTS = 3;
const MAX_SOCIAL_LINKS = 4;

// Safely coerce a raw DB row into the Profile shape
function toProfile(raw: Record<string, unknown>): Profile {
  return {
    id:                   String(raw.id ?? ""),
    username:             (raw.username as string) ?? null,
    full_name:            (raw.full_name as string) ?? null,
    avatar_url:           (raw.avatar_url as string) ?? null,
    bio:                  (raw.bio as string) ?? null,
    account_type:         (raw.account_type as string) ?? "user",
    verification_status:  (raw.verification_status as string) ?? "none",
    profile_completed:    Boolean(raw.profile_completed),
    is_deactivated:       Boolean(raw.is_deactivated ?? false),
    is_private:           Boolean(raw.is_private ?? false),
    gender:               (raw.gender as string) ?? null,
    pinned_challenge_ids: Array.isArray(raw.pinned_challenge_ids)
      ? (raw.pinned_challenge_ids as string[])
      : [],
    created_at:           (raw.created_at as string) ?? new Date().toISOString(),
    updated_at:           (raw.updated_at as string) ?? new Date().toISOString(),
  };
}

// ── Public profile ─────────────────────────────────────────────────────────

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Always-safe base columns
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,username,full_name,avatar_url,bio,account_type," +
      "verification_status,profile_completed,created_at,updated_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const profile = toProfile(data as Record<string, unknown>);

  // Extended columns — only available after migration; fail silently
  try {
    const { data: ext } = await supabase
      .from("profiles")
      .select("is_deactivated,is_private,gender,pinned_challenge_ids")
      .eq("id", user.id)
      .maybeSingle();

    if (ext) {
      profile.is_deactivated       = Boolean((ext as any).is_deactivated ?? false);
      profile.is_private            = Boolean((ext as any).is_private ?? false);
      profile.gender                = ((ext as any).gender as string) ?? null;
      profile.pinned_challenge_ids  = Array.isArray((ext as any).pinned_challenge_ids)
        ? ((ext as any).pinned_challenge_ids as string[])
        : [];
    }
  } catch {
    // Migration not run yet — defaults already set in toProfile()
  }

  return profile;
}

export async function upsertMyProfile(
  fields: Partial<Pick<
    Profile,
    | "full_name" | "bio" | "username" | "avatar_url"
    | "profile_completed" | "gender" | "pinned_challenge_ids"
    | "is_private" | "is_deactivated"
  >>
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Separate base fields from extended (migration-dependent) fields
  const base: Record<string, unknown> = {
    id: user.id,
    updated_at: new Date().toISOString(),
  };
  const ext: Record<string, unknown> = {};

  if (fields.full_name         !== undefined) base.full_name         = fields.full_name;
  if (fields.bio               !== undefined) base.bio               = fields.bio;
  if (fields.username          !== undefined) base.username          = fields.username;
  if (fields.avatar_url        !== undefined) base.avatar_url        = fields.avatar_url;
  if (fields.profile_completed !== undefined) base.profile_completed = fields.profile_completed;

  if (fields.gender               !== undefined) ext.gender               = fields.gender;
  if (fields.pinned_challenge_ids !== undefined) ext.pinned_challenge_ids = fields.pinned_challenge_ids;
  if (fields.is_private           !== undefined) ext.is_private           = fields.is_private;
  if (fields.is_deactivated       !== undefined) ext.is_deactivated       = fields.is_deactivated;

  const hasExt = Object.keys(ext).length > 0;

  if (hasExt) {
    // Try full update first
    const { error } = await supabase
      .from("profiles")
      .upsert({ ...base, ...ext });

    if (!error) return;
    // Extended cols don't exist yet — fall back to base-only update
  }

  const { error: baseErr } = await supabase
    .from("profiles")
    .upsert(base);

  if (baseErr) throw baseErr;
}

// ── Private profile ────────────────────────────────────────────────────────

export async function getMyProfilePrivate(): Promise<ProfilePrivate | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Try with gender col first
  try {
    const { data, error } = await supabase
      .from("profile_private")
      .select("id,age,email,phone,phone_verified,gender")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return data as ProfilePrivate;
  } catch {
    // gender col not yet added — try without
    try {
      const { data } = await supabase
        .from("profile_private")
        .select("id,age,email,phone,phone_verified")
        .eq("id", user.id)
        .maybeSingle();
      if (!data) return null;
      return { ...(data as any), gender: null } as ProfilePrivate;
    } catch {
      return null;
    }
  }
}

export async function upsertMyProfilePrivate(
  fields: Partial<Pick<ProfilePrivate, "age" | "email" | "phone" | "phone_verified" | "gender">>
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const payload: Record<string, unknown> = { id: user.id };
  if (fields.age            !== undefined) payload.age            = fields.age;
  if (fields.email          !== undefined) payload.email          = fields.email;
  if (fields.phone          !== undefined) payload.phone          = fields.phone;
  if (fields.phone_verified !== undefined) payload.phone_verified = fields.phone_verified;

  if (fields.gender !== undefined) {
    try {
      const { error } = await supabase
        .from("profile_private")
        .upsert({ ...payload, gender: fields.gender });
      if (!error) return;
    } catch {
      // gender col not ready
    }
  }

  const { error } = await supabase.from("profile_private").upsert(payload);
  if (error) throw error;
}

// ── Interests ──────────────────────────────────────────────────────────────

export async function getAllInterests(): Promise<Interest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("interests")
    .select("id,name,slug")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Interest[];
}

export async function getMyInterestIds(): Promise<number[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_interests")
    .select("interest_id")
    .eq("user_id", user.id);
  if (error) throw error;
  return (data ?? []).map(r => r.interest_id as number);
}

export async function setMyInterests(ids: number[]): Promise<void> {
  if (ids.length < MIN_INTERESTS)
    throw new Error(`Select at least ${MIN_INTERESTS} interests`);
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error: del } = await supabase
    .from("user_interests")
    .delete()
    .eq("user_id", user.id);
  if (del) throw del;

  if (ids.length > 0) {
    const { error: ins } = await supabase
      .from("user_interests")
      .insert(ids.map(interest_id => ({ user_id: user.id, interest_id })));
    if (ins) throw ins;
  }
}

// ── Social links ───────────────────────────────────────────────────────────

export async function getMySocialLinks(): Promise<SocialLink[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  try {
    const { data, error } = await supabase
      .from("profile_social_links")
      .select("id,user_id,platform,url")
      .eq("user_id", user.id)
      .order("created_at");
    if (error) throw error;
    return (data ?? []) as SocialLink[];
  } catch {
    return [];
  }
}

export async function addMySocialLink(
  platform: SocialPlatform,
  url: string
): Promise<SocialLink> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("profile_social_links")
    .insert({ user_id: user.id, platform, url })
    .select("id,user_id,platform,url")
    .single();
  if (error) throw error;
  return data as SocialLink;
}

export async function deleteMySocialLink(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("profile_social_links")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── Followers ──────────────────────────────────────────────────────────────

export async function getFollowerCount(userId: string): Promise<number> {
  const supabase = createClient();
  try {
    const { count, error } = await supabase
      .from("followers")
      .select("*", { count: "exact", head: true })
      .eq("followed_id", userId);
    if (error) throw error;
    return count ?? 0;
  } catch { return 0; }
}

export async function getFollowingCount(userId: string): Promise<number> {
  const supabase = createClient();
  try {
    const { count, error } = await supabase
      .from("followers")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId);
    if (error) throw error;
    return count ?? 0;
  } catch { return 0; }
}

export async function getFollowers(
  userId: string,
  page = 0,
  pageSize = 20
): Promise<FollowerUser[]> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("followers")
      .select("profiles!follower_id(id,username,full_name,avatar_url,verification_status)")
      .eq("followed_id", userId)
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    return (data ?? [])
      .map((r: any) => r.profiles)
      .filter(Boolean) as FollowerUser[];
  } catch { return []; }
}

export async function getFollowing(
  userId: string,
  page = 0,
  pageSize = 20
): Promise<FollowerUser[]> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("followers")
      .select("profiles!followed_id(id,username,full_name,avatar_url,verification_status)")
      .eq("follower_id", userId)
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    return (data ?? [])
      .map((r: any) => r.profiles)
      .filter(Boolean) as FollowerUser[];
  } catch { return []; }
}

// ── Avatar upload ──────────────────────────────────────────────────────────

export async function uploadMyAvatar(file: File): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Only JPEG, PNG or WebP images are allowed");

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/avatar.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${pub.publicUrl}?t=${Date.now()}`;
  await upsertMyProfile({ avatar_url: url });
  return url;
}

export async function removeMyAvatar(): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: files } = await supabase.storage.from("avatars").list(user.id);
  if (files?.length) {
    await supabase.storage
      .from("avatars")
      .remove(files.map(f => `${user.id}/${f.name}`));
  }
  await upsertMyProfile({ avatar_url: null });
}

// ── Account management ─────────────────────────────────────────────────────

export async function deactivateMyAccount(): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  try {
    await supabase
      .from("profiles")
      .update({ is_deactivated: true, updated_at: new Date().toISOString() })
      .eq("id", user.id);
  } catch {
    // Column may not exist yet — sign out anyway
  }
  await supabase.auth.signOut();
}

export async function deleteMyAccount(): Promise<void> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to delete account. Please contact support.");
  }
  await supabase.auth.signOut();
}

export const PROFILE_CONSTANTS = { MIN_INTERESTS, MAX_SOCIAL_LINKS };
