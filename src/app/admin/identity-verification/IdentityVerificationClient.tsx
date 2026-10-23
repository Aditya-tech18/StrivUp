"use client";
/**
 * The blue-seal review queue.
 *
 * One decision per applicant: does this document show the person who is
 * asking? Approving is the ONLY way a blue seal is granted, and the database
 * re-checks both the admin and the applicant's email confirmation at the
 * moment of approval, so a stale queue cannot push through someone who
 * changed their address after applying.
 *
 * The document opens through a signed URL that lasts sixty seconds, fetched
 * on the click rather than rendered into the list. A list of long-lived links
 * to people's identity documents is exactly the thing not to build.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, Check, ExternalLink, FileText, Loader2, RefreshCw, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import {
  DOCUMENT_LABELS, adminListIdentityRequests, adminReviewIdentityRequest,
  signedDocumentUrl, type AdminRequestRow, type RequestStatus,
} from "@/lib/data/identityVerification";

const TABS: { label: string; value: RequestStatus | "all" }[] = [
  { label: "Waiting", value: "under_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "All", value: "all" },
];

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function IdentityVerificationClient() {
  const [supabase] = useState(() => createClient());

  const [tab, setTab] = useState<RequestStatus | "all">("under_review");
  const [rows, setRows] = useState<AdminRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async (which: RequestStatus | "all") => {
    setLoading(true);
    setError(null);
    const res = await adminListIdentityRequests(supabase, which);
    setLoading(false);
    if (!res.ok) { setError(res.error); setRows([]); return; }
    setRows(res.rows);
  }, [supabase]);

  useEffect(() => {
    const id = setTimeout(() => { void load(tab); }, 0);
    return () => clearTimeout(id);
  }, [load, tab]);

  const openDocument = async (path: string | null) => {
    if (!path) return;
    const url = await signedDocumentUrl(supabase, path);
    if (!url) { setError("Could not open that document."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const review = async (id: string, approve: boolean, why?: string) => {
    setBusy(id);
    setError(null);
    const res = await adminReviewIdentityRequest(supabase, id, approve, why);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    setRejecting(null);
    setReason("");
    await load(tab);
  };

  return (
    <div className="min-h-screen bg-surface pb-16">
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto flex measure-wide items-center gap-3 px-5 py-4 lg:px-8">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-body-lg font-black text-on-surface">
              <VerifiedBadge type="user" size={18} title="" />
              Identity Verification
            </h1>
            <p className="text-sm text-on-surface-variant">
              Approving grants the blue seal. Nothing else does.
            </p>
          </div>
          <button
            onClick={() => void load(tab)}
            aria-label="Refresh"
            className="flex h-9 items-center gap-1.5 rounded-xl border border-outline-variant px-3 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low tap-target"
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        <div className="mx-auto flex measure-wide gap-1 overflow-x-auto px-5 scrollbar-none lg:px-8">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                tab === t.value
                  ? "border-secondary text-secondary"
                  : "border-transparent text-on-surface-variant"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto measure-wide px-5 py-6 lg:px-8">
        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-xl border border-error-outline bg-error-container px-4 py-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p className="text-sm text-on-error-container">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-outline-variant py-16 text-center text-sm text-on-surface-variant">
            Nothing here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised"
              >
                <div className="flex items-start gap-3">
                  <UserAvatar src={r.avatar_url} name={r.full_name} size={44}
                    className="border border-outline-variant" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-body-md font-bold text-on-surface">
                      <span className="truncate">{r.full_name ?? "Unnamed"}</span>
                      <VerifiedBadge type={r.verification_type} size={14} />
                    </p>
                    {r.username && (
                      <p className="truncate text-xs text-on-surface-variant">@{r.username}</p>
                    )}
                    <p className="mt-1 truncate text-xs text-on-surface-variant">
                      {r.email}
                      {r.email_verified_at ? (
                        <span className="ml-1.5 rounded-full bg-success-container px-1.5 py-0.5 text-label-sm font-bold text-on-success-container">
                          confirmed
                        </span>
                      ) : (
                        <span className="ml-1.5 rounded-full bg-error-container px-1.5 py-0.5 text-label-sm font-bold text-on-error-container">
                          not confirmed
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {r.document_type ? DOCUMENT_LABELS[r.document_type] : "No document"}
                      {" · "}applied {when(r.created_at)}
                    </p>
                    {r.status === "rejected" && r.rejection_reason && (
                      <p className="mt-1 text-xs text-on-error-container">
                        Rejected: {r.rejection_reason}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-label-sm font-bold ${
                      r.status === "approved"
                        ? "bg-success-container text-on-success-container"
                        : r.status === "rejected"
                          ? "bg-error-container text-on-error-container"
                          : "bg-warning-container text-on-warning-container"
                    }`}
                  >
                    {r.status.replace("_", " ")}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-3">
                  <button
                    onClick={() => void openDocument(r.document_path)}
                    disabled={!r.document_path}
                    className="flex h-9 items-center gap-1.5 rounded-xl border border-outline-variant px-3 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:opacity-40 tap-target"
                  >
                    <FileText size={14} aria-hidden="true" /> View document
                    <ExternalLink size={12} aria-hidden="true" />
                  </button>

                  {r.status === "under_review" && (
                    <>
                      <button
                        onClick={() => void review(r.id, true)}
                        disabled={busy === r.id}
                        className="flex h-9 items-center gap-1.5 rounded-xl bg-secondary px-4 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 tap-target"
                      >
                        {busy === r.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : <Check size={14} aria-hidden="true" />}
                        Approve
                      </button>
                      <button
                        onClick={() => { setRejecting(rejecting === r.id ? null : r.id); setReason(""); }}
                        className="flex h-9 items-center gap-1.5 rounded-xl border border-error-outline px-3 text-xs font-semibold text-error transition-colors hover:bg-error-container tap-target"
                      >
                        <X size={14} aria-hidden="true" /> Reject
                      </button>
                    </>
                  )}
                </div>

                {rejecting === r.id && (
                  <div className="mt-3 flex flex-col gap-2 rounded-xl bg-surface-container-low p-3">
                    <label htmlFor={`reason-${r.id}`} className="text-xs font-semibold text-on-surface-variant">
                      Why? The applicant sees this.
                    </label>
                    <input
                      id={`reason-${r.id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="The name does not match this account"
                      className="h-10 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-secondary focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => void review(r.id, false, reason.trim() || undefined)}
                        disabled={busy === r.id}
                        className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-error px-4 text-xs font-bold text-white disabled:opacity-40"
                      >
                        {busy === r.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : "Confirm reject"}
                      </button>
                      <button
                        onClick={() => setRejecting(null)}
                        className="h-9 rounded-xl border border-outline-variant px-4 text-xs font-semibold text-on-surface-variant"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
