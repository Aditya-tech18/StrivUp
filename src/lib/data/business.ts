/**
 * src/lib/data/business.ts
 * All business-related Supabase operations.
 * Works in both server components and browser client components.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface BusinessProfile {
  id: string;
  business_name: string | null;
  business_username: string | null;
  category: string | null;
  description: string | null;
  logo_url: string | null;
  business_phone: string | null;
  business_email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  verification_status: "draft" | "incomplete" | "submitted" | "under_review" | "verified" | "rejected" | "suspended";
  rejection_reason: string | null;
  onboarding_step: number;
  onboarding_done: boolean;
  total_customers: number;
  total_challenges: number;
  total_participants: number;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface VerificationRequest {
  id: string;
  sv_code: string;
  participant_id: string;
  business_id: string;
  challenge_id: string | null;
  quest_id: string | null;
  verification_type: string;
  activity_day: number | null;
  status: "pending" | "approved" | "rejected" | "expired";
  rejection_reason: string | null;
  bill_code: string | null;
  bill_code_expires_at: string | null;
  bill_code_used: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string;
  // joined
  participant?: { full_name: string | null; avatar_url: string | null; username: string | null };
  challenge?: { title: string } | null;
  quest?: { title: string } | null;
}

export const BUSINESS_CATEGORIES = [
  "Gym / Fitness",
  "Restaurant",
  "Café & Beverages",
  "Retail",
  "Education",
  "Technology",
  "Healthcare",
  "Fashion",
  "Beauty & Wellness",
  "Travel",
  "Entertainment",
  "Sports",
  "Professional Services",
  "Local Services",
  "Other",
] as const;

/* ── Get or create business profile ─────────────────────────────────────── */

export async function getMyBusinessProfile(
  supabase: SupabaseClient
): Promise<BusinessProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) { console.error("[getMyBusinessProfile]", error.message); return null; }
  return data as BusinessProfile | null;
}

export async function upsertBusinessProfile(
  supabase: SupabaseClient,
  fields: Partial<Omit<BusinessProfile, "id" | "created_at" | "total_customers" | "total_challenges" | "total_participants" | "rating">>
): Promise<BusinessProfile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("business_profiles")
    .upsert({ id: user.id, ...fields, updated_at: new Date().toISOString() })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  // Ensure profile.account_type = 'business'
  await supabase
    .from("profiles")
    .update({ account_type: "business", updated_at: new Date().toISOString() })
    .eq("id", user.id);

  return data as BusinessProfile;
}

/* ── Upload business logo ────────────────────────────────────────────────── */

export async function uploadBusinessLogo(
  supabase: SupabaseClient,
  file: File
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/business-logo.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("proof-media")
    .upload(path, file, { upsert: true, cacheControl: "3600" });

  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from("proof-media").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

/* ── Verification requests ───────────────────────────────────────────────── */

/**
 * Business searches by SV code. Returns the request with participant info.
 */
export async function findVerificationBySvCode(
  supabase: SupabaseClient,
  svCode: string,
  businessId: string
): Promise<VerificationRequest | null> {
  const code = svCode.trim().toUpperCase();

  const { data, error } = await supabase
    .from("business_verification_requests")
    .select(`
      *,
      participant:profiles!participant_id ( full_name, avatar_url, username ),
      challenge:challenges!challenge_id ( title ),
      quest:quests!quest_id ( title )
    `)
    .eq("sv_code", code)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) { console.error("[findVerificationBySvCode]", error.message); return null; }
  return data as VerificationRequest | null;
}

/**
 * Business approves a verification request.
 * Generates a one-time bill code (STRIV-XXXX), valid 30 minutes.
 */
export async function approveVerificationRequest(
  supabase: SupabaseClient,
  requestId: string,
  businessId: string
): Promise<{ billCode: string }> {
  // Generate bill code via DB function
  const { data: codeData, error: codeErr } = await supabase
    .rpc("generate_bill_code");
  if (codeErr || !codeData) throw new Error("Failed to generate bill code");

  const billCode = codeData as string;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("business_verification_requests")
    .update({
      status: "approved",
      bill_code: billCode,
      bill_code_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("business_id", businessId);

  if (error) throw new Error(error.message);

  // Notify the participant
  const { data: req } = await supabase
    .from("business_verification_requests")
    .select("participant_id")
    .eq("id", requestId)
    .single();

  if (req?.participant_id) {
    await supabase.from("notifications").insert({
      user_id: req.participant_id,
      title: "Verification Approved!",
      body: `Your verification was approved. Bill code: ${billCode}. Write it on your receipt.`,
      is_read: false,
    });
  }

  return { billCode };
}

/**
 * Business rejects a verification request.
 */
export async function rejectVerificationRequest(
  supabase: SupabaseClient,
  requestId: string,
  businessId: string,
  reason?: string
): Promise<void> {
  const { error } = await supabase
    .from("business_verification_requests")
    .update({
      status: "rejected",
      rejection_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("business_id", businessId);

  if (error) throw new Error(error.message);

  const { data: req } = await supabase
    .from("business_verification_requests")
    .select("participant_id")
    .eq("id", requestId)
    .single();

  if (req?.participant_id) {
    await supabase.from("notifications").insert({
      user_id: req.participant_id,
      title: "Verification Rejected",
      body: reason ? `Verification rejected: ${reason}` : "Your verification request was rejected.",
      is_read: false,
    });
  }
}

/**
 * List recent verification requests for a business.
 */
export async function getBusinessVerifications(
  supabase: SupabaseClient,
  businessId: string,
  options: { status?: string; limit?: number } = {}
): Promise<VerificationRequest[]> {
  let query = supabase
    .from("business_verification_requests")
    .select(`
      *,
      participant:profiles!participant_id ( full_name, avatar_url, username ),
      challenge:challenges!challenge_id ( title ),
      quest:quests!quest_id ( title )
    `)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 20);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) { console.error("[getBusinessVerifications]", error.message); return []; }
  return (data ?? []) as VerificationRequest[];
}

/**
 * Verification insights: total / approved / pending / rejected counts.
 */
export async function getVerificationInsights(
  supabase: SupabaseClient,
  businessId: string
): Promise<{ total: number; approved: number; pending: number; rejected: number }> {
  const { data, error } = await supabase
    .from("business_verification_requests")
    .select("status")
    .eq("business_id", businessId);

  if (error || !data) return { total: 0, approved: 0, pending: 0, rejected: 0 };

  const total = data.length;
  const approved = data.filter(r => r.status === "approved").length;
  const pending = data.filter(r => r.status === "pending").length;
  const rejected = data.filter(r => r.status === "rejected").length;
  return { total, approved, pending, rejected };
}

/**
 * Participant creates a verification request (SV code).
 * Called from the user/participant side.
 */
export async function createVerificationRequest(
  supabase: SupabaseClient,
  params: {
    businessId: string;
    challengeId?: string;
    questId?: string;
    verificationType?: string;
    activityDay?: number;
  }
): Promise<{ svCode: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: codeData, error: codeErr } = await supabase.rpc("generate_sv_code");
  if (codeErr || !codeData) throw new Error("Failed to generate SV code");

  const { error } = await supabase
    .from("business_verification_requests")
    .insert({
      sv_code: codeData,
      participant_id: user.id,
      business_id: params.businessId,
      challenge_id: params.challengeId ?? null,
      quest_id: params.questId ?? null,
      verification_type: params.verificationType ?? "business_visit",
      activity_day: params.activityDay ?? null,
    });

  if (error) throw new Error(error.message);
  return { svCode: codeData as string };
}
