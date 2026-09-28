/**
 * src/lib/data/businessVerification.ts — business-side verification (blue tick).
 *
 * Businesses submit through submit_business_verification(); only admins can
 * approve. Documents go to the private "business-verification-docs" bucket
 * under the business's own folder and are only readable by the owner and admins.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerificationSubmission } from "./admin";

export const DOC_BUCKET = "business-verification-docs";
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export interface SubmissionInput {
  legal_name: string;
  business_type: string;
  representative_name: string;
  representative_role: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  country: string;
  registration_ids: Record<string, string>;
  documents: { path: string; label: string; name: string }[];
  notes: string;
}

const MESSAGES: Record<string, string> = {
  not_authenticated: "Please sign in again.",
  account_restricted: "Your account is restricted, so verification can't be submitted right now.",
  no_business: "Finish setting up your business profile first.",
  already_verified: "Your business is already verified.",
  suspended: "Your verification is suspended. Contact STRIVUP support.",
  already_pending: "Your previous request is still under review.",
  missing_fields: "Add the legal business name and the authorised representative.",
  missing_documents: "Upload at least one supporting document.",
  invalid_document: "One of the documents couldn't be attached. Remove it and upload it again.",
  not_available: "Business verification needs the latest database update. Please try again later.",
};

export async function uploadVerificationDoc(supabase: SupabaseClient, userId: string, file: File) {
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(/bucket not found/i.test(error.message) ? MESSAGES.not_available : "Upload failed. Please try again.");
  return path;
}

export async function submitVerification(supabase: SupabaseClient, input: SubmissionInput) {
  const { data, error } = await supabase.rpc("submit_business_verification", { p: input });
  if (error) {
    const code = error.code === "PGRST202" || /could not find the function/i.test(error.message) ? "not_available" : "unknown";
    return { ok: false as const, message: MESSAGES[code] ?? "Something went wrong. Nothing was submitted — please try again." };
  }
  const res = data as { ok: boolean; error?: string };
  return res.ok ? { ok: true as const } : { ok: false as const, message: MESSAGES[res.error ?? ""] ?? "Couldn't submit. Please try again." };
}

export async function getMySubmissions(supabase: SupabaseClient, businessId: string): Promise<VerificationSubmission[]> {
  const { data, error } = await supabase.from("business_verification_submissions").select("*")
    .eq("business_id", businessId).order("submitted_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as VerificationSubmission[];
}
