import { createClient } from "@/lib/supabase/client";

/** Shape of a row in public.profiles, extended for the profile system. */
export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  account_type: string;
  verification_status: string;
  age: number | null;
  email: string | null;
  phone: string | null;
  phone_verified: boolean;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Interest {
  id: number;
  name: string;
  slug: string;
}

export type SocialPlatform =
  | "instagram"
  | "linkedin"
  | "github"
  | "twitter"
  | "youtube"
  | "portfolio"
  | "other";

export interface SocialLink {
  id: string;
  user_id: string;
  platform: SocialPlatform;
  url: string;
}

const MIN_INTERESTS = 3;
const MAX_SOCIAL_LINKS = 4;

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export async function upsertMyProfile(
  fields: Partial
    Pick
      Profile,
      "full_name" | "age" | "email" | "phone" | "phone_verified" | "bio" | "username" | "avatar_url" | "profile_completed"
    >
  >
): Promise<Profile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...fields, updated_at: new Date().toISOString() })
    .select("*")
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function getAllInterests(): Promise<Interest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("interests")
    .select("id, name, slug")
    .order("id");
  if (error) throw error;
  return data as Interest[];
}

export async function getMyInterestIds(): Promise<number[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_interests")
    .select("interest_id")
    .eq("user_id", user.id);
  if (error) throw error;
  return (data ?? []).map((r) => r.interest_id as number);
}

export async function setMyInterests(interestIds: number[]): Promise<void> {
  if (interestIds.length < MIN_INTERESTS) {
    throw new Error(`Select at least ${MIN_INTERESTS} interests`);
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error: deleteError } = await supabase
    .from("user_interests")
    .delete()
    .eq("user_id", user.id);
  if (deleteError) throw deleteError;

  if (interestIds.length > 0) {
    const rows = interestIds.map((interest_id) => ({ user_id: user.id, interest_id }));
    const { error: insertError } = await supabase.from("user_interests").insert(rows);
    if (insertError) throw insertError;
  }
}

export async function getMySocialLinks(): Promise<SocialLink[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("profile_social_links")
    .select("id, user_id, platform, url")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) throw error;
  return data as SocialLink[];
}

export async function addMySocialLink(platform: SocialPlatform, url: string): Promise<SocialLink> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("profile_social_links")
    .insert({ user_id: user.id, platform, url })
    .select("id, user_id, platform, url")
    .single();

  if (error) {
    if (error.message.includes("Maximum of 4")) {
      throw new Error(`You can add up to ${MAX_SOCIAL_LINKS} links.`);
    }
    throw error;
  }
  return data as SocialLink;
}

export async function deleteMySocialLink(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("profile_social_links").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadMyAvatar(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${publicUrlData.publicUrl}?t=${Date.now()}`;

  await upsertMyProfile({ avatar_url: url });
  return url;
}

export async function removeMyAvatar(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: files } = await supabase.storage.from("avatars").list(user.id);
  if (files && files.length > 0) {
    await supabase.storage.from("avatars").remove(files.map((f) => `${user.id}/${f.name}`));
  }
  await upsertMyProfile({ avatar_url: null });
}

export async function sendPhoneOtp(phone: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) throw error;
  await upsertMyProfile({ phone, phone_verified: true });
}

export async function resendEmailVerification(email: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) throw error;
}

export function isProfileComplete(
  profile: Pick<Profile, "full_name" | "age" | "phone_verified"> | null,
  emailVerified: boolean,
  interestCount: number
): boolean {
  if (!profile) return false;
  return Boolean(
    profile.full_name?.trim() &&
      profile.age &&
      emailVerified &&
      profile.phone_verified &&
      interestCount >= MIN_INTERESTS
  );
}

export async function deleteMyAccount(): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
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
    throw new Error(body.error ?? "Failed to delete account");
  }

  await supabase.auth.signOut();
}

export const PROFILE_CONSTANTS = { MIN_INTERESTS, MAX_SOCIAL_LINKS };
