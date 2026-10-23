/**
 * src/lib/data/identityVerification.ts
 *
 * The blue tick: applying for it, and reviewing applications.
 *
 * Two rules the database enforces, not this file:
 *   - a blue seal needs a confirmed email AND an admin-approved document;
 *   - only an admin can approve, checked against the database on every call.
 *
 * Everything here goes through SECURITY DEFINER functions. Nothing in this
 * module can grant a tick by writing a column, and nothing it sends is
 * trusted: the email is read back from auth.users server-side, and the
 * document path is re-checked against the caller's own folder.
 *
 * About the email: there is no mail provider wired into this project, so the
 * confirmation link is Supabase Auth's own. Asking to verify an address means
 * calling updateUser({ email }), which makes Supabase send a real
 * confirmation mail to that address; clicking the link is what sets
 * email_confirmed_at, which is the only thing the database will accept as
 * proof. No second mail system, and no pretending a mail was sent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DocumentType = "aadhaar" | "voter_id" | "driving_license";

export type RequestStatus =
  | "draft"
  | "email_pending"
  | "docs_pending"
  | "under_review"
  | "approved"
  | "rejected";

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  aadhaar: "Aadhaar card",
  voter_id: "Voter ID",
  driving_license: "Driving licence",
};

export interface MyVerification {
  accountEmail: string | null;
  emailConfirmed: boolean;
  verificationType: "none" | "user" | "business";
  request: {
    id: string;
    status: RequestStatus;
    documentType: DocumentType | null;
    hasDocument: boolean;
    emailVerifiedAt: string | null;
    rejectionReason: string | null;
    reviewedAt: string | null;
    createdAt: string;
  } | null;
}

export interface AdminRequestRow {
  id: string;
  user_id: string;
  email: string | null;
  email_verified_at: string | null;
  document_type: DocumentType | null;
  document_path: string | null;
  status: RequestStatus;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  verification_type: "none" | "user" | "business";
}

/** Readable sentences for every error code the database functions return. */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Please sign in again to continue.",
  not_admin: "This action is for platform admins only.",
  not_found: "That application no longer exists.",
  bad_document_type: "Choose Aadhaar, Voter ID or a driving licence.",
  bad_document_path: "That upload does not belong to your account.",
  email_not_confirmed:
    "Confirm your email first. We can only verify an address you have clicked through from your inbox.",
  already_under_review: "Your application is already with our team.",
  already_approved: "You are already verified.",
};

export function messageFor(code: string | undefined): string {
  return (
    MESSAGES[code ?? ""] ??
    "Something went wrong. Nothing was changed, please try again."
  );
}

/* ── Applicant side ─────────────────────────────────────────────────────── */

export async function getMyVerification(
  supabase: SupabaseClient
): Promise<MyVerification | null> {
  const { data, error } = await supabase.rpc("my_identity_verification");
  if (error) {
    console.error("[getMyVerification]", error.message);
    return null;
  }
  const d = data as Record<string, unknown>;
  if (!d?.ok) return null;

  const r = d.request as Record<string, unknown> | null;
  return {
    accountEmail: (d.account_email as string) ?? null,
    emailConfirmed: Boolean(d.email_confirmed),
    verificationType: (d.verification_type as MyVerification["verificationType"]) ?? "none",
    request: r
      ? {
          id: r.id as string,
          status: r.status as RequestStatus,
          documentType: (r.document_type as DocumentType) ?? null,
          hasDocument: Boolean(r.has_document),
          emailVerifiedAt: (r.email_verified_at as string) ?? null,
          rejectionReason: (r.rejection_reason as string) ?? null,
          reviewedAt: (r.reviewed_at as string) ?? null,
          createdAt: r.created_at as string,
        }
      : null,
  };
}

/**
 * Ask Supabase to send its confirmation link to this address.
 *
 * On success the address is NOT yet verified: it is verified when the person
 * opens the link. The caller should say exactly that rather than implying the
 * step is done.
 */
export async function requestEmailConfirmation(
  supabase: SupabaseClient,
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    return { ok: false, error: "That does not look like an email address." };
  }
  const { error } = await supabase.auth.updateUser({ email: trimmed });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Upload the document into the caller's own folder in the private bucket.
 *
 * The path starts with the user id because that is what both the storage
 * policy and submit_identity_verification check. Returns the path, never a
 * URL: this bucket has no public URL, by design.
 */
export async function uploadIdentityDocument(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("identity-documents")
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

export async function submitIdentityVerification(
  supabase: SupabaseClient,
  documentType: DocumentType,
  documentPath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("submit_identity_verification", {
    p_document_type: documentType,
    p_document_path: documentPath,
  });
  if (error) return { ok: false, error: error.message };

  const d = data as { ok?: boolean; error?: string };
  if (!d?.ok) return { ok: false, error: messageFor(d?.error) };
  return { ok: true };
}

/* ── Admin side ─────────────────────────────────────────────────────────── */

export async function adminListIdentityRequests(
  supabase: SupabaseClient,
  status: RequestStatus | "all" = "under_review"
): Promise<{ ok: true; rows: AdminRequestRow[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("admin_list_identity_requests", {
    p_status: status,
    p_limit: 100,
  });
  if (error) return { ok: false, error: error.message };

  const d = data as { ok?: boolean; error?: string; requests?: AdminRequestRow[] };
  if (!d?.ok) return { ok: false, error: messageFor(d?.error) };
  return { ok: true, rows: d.requests ?? [] };
}

export async function adminReviewIdentityRequest(
  supabase: SupabaseClient,
  requestId: string,
  approve: boolean,
  reason?: string
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("admin_review_identity_request", {
    p_request_id: requestId,
    p_approve: approve,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: error.message };

  const d = data as { ok?: boolean; error?: string; status?: string };
  if (!d?.ok) return { ok: false, error: messageFor(d?.error) };
  return { ok: true, status: d.status ?? "" };
}

/**
 * A short-lived link an admin can use to look at one document.
 *
 * Sixty seconds, because the reviewer is looking at it right now and a link
 * that outlives the review is a copy of someone's Aadhaar sitting in a
 * browser history.
 */
export async function signedDocumentUrl(
  supabase: SupabaseClient,
  path: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("identity-documents")
    .createSignedUrl(path, 60);
  if (error) {
    console.error("[signedDocumentUrl]", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}
