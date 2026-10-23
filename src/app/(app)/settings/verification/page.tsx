"use client";
/**
 * /settings/verification — applying for the blue tick.
 *
 * Two gates, shown as two steps, because that is what they are: an email the
 * person has clicked through from their inbox, then a government document a
 * human at STRIVUP has looked at. Step two stays locked until step one is
 * genuinely done, which the server decides, not this screen.
 *
 * A business owner whose business is verified already carries the gold seal
 * and is told so rather than being walked through a flow that would not
 * change anything.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowLeft, Check, Clock, FileText, Loader2, Mail, Upload, XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import {
  DOCUMENT_LABELS, getMyVerification, requestEmailConfirmation,
  submitIdentityVerification, uploadIdentityDocument,
  type DocumentType, type MyVerification,
} from "@/lib/data/identityVerification";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function StepHeader({
  n, title, done, locked,
}: {
  n: number; title: string; done: boolean; locked: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={[
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label-sm font-bold",
          done
            ? "bg-success-container text-on-success-container"
            : locked
              ? "bg-surface-container text-on-surface-variant"
              : "bg-secondary text-white",
        ].join(" ")}
      >
        {done ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : n}
      </span>
      <h2 className="text-body-lg font-bold text-on-surface">{title}</h2>
    </div>
  );
}

export default function VerificationPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<MyVerification | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [docType, setDocType] = useState<DocumentType>("aadhaar");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login?redirectTo=/settings/verification"); return; }
    setUserId(user.id);

    const s = await getMyVerification(supabase);
    setState(s);
    setEmail(s?.accountEmail ?? "");
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    const id = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(id);
  }, [load]);

  const handleSendLink = async () => {
    setError(null);
    setSending(true);
    const res = await requestEmailConfirmation(supabase, email);
    setSending(false);
    if (!res.ok) { setError(res.error); return; }
    setSentTo(email.trim().toLowerCase());
  };

  const handleSubmit = async () => {
    setError(null);
    if (!file || !userId) { setError("Choose a document to upload."); return; }
    if (file.size > MAX_BYTES) { setError("That file is over 10 MB."); return; }
    if (!ACCEPTED.includes(file.type)) {
      setError("Upload a JPG, PNG, WebP or PDF."); return;
    }

    setSubmitting(true);
    const up = await uploadIdentityDocument(supabase, userId, file);
    if (!up.ok) { setSubmitting(false); setError(up.error); return; }

    const res = await submitIdentityVerification(supabase, docType, up.path);
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }

    setFile(null);
    await load();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
      </div>
    );
  }

  const emailDone = Boolean(state?.emailConfirmed);
  const req = state?.request ?? null;
  const tier = state?.verificationType ?? "none";
  const isBusiness = tier === "business";
  const isVerified = tier !== "none";

  return (
    <div className="min-h-screen bg-surface pb-28">
      <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface/95 pt-safe backdrop-blur-md">
        <div className="mx-auto flex measure-form items-center gap-3 px-5 py-3.5">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container tap-target"
          >
            <ArrowLeft size={19} className="text-on-surface" />
          </button>
          <h1 className="text-body-lg font-bold tracking-[-0.01em] text-on-surface">
            Verification
          </h1>
        </div>
      </header>

      <div className="mx-auto flex measure-form flex-col gap-5 px-5 pt-5">

        {/* ── Already carrying a seal ─────────────────────────────────── */}
        {isVerified && (
          <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 elev-1 surface-raised">
            <div className="flex items-start gap-3">
              <VerifiedBadge type={tier} size={32} />
              <div className="min-w-0">
                <p className="text-body-lg font-bold text-on-surface">
                  {isBusiness ? "Your business is verified" : "You are verified"}
                </p>
                <p className="mt-1 text-body-md leading-relaxed text-on-surface-variant">
                  {isBusiness
                    ? "The gold seal shows next to your name across STRIVUP. It comes from your business verification, so there is nothing to apply for here."
                    : "The blue seal shows next to your name across STRIVUP."}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── What this is ────────────────────────────────────────────── */}
        {!isVerified && (
          <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 elev-1 surface-raised">
            <div className="flex items-start gap-3">
              <VerifiedBadge type="user" size={28} title="" />
              <div className="min-w-0">
                <p className="text-body-lg font-bold text-on-surface">Get the blue seal</p>
                <p className="mt-1 text-body-md leading-relaxed text-on-surface-variant">
                  Two steps: confirm your email, then send one government ID for
                  our team to check. The seal appears once both are done.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── Where the application stands ────────────────────────────── */}
        {req && req.status === "under_review" && (
          <div className="flex items-start gap-2.5 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <Clock size={17} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
            <p className="text-body-md text-on-surface">
              Your {req.documentType ? DOCUMENT_LABELS[req.documentType] : "document"} is
              with our team. We will tell you here once it has been looked at.
            </p>
          </div>
        )}

        {req && req.status === "rejected" && (
          <div className="flex items-start gap-2.5 rounded-xl border border-error-outline bg-error-container px-4 py-3">
            <XCircle size={17} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-body-md font-semibold text-on-error-container">
                That application was not approved.
              </p>
              {req.rejectionReason && (
                <p className="mt-0.5 text-body-md text-on-error-container">{req.rejectionReason}</p>
              )}
              <p className="mt-1 text-body-sm text-on-error-container">
                You can send a different document below.
              </p>
            </div>
          </div>
        )}

        {!isVerified && (
          <>
            {/* ── Step 1: email ──────────────────────────────────────── */}
            <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 elev-1 surface-raised">
              <StepHeader n={1} title="Confirm your email" done={emailDone} locked={false} />

              {emailDone ? (
                <p className="mt-3 flex items-center gap-2 text-body-md text-on-surface-variant">
                  <Mail size={15} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{state?.accountEmail}</span>
                  <span className="shrink-0 rounded-full bg-success-container px-2 py-0.5 text-label-sm font-bold text-on-success-container">
                    Confirmed
                  </span>
                </p>
              ) : (
                <>
                  <p className="mt-2 text-body-md leading-relaxed text-on-surface-variant">
                    We will email you a link. Opening it is what confirms the
                    address, so use an inbox you can actually reach.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setSentTo(null); }}
                      placeholder="you@example.com"
                      className="h-11 flex-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-secondary focus:outline-none"
                    />
                    <button
                      onClick={handleSendLink}
                      disabled={sending || !email.trim()}
                      className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-secondary px-5 text-body-md font-bold text-white elev-brand transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {sending
                        ? <><Loader2 size={16} className="animate-spin" /> Sending…</>
                        : "Send link"}
                    </button>
                  </div>

                  {sentTo && (
                    <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface-container-low px-3.5 py-3 text-body-md text-on-surface">
                      <Mail size={16} className="mt-0.5 shrink-0 text-secondary" aria-hidden="true" />
                      <span>
                        Link sent to <strong>{sentTo}</strong>. Open it, confirm
                        it is your address, then come back to this page.
                      </span>
                    </p>
                  )}
                </>
              )}
            </section>

            {/* ── Step 2: document ───────────────────────────────────── */}
            <section
              className={[
                "rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 elev-1 surface-raised",
                emailDone ? "" : "opacity-60",
              ].join(" ")}
            >
              <StepHeader
                n={2}
                title="Send a government ID"
                done={req?.status === "approved"}
                locked={!emailDone}
              />

              {!emailDone ? (
                <p className="mt-2 text-body-md text-on-surface-variant">
                  Available once your email is confirmed.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-body-md leading-relaxed text-on-surface-variant">
                    One of these, as a clear photo or PDF. Only our review team
                    can open it, and it is never shown on your profile.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Document type">
                    {(Object.keys(DOCUMENT_LABELS) as DocumentType[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={docType === d}
                        onClick={() => setDocType(d)}
                        className={[
                          "h-9 rounded-xl border px-3.5 text-body-md font-semibold transition-colors",
                          docType === d
                            ? "border-secondary bg-secondary text-white"
                            : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low",
                        ].join(" ")}
                      >
                        {DOCUMENT_LABELS[d]}
                      </button>
                    ))}
                  </div>

                  <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-outline-variant px-4 py-4 transition-colors hover:bg-surface-container-low">
                    <Upload size={18} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-md font-semibold text-on-surface">
                        {file ? file.name : "Choose a file"}
                      </span>
                      <span className="block text-body-sm text-on-surface-variant">
                        JPG, PNG, WebP or PDF, up to 10 MB
                      </span>
                    </span>
                    <input
                      type="file"
                      accept={ACCEPTED.join(",")}
                      className="sr-only"
                      onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
                    />
                  </label>

                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !file || req?.status === "under_review"}
                    className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-body-md font-bold text-white elev-brand transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {submitting
                      ? <><Loader2 size={16} className="animate-spin" /> Sending…</>
                      : <><FileText size={16} /> Send for review</>}
                  </button>
                </>
              )}
            </section>
          </>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-error-outline bg-error-container px-4 py-3">
            <AlertCircle size={17} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p className="text-body-md text-on-error-container">{error}</p>
          </div>
        )}

        <p className="px-1 pb-2 text-body-sm leading-relaxed text-on-surface-variant">
          Your document is stored privately and is visible only to the STRIVUP
          reviewer handling your application. We do not record the number from
          it anywhere.
        </p>
      </div>
    </div>
  );
}
