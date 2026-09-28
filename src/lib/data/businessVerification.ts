/**
 * src/lib/data/businessVerification.ts
 *
 * Business *identity* verification — the blue-tick application.
 *
 * Not to be confused with src/lib/data/business.ts's verification helpers,
 * which handle customer Quest OTP codes. Different thing entirely: this is a
 * business proving who it is to STRIVUP.
 *
 * Status transitions never happen through a plain table write. The guard
 * trigger on business_profiles refuses client writes to verification_status,
 * so submission and review both go through SECURITY DEFINER functions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type VerificationStatus =
  | "not_started" | "draft" | "incomplete" | "submitted" | "under_review"
  | "needs_more_info" | "resubmission_required" | "verified" | "rejected" | "suspended";

export type DocType =
  | "business_registration" | "gst" | "pan" | "shop_licence"
  | "address_proof" | "owner_id" | "other";

export const DOC_TYPES: { value: DocType; label: string; hint: string }[] = [
  { value: "business_registration", label: "Business registration", hint: "Incorporation or registration certificate" },
  { value: "gst",                   label: "GST certificate",       hint: "If your business is GST registered" },
  { value: "pan",                   label: "PAN / tax document",    hint: "Business PAN where applicable" },
  { value: "shop_licence",          label: "Shop & establishment",  hint: "Trade or local licence, FSSAI for food businesses" },
  { value: "address_proof",         label: "Address proof",         hint: "Utility bill or lease showing the business address" },
  { value: "owner_id",              label: "Representative ID",     hint: "ID of the person authorised to represent the business" },
  { value: "other",                 label: "Other supporting document", hint: "Anything else that supports your application" },
];

/**
 * Which documents a business is asked for depends on its category — a
 * restaurant and a software company do not prove themselves the same way.
 * Returned as guidance, not as a hard gate: the admin decides what is enough.
 */
export function suggestedDocs(category: string | null): DocType[] {
  const c = (category ?? "").toLowerCase();
  if (/restaurant|cafe|food|beverage/.test(c)) {
    return ["business_registration", "shop_licence", "address_proof"];
  }
  if (/retail|salon|beauty|fitness|local/.test(c)) {
    return ["business_registration", "shop_licence", "address_proof"];
  }
  if (/tech|ecommerce|e-commerce|education|healthcare/.test(c)) {
    return ["business_registration", "gst", "pan"];
  }
  return ["business_registration", "address_proof"];
}

export interface VerificationDocument {
  id: string;
  business_id: string;
  doc_type: DocType;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: "submitted" | "accepted" | "rejected";
  review_note: string | null;
  uploaded_at: string;
}

export interface VerificationHistoryEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  actor_role: string;
  reason: string | null;
  created_at: string;
}

