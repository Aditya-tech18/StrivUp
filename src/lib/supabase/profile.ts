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
  id: string; user_id: string; platform: SocialPlatform; url: string;
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

// ── Public profile ─────────────────────────────────────────────────────────

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,full_name,avatar_url,bio,account_type,verification_status,profile_completed,is_deactivated,is_private,gender,pinned_challenge_ids,created_at,updated_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function upsertMyProfile(
  fields: Partial<Pick<Profile, "full_name"|"bio"|"username"|"avatar_url"|"profile_completed"|"gender"|"pinned_challenge_ids"|"is_private"|"is_deactivated">>
): Promise<Profile> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...fields, updated_at: new Date().toISOString() })
    .select("id,username,full_name,avatar_url,bio,account_type,verification_status,profile_completed,is_deactivated,is_private,gender,pinned_challenge_ids,created_at,updated_at")
    .single();
  if (error) throw error;
  return data as Profile;
}

// ── Private profile ────────────────────────────────────────────────────────

export async function getMyProfilePrivate(): Promise<ProfilePrivate | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profile_private")
    .select("id,age,email,phone,phone_verified,gender")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data as ProfilePrivate | null;
}

export async function upsertMyProfilePrivate(
  fields: Partial<Pick<ProfilePrivate, "age"|"email"|"phone"|"phone_verified"|"gender">>
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("profile_private")
    .upsert({ id: user.id, ...fields });
  if (error) throw error;
}

// ── Interests ──────────────────────────────────────────────────────────────

export async function getAllInterests(): Promise<Interest[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("interests").select("id,name,slug").order("name");
  if (error) throw error;
  return data as Interest[];
}

export async function getMyInterestIds(): Promise<number[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from("user_interests").select("interest_id").eq("user_id", user.id);
  if (error) throw error;
  return (data ?? []).map(r => r.interest_id as number);
}

export async function setMyInterests(interestIds: number[]): Promise<void> {
  if (interestIds.length < MIN_INTERESTS) throw new Error(`Select at least ${MIN_INTERESTS} interests`);
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error: del } = await supabase.from("user_interests").delete().eq("user_id", user.id);
  if (del) throw del;
  if (interestIds.length > 0) {
    const { error: ins } = await supabase.from("user_interests").insert(interestIds.map(interest_id => ({ user_id: user.id, interest_id })));
    if (ins) throw ins;
  }
}

// ── Social links ───────────────────────────────────────────────────────────

export async function getMySocialLinks(): Promise<SocialLink[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from("profile_social_links").select("id,user_id,platform,url").eq("user_id", user.id).order("created_at");
  if (error) throw error;
  return data as SocialLink[];
}

export async function addMySocialLink(platform: SocialPlatform, url: string): Promise<SocialLink> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("profile_social_links").insert({ user_id: user.id, platform, url }).select("id,user_id,platform,url").single();
  if (error) { if (error.message.includes("Maximum of 4")) throw new Error(`You can add up to ${MAX_SOCIAL_LINKS} links.`); throw error; }
  return data as SocialLink;
}

export async function deleteMySocialLink(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("profile_social_links").delete().eq("id", id);
  if (error) throw error;
}

// ── Followers ──────────────────────────────────────────────────────────────

export async function getFollowerCount(userId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase.from("followers").select("*", { count: "exact", head: true }).eq("followed_id", userId);
  if (error) throw error;
  return count ?? 0;
}

export async function getFollowingCount(userId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase.from("followers").select("*", { count: "exact", head: true }).eq("follower_id", userId);
  if (error) throw error;
  return count ?? 0;
}

export async function getFollowers(userId: string, page = 0, pageSize = 20): Promise<FollowerUser[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("followers")
    .select("profiles!follower_id(id,username,full_name,avatar_url,verification_status)")
    .eq("followed_id", userId)
    .order("created_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.profiles) as FollowerUser[];
}

export async function getFollowing(userId: string, page = 0, pageSize = 20): Promise<FollowerUser[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("followers")
    .select("profiles!followed_id(id,username,full_name,avatar_url,verification_status)")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.profiles) as FollowerUser[];
}

// ── Avatar ─────────────────────────────────────────────────────────────────

export async function uploadMyAvatar(file: File): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5MB");
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("Only JPEG, PNG or WebP allowed");
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/avatar.${ext}`;
  const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "3600" });
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
  if (files?.length) await supabase.storage.from("avatars").remove(files.map(f => `${user.id}/${f.name}`));
  await upsertMyProfile({ avatar_url: null });
}

// ── Phone OTP ──────────────────────────────────────────────────────────────

export async function sendPhoneOtp(phone: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) throw error;
  await upsertMyProfilePrivate({ phone, phone_verified: true });
}

export async function resendEmailVerification(email: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) throw error;
}

// ── Account management ─────────────────────────────────────────────────────

export async function deactivateMyAccount(): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("profiles").update({ is_deactivated: true, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) throw error;
  await supabase.auth.signOut();
}

export async function deleteMyAccount(): Promise<void> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to delete account");
  }
  await supabase.auth.signOut();
}

// ── Completeness helper ────────────────────────────────────────────────────

export function isProfileComplete(
  profile: Pick<Profile, "full_name"> | null,
  priv: Pick<ProfilePrivate, "age"|"phone_verified"> | null,
  emailVerified: boolean,
  interestCount: number
): boolean {
  if (!profile || !priv) return false;
  return Boolean(profile.full_name?.trim() && priv.age && emailVerified && priv.phone_verified && interestCount >= MIN_INTERESTS);
}

export const PROFILE_CONSTANTS = { MIN_INTERESTS, MAX_SOCIAL_LINKS };
