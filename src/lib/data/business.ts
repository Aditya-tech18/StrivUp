/**
 * src/lib/data/business.ts
 * All business-related Supabase operations.
 * Works in both server components and browser client components.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { rejectOrder, verifyOrder } from "./orderVerification";

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
  verification_status: "draft" | "incomplete" | "submitted" | "under_review" | "needs_more_info" | "verified" | "rejected" | "suspended";
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
  /** pending → awaiting business · approved → bill code issued · completed → bill code redeemed */
  status: "pending" | "approved" | "rejected" | "expired" | "completed";
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
  task_id?: string | null;
  task?: { title: string } | null;
  business_verified_at?: string | null;
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
 * Business searches by the participant's order code (OTP 1). Accepts
 * "SV-123456", "sv123456" or "123456". Returns only what's needed to verify:
 * display name, Quest, task and timing.
 */
export async function findVerificationBySvCode(
  supabase: SupabaseClient,
  svCode: string,
  businessId: string
): Promise<VerificationRequest | null> {
  const raw = svCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const digits = raw.startsWith("SV") ? raw.slice(2) : raw;
  const code = `SV-${digits}`;

  const base = `*, participant:profiles!participant_id ( full_name, avatar_url, username ),
      challenge:challenges!challenge_id ( title ), quest:quests!quest_id ( title )`;
  const run = (select: string) => supabase
    .from("business_verification_requests").select(select)
    .eq("sv_code", code).eq("business_id", businessId).maybeSingle();

  let { data, error } = await run(`${base}, task:quest_tasks!task_id ( title )`);
  if (error) ({ data, error } = await run(base)); // before the order-verification migration there is no task_id
  if (error) { console.error("[findVerificationBySvCode]", error.message); return null; }
  return data as unknown as VerificationRequest | null;
}

/**
 * Business verifies the order → STRIVUP issues the Bill Verification code
 * (OTP 2) to write on the customer's bill. The code is never sent to the
 * participant directly.
 */
export async function approveVerificationRequest(
  supabase: SupabaseClient,
  svCode: string
): Promise<{ billCode: string; expiresAt: string }> {
  const res = await verifyOrder(supabase, svCode);
  if (!res.ok) throw new Error(res.message);
  return { billCode: res.bill_code, expiresAt: res.expires_at };
}

/** Business rejects the order; the reason is shown to the participant. */
export async function rejectVerificationRequest(
  supabase: SupabaseClient,
  requestId: string,
  reason?: string
): Promise<void> {
  const res = await rejectOrder(supabase, requestId, reason);
  if (!res.ok) throw new Error(res.message);
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
 * Pass `sinceDays` to only count requests created in the last N days (all-time when omitted).
 */
export async function getVerificationInsights(
  supabase: SupabaseClient,
  businessId: string,
  sinceDays?: number
): Promise<{ total: number; approved: number; pending: number; rejected: number }> {
  let query = supabase
    .from("business_verification_requests")
    .select("status")
    .eq("business_id", businessId);

  if (sinceDays !== undefined) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", since);
  }

  const { data, error } = await query;

  if (error || !data) return { total: 0, approved: 0, pending: 0, rejected: 0 };

  const total = data.length;
  const approved = data.filter(r => r.status === "approved" || r.status === "completed").length;
  const pending = data.filter(r => r.status === "pending").length;
  const rejected = data.filter(r => r.status === "rejected").length;
  return { total, approved, pending, rejected };
}