export interface BusinessApplication {
  business_id: string;
  business_name: string | null;
  legal_name: string | null;
  category: string | null;
  city: string | null;
  state: string | null;
  verification_status: VerificationStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  owner_email: string | null;
  owner_name: string | null;
  document_count: number;
  created_at: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function msg(e: { message?: string } | null, fallback: string) {
  return e?.message?.trim() || fallback;
}

/* ── Business side ─────────────────────────────────────────────────────── */

export async function getMyDocuments(
  supabase: SupabaseClient,
  businessId: string
): Promise<VerificationDocument[]> {
  const { data, error } = await supabase
    .from("business_verification_documents")
    .select("*")
    .eq("business_id", businessId)
    .order("uploaded_at", { ascending: false });

  if (error) { console.error("[getMyDocuments]", error.message); return []; }
  return (data ?? []) as VerificationDocument[];
}

export async function getVerificationHistory(
  supabase: SupabaseClient,
  businessId: string
): Promise<VerificationHistoryEntry[]> {
  const { data, error } = await supabase
    .from("business_verification_history")
    .select("id, from_status, to_status, actor_role, reason, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) { console.error("[getVerificationHistory]", error.message); return []; }
  return (data ?? []) as VerificationHistoryEntry[];
}

/**
 * Upload into the private business-documents bucket.
 * Path is <business_id>/<file>, which is what the storage policy keys on, so a
 * business can never read another's folder and the objects are not publicly
 * addressable at all.
 */
export async function uploadDocument(
  supabase: SupabaseClient,
  businessId: string,
  docType: DocType,
  file: File
): Promise<Result<VerificationDocument>> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${businessId}/${docType}-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("business-documents")
    .upload(path, file, { upsert: false, contentType: file.type });

  if (upErr) return { ok: false, error: msg(upErr, "Upload failed.") };

  const { data, error } = await supabase
    .from("business_verification_documents")
    .insert({
      business_id: businessId,
      doc_type: docType,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select("*")
    .single();

  if (error) {
    // Don't leave an orphan object behind if the row failed to record it.
    await supabase.storage.from("business-documents").remove([path]);
    return { ok: false, error: msg(error, "Could not record the document.") };
  }
  return { ok: true, data: data as VerificationDocument };
}

export async function deleteDocument(
  supabase: SupabaseClient,
  doc: VerificationDocument
): Promise<Result<true>> {
  const { error } = await supabase
    .from("business_verification_documents")
    .delete()
    .eq("id", doc.id);

  if (error) return { ok: false, error: msg(error, "Could not remove the document.") };
  await supabase.storage.from("business-documents").remove([doc.storage_path]);
  return { ok: true, data: true };
}

/**
 * Private bucket, so a document is only ever reachable through a short-lived
 * signed URL — never a public link.
 */
export async function signedDocumentUrl(
  supabase: SupabaseClient,
  storagePath: string,
  seconds = 300
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("business-documents")
    .createSignedUrl(storagePath, seconds);

  if (error) { console.error("[signedDocumentUrl]", error.message); return null; }
  return data?.signedUrl ?? null;
}

export async function submitForVerification(
  supabase: SupabaseClient
): Promise<Result<{ verification_status: VerificationStatus }>> {
  const { data, error } = await supabase.rpc("submit_business_verification");
  if (error) return { ok: false, error: msg(error, "Could not submit for verification.") };
  return { ok: true, data: data as { verification_status: VerificationStatus } };
}

/* ── Admin side ────────────────────────────────────────────────────────── */

export async function listApplications(
  supabase: SupabaseClient,
  status?: VerificationStatus
): Promise<BusinessApplication[]> {
  const { data, error } = await supabase.rpc("admin_list_business_applications", {
    p_status: status ?? null,
  });
  if (error) { console.error("[listApplications]", error.message); return []; }
  return (data ?? []) as BusinessApplication[];
}

export type ReviewAction =
  | "approve" | "reject" | "request_resubmission"
  | "needs_more_info" | "under_review" | "suspend" | "unsuspend";

export async function reviewBusiness(
  supabase: SupabaseClient,
  businessId: string,
  action: ReviewAction,
  reason?: string
): Promise<Result<{ verification_status: VerificationStatus }>> {
  const { data, error } = await supabase.rpc("admin_review_business", {
    p_business_id: businessId,
    p_action: action,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: msg(error, "Could not record that decision.") };
  return { ok: true, data: data as { verification_status: VerificationStatus } };
}

export async function platformStats(
  supabase: SupabaseClient
): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("admin_platform_stats");
  if (error) { console.error("[platformStats]", error.message); return {}; }
  return (data ?? {}) as Record<string, number>;
}

/* ── Shared presentation ───────────────────────────────────────────────── */

export const STATUS_UI: Record<VerificationStatus, { label: string; cls: string; blurb: string }> = {
  not_started:           { label: "Not started",      cls: "text-gray-600 bg-gray-50 border-gray-200",       blurb: "Your business verification has not started." },
  draft:                 { label: "Draft",            cls: "text-gray-600 bg-gray-50 border-gray-200",       blurb: "Your verification application is incomplete." },
  incomplete:            { label: "Incomplete",       cls: "text-amber-700 bg-amber-50 border-amber-200",    blurb: "Some required information is still missing." },
  submitted:             { label: "Submitted",        cls: "text-blue-700 bg-blue-50 border-blue-200",       blurb: "Your verification application has been submitted." },
  under_review:          { label: "Under review",     cls: "text-blue-700 bg-blue-50 border-blue-200",       blurb: "STRIVUP is reviewing your business information and documents." },
  needs_more_info:       { label: "More info needed", cls: "text-amber-700 bg-amber-50 border-amber-200",    blurb: "STRIVUP needs more information before deciding." },
  resubmission_required: { label: "Resubmit",         cls: "text-purple-700 bg-purple-50 border-purple-200", blurb: "Something needs correcting before we can verify you." },
  verified:              { label: "Verified",         cls: "text-green-700 bg-green-50 border-green-200",    blurb: "Your business has been verified by STRIVUP." },
  rejected:              { label: "Rejected",         cls: "text-red-700 bg-red-50 border-red-200",          blurb: "Your verification could not be approved." },
  suspended:             { label: "Suspended",        cls: "text-red-700 bg-red-50 border-red-200",          blurb: "This business is suspended. Contact STRIVUP support." },
};
