"use client";
/**
 * /business/verify-business — the blue-tick application.
 *
 * Distinct from /business/verification, which is the counter screen where a
 * business verifies a *customer's* Quest OTP. This page is the business
 * proving its own identity to STRIVUP.
 *
 * The status is read from the database on every load rather than tracked
 * locally: an admin can change it at any moment, and a business staring at a
 * stale "Under review" while it has actually been approved is worse than a
 * short spinner.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle, ArrowLeft, Building2, Check, CheckCircle2, ExternalLink,
  FileText, Loader2, ShieldCheck, Trash2, Upload, User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile, upsertBusinessProfile, type BusinessProfile } from "@/lib/data/business";
import {
  DOC_TYPES, STATUS_UI, deleteDocument, getMyDocuments, getVerificationHistory,
  signedDocumentUrl, submitForVerification, suggestedDocs, uploadDocument,
  type DocType, type VerificationDocument, type VerificationHistoryEntry,
  type VerificationStatus,
} from "@/lib/data/businessVerification";

const STEPS = ["Business", "Representative", "Documents", "Presence", "Declaration"];

type FetchResult =
  | { redirect: string }
  | { profile: BusinessProfile; docs: VerificationDocument[]; history: VerificationHistoryEntry[] };

/** Statuses where the application is locked because STRIVUP has it. */
const LOCKED: VerificationStatus[] = ["submitted", "under_review", "verified", "suspended"];

export default function VerifyBusinessPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const [biz, setBiz] = useState<BusinessProfile | null>(null);
  const [docs, setDocs] = useState<VerificationDocument[]>([]);
  const [history, setHistory] = useState<VerificationHistoryEntry[]>([]);
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [declared, setDeclared] = useState(false);

  // Editable application fields
  const [f, setF] = useState({
    business_name: "", legal_name: "", category: "", business_type: "",
    description: "", business_email: "", business_phone: "", website: "",
    address: "", city: "", state: "", pincode: "", country: "India",
    operating_hours: "", rep_name: "", rep_role: "", rep_email: "", rep_phone: "",
  });

  /**
   * Pure fetch — returns the application and sets no state, so an effect can
   * await it and then assign inline rather than calling a setter-laden helper.
   */
  const fetchApplication = useCallback(async (): Promise<FetchResult> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { redirect: "/login?redirectTo=/business/verify-business" };

    const profile = await getMyBusinessProfile(supabase);
    if (!profile) return { redirect: "/business/onboarding" };

    const [docs, history] = await Promise.all([
      getMyDocuments(supabase, profile.id),
      getVerificationHistory(supabase, profile.id),
    ]);
    return { profile, docs, history };
  }, [supabase]);

  const fieldsOf = (profile: BusinessProfile) => {
    const p = profile as unknown as Record<string, string | null>;
    return {
      business_name: p.business_name ?? "", legal_name: p.legal_name ?? "",
      category: p.category ?? "", business_type: p.business_type ?? "",
      description: p.description ?? "", business_email: p.business_email ?? "",
      business_phone: p.business_phone ?? "", website: p.website ?? "",
      address: p.address ?? "", city: p.city ?? "", state: p.state ?? "",
      pincode: p.pincode ?? "", country: p.country ?? "India",
      operating_hours: p.operating_hours ?? "", rep_name: p.rep_name ?? "",
      rep_role: p.rep_role ?? "", rep_email: p.rep_email ?? "", rep_phone: p.rep_phone ?? "",
    };
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchApplication();
      if (cancelled) return;
      if ("redirect" in res) { router.replace(res.redirect); return; }
      setBiz(res.profile);
      setF(fieldsOf(res.profile));
      setDeclared(!!(res.profile as unknown as Record<string, string | null>).declaration_accepted_at);
      setDocs(res.docs);
      setHistory(res.history);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchApplication, router]);

  /** Re-read after an event handler changes the application (e.g. submit). */
  const reload = async () => {
    const res = await fetchApplication();
    if ("redirect" in res) { router.replace(res.redirect); return; }
    setBiz(res.profile);
    setF(fieldsOf(res.profile));
    setDocs(res.docs);
    setHistory(res.history);
  };

  const status = (biz?.verification_status ?? "not_started") as VerificationStatus;
  const locked = LOCKED.includes(status);
  const ui = STATUS_UI[status] ?? STATUS_UI.not_started;

  const saveFields = useCallback(async () => {
    if (!biz) return false;
    setSaving(true);
    setError(null);
    try {
      // verification_status is deliberately not sent: the guard trigger would
      // reject it anyway, and the only way it moves is the submit RPC.
      await upsertBusinessProfile(supabase, { id: biz.id, ...f } as Partial<BusinessProfile>);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your changes.");
      return false;
    } finally { setSaving(false); }
  }, [supabase, biz, f]);

  const handleUpload = async (docType: DocType, file: File) => {
    if (!biz) return;
    setUploading(docType);
    setError(null);
    const res = await uploadDocument(supabase, biz.id, docType, file);
    setUploading(null);
    if (!res.ok) { setError(res.error); return; }
    setDocs((prev) => [res.data, ...prev]);
  };

  const handleDelete = async (doc: VerificationDocument) => {
    const res = await deleteDocument(supabase, doc);
    if (!res.ok) { setError(res.error); return; }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  };

  const openDoc = async (doc: VerificationDocument) => {
    const url = await signedDocumentUrl(supabase, doc.storage_path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError("Could not open that document.");
  };

  const handleSubmit = async () => {
    if (!biz) return;
    if (!declared) { setError("Confirm the declaration before submitting."); return; }
    setSaving(true);
    setError(null);

    const saved = await saveFields();
    if (!saved) return;

    await upsertBusinessProfile(supabase, {
      id: biz.id, declaration_accepted_at: new Date().toISOString(),
    } as Partial<BusinessProfile>);

    const res = await submitForVerification(supabase);
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    await reload();
    setStep(0);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <Loader2 size={26} className="text-secondary animate-spin" />
      </div>
    );
  }

  const required = suggestedDocs(f.category);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-surface pb-24">
      <header className="sticky top-0 z-30 bg-surface-container-lowest border-b border-outline-variant">
        <div className="mx-auto measure-page px-5 lg:px-8 h-14 flex items-center gap-3">
          <Link href="/business/dashboard" aria-label="Back to dashboard"
            className="w-9 h-9 rounded-xl hover:bg-surface-container flex items-center justify-center shrink-0 tap-target">
            <ArrowLeft size={18} className="text-on-surface-variant" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-on-surface">Business Verification</h1>
            <p className="text-label-sm text-on-surface-variant truncate">{f.business_name || "Your business"}</p>
          </div>
          <span className={`text-label-sm font-bold px-2.5 py-1 rounded-full border shrink-0 ${ui.cls}`}>
            {ui.label}
          </span>
        </div>
      </header>

      <div className="mx-auto measure-page px-5 lg:px-8 py-6 flex flex-col gap-5">

        {/* Status panel */}
        <section className={`rounded-2xl border p-5 ${ui.cls}`}>
          <div className="flex items-start gap-3">
            {status === "verified"
              ? <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
              : <ShieldCheck size={20} className="shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <p className="text-sm font-bold">{ui.blurb}</p>
              {biz?.rejection_reason && (
                <p className="text-sm mt-1.5 leading-relaxed">
                  <span className="font-semibold">Reason:</span> {biz.rejection_reason}
                </p>
              )}
              {status === "verified" && (
                <p className="text-sm mt-1.5">
                  Business Mode is enabled — you can create and publish Quests.
                </p>
              )}
            </div>
          </div>
        </section>

        {status === "verified" ? (
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 elev-1 surface-raised">
            <h2 className="text-body-lg font-bold text-on-surface">You&apos;re all set</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Your blue tick is live on your profile, Quests and Challenges.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Link href="/business/quests/new"
                className="h-10 px-4 rounded-xl bg-secondary hover:opacity-90 text-white text-sm font-bold flex items-center transition-colors tap-target">
                Create a Quest
              </Link>
              <Link href="/business/dashboard"
                className="h-10 px-4 rounded-xl border border-outline-variant hover:bg-surface-container-low text-sm font-semibold text-on-surface-variant flex items-center transition-colors tap-target">
                Business dashboard
              </Link>
            </div>
          </section>
        ) : locked ? (
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 elev-1 surface-raised">
            <h2 className="text-body-lg font-bold text-on-surface">What happens next</h2>
            <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
              A STRIVUP reviewer checks your business information and documents.
              You&apos;ll be notified as soon as there is a decision. You can&apos;t
              edit the application while it is with us.
            </p>
            <DocumentList docs={docs} onOpen={openDoc} readOnly />
          </section>
        ) : (
          <>
            {/* Step rail */}
            <nav aria-label="Application steps"
              className="bg-surface-container-lowest rounded-2xl border border-outline-variant px-2 flex gap-1 overflow-x-auto elev-1 surface-raised">
              {STEPS.map((label, i) => (
                <button key={label} onClick={() => setStep(i)}
                  aria-current={step === i ? "step" : undefined}
                  className={`shrink-0 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                    step === i ? "border-secondary text-secondary"
                               : "border-transparent text-on-surface-variant hover:text-on-surface"}`}>
                  {i + 1}. {label}
                </button>
              ))}
            </nav>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-error-container border border-error-outline px-4 py-3">
                <AlertCircle size={16} className="text-error shrink-0 mt-0.5" />
                <p className="text-sm text-on-error-container leading-relaxed">{error}</p>
              </div>
            )}

            <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 elev-1 surface-raised">
              {step === 0 && (
                <Fields title="Business information" icon={Building2}>
                  <Field label="Business name *" value={f.business_name} onChange={set("business_name")} />
                  <Field label="Legal name (if different)" value={f.legal_name} onChange={set("legal_name")} />
                  <Field label="Category *" value={f.category} onChange={set("category")} />
                  <Field label="Business type" value={f.business_type} onChange={set("business_type")} placeholder="Sole proprietorship, Pvt Ltd…" />
                  <Field label="Business email" value={f.business_email} onChange={set("business_email")} type="email" />
                  <Field label="Business phone" value={f.business_phone} onChange={set("business_phone")} />
                  <Field label="Address *" value={f.address} onChange={set("address")} wide />
                  <Field label="City" value={f.city} onChange={set("city")} />
                  <Field label="State" value={f.state} onChange={set("state")} />
                  <Field label="PIN code" value={f.pincode} onChange={set("pincode")} />
                  <Field label="Country" value={f.country} onChange={set("country")} />
                  <Field label="Operating hours" value={f.operating_hours} onChange={set("operating_hours")} placeholder="Mon–Sun, 11am–11pm" wide />
                  <Field label="Description" value={f.description} onChange={set("description")} textarea wide />
                </Fields>
              )}

              {step === 1 && (
                <Fields title="Authorised representative" icon={User}
                  note="The person who can act for this business. We don't ask for personal documents beyond confirming authority.">
                  <Field label="Full name *" value={f.rep_name} onChange={set("rep_name")} />
                  <Field label="Role / designation *" value={f.rep_role} onChange={set("rep_role")} placeholder="Owner, Director, Manager…" />
                  <Field label="Email" value={f.rep_email} onChange={set("rep_email")} type="email" />
                  <Field label="Phone" value={f.rep_phone} onChange={set("rep_phone")} />
                </Fields>
              )}

              {step === 2 && (
                <>
                  <h2 className="text-body-lg font-bold text-on-surface flex items-center gap-2">
                    <FileText size={18} className="text-on-surface-variant" /> Business documents
                  </h2>
                  <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                    Upload what applies to your business — not every business needs
                    every document. Files are stored privately and are visible only
                    to you and STRIVUP reviewers.
                  </p>

                  {f.category && (
                    <p className="text-xs text-secondary bg-secondary-fixed border border-secondary-fixed-dim rounded-xl px-3.5 py-2.5 mt-3">
                      For <span className="font-semibold">{f.category}</span>, reviewers usually look for:{" "}
                      {required.map((r) => DOC_TYPES.find((d) => d.value === r)?.label).join(", ")}.
                    </p>
                  )}

                  <ul className="flex flex-col gap-2.5 mt-4">
                    {DOC_TYPES.map((dt) => (
                      <li key={dt.value} className="flex items-center gap-3 rounded-xl border border-outline-variant px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-on-surface">
                            {dt.label}
                            {required.includes(dt.value) && (
                              <span className="ml-2 text-label-sm font-bold text-secondary bg-secondary-fixed border border-secondary-fixed-dim px-1.5 py-0.5 rounded-full">
                                Suggested
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-on-surface-variant mt-0.5">{dt.hint}</p>
                        </div>
                        <label className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-outline-variant text-xs font-semibold text-on-surface-variant cursor-pointer hover:bg-surface-container-low transition-colors">
                          {uploading === dt.value
                            ? <><Loader2 size={13} className="animate-spin" /> Uploading…</>
                            : <><Upload size={13} /> Upload</>}
                          <input type="file" className="hidden"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleUpload(dt.value, file);
                              e.target.value = "";
                            }} />
                        </label>
                      </li>
                    ))}
                  </ul>

                  <DocumentList docs={docs} onOpen={openDoc} onDelete={handleDelete} />
                </>
              )}

              {step === 3 && (
                <Fields title="Public presence" icon={ExternalLink}
                  note="Optional, but a reviewer can usually confirm a real business much faster with these.">
                  <Field label="Website" value={f.website} onChange={set("website")} wide />
                </Fields>
              )}

              {step === 4 && (
                <>
                  <h2 className="text-body-lg font-bold text-on-surface">Declaration</h2>
                  <label className="flex items-start gap-3 mt-4 cursor-pointer">
                    <input type="checkbox" checked={declared}
                      onChange={(e) => setDeclared(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded-xl border-outline accent-blue-600 shrink-0" />
                    <span className="text-sm text-on-surface-variant leading-relaxed">
                      I confirm that the information submitted is accurate and that I
                      am authorized to represent this business.
                    </span>
                  </label>

                  <div className="mt-5 rounded-xl bg-surface-container-low border border-outline-variant p-4">
                    <p className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">Summary</p>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 mt-2">
                      <Summary k="Business" v={f.business_name} />
                      <Summary k="Category" v={f.category} />
                      <Summary k="Representative" v={f.rep_name} />
                      <Summary k="Address" v={[f.address, f.city].filter(Boolean).join(", ")} />
                      <Summary k="Documents" v={`${docs.length} uploaded`} />
                    </dl>
                  </div>

                  <button onClick={handleSubmit} disabled={saving || !declared}
                    className="mt-5 w-full h-12 rounded-xl bg-secondary hover:opacity-90 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                    {saving ? <><Loader2 size={16} className="animate-spin" /> Submitting…</>
                            : <><ShieldCheck size={16} /> Submit for Verification</>}
                  </button>
                </>
              )}

              {/* Step controls */}
              {step < 4 && (
                <div className="flex gap-2 mt-6 pt-5 border-t border-outline-variant">
                  {step > 0 && (
                    <button onClick={() => setStep((s) => s - 1)}
                      className="h-11 px-5 rounded-xl border border-outline-variant hover:bg-surface-container-low text-sm font-semibold text-on-surface-variant transition-colors">
                      Back
                    </button>
                  )}
                  <button
                    onClick={async () => { if (await saveFields()) setStep((s) => s + 1); }}
                    disabled={saving}
                    className="flex-1 h-11 rounded-xl bg-secondary hover:opacity-90 disabled:opacity-50 text-white text-sm font-bold transition-colors">
                    {saving ? "Saving…" : "Save & continue"}
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {/* History — what a reviewer has already said */}
        {history.length > 0 && (
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 elev-1 surface-raised">
            <h2 className="text-body-lg font-bold text-on-surface">Verification history</h2>
            <ol className="mt-3 divide-y divide-outline-variant">
              {history.map((h) => (
                <li key={h.id} className="py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-on-surface">
                      {STATUS_UI[h.to_status as VerificationStatus]?.label ?? h.to_status}
                    </span>
                    <span className="text-label-sm text-on-surface-variant">
                      by {h.actor_role} · {new Date(h.created_at).toLocaleString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "numeric", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {h.reason && <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">{h.reason}</p>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

function Fields({
  title, icon: Icon, note, children,
}: {
  title: string;
  icon: typeof Building2;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <h2 className="text-body-lg font-bold text-on-surface flex items-center gap-2">
        <Icon size={18} className="text-on-surface-variant" /> {title}
      </h2>
      {note && <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">{note}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">{children}</div>
    </>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, textarea, wide,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: string;
  placeholder?: string;
  textarea?: boolean;
  wide?: boolean;
}) {
  const cls =
    "w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 text-sm focus:outline-none focus:border-secondary focus:bg-surface-container-lowest transition-colors";
  return (
    <label className={wide ? "sm:col-span-2" : undefined}>
      <span className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider block mb-1">
        {label}
      </span>
      {textarea
        ? <textarea value={value} onChange={onChange} rows={3} placeholder={placeholder} className={`${cls} py-2 resize-none`} />
        : <input value={value} onChange={onChange} type={type} placeholder={placeholder} className={`${cls} h-10 tap-target`} />}
    </label>
  );
}

function Summary({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">{k}</dt>
      <dd className="text-sm text-on-surface mt-0.5">{v || "—"}</dd>
    </div>
  );
}

function DocumentList({
  docs, onOpen, onDelete, readOnly,
}: {
  docs: VerificationDocument[];
  onOpen: (d: VerificationDocument) => void;
  onDelete?: (d: VerificationDocument) => void;
  readOnly?: boolean;
}) {
  if (docs.length === 0) {
    return (
      <p className="text-sm text-on-surface-variant mt-4 text-center py-8 border border-dashed border-outline-variant rounded-xl">
        No documents uploaded yet.
      </p>
    );
  }

  return (
    <ul className="mt-5 divide-y divide-outline-variant border-t border-outline-variant">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 py-3">
          <FileText size={16} className="text-on-surface-variant shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-on-surface truncate">
              {DOC_TYPES.find((t) => t.value === d.doc_type)?.label ?? d.doc_type}
            </p>
            <p className="text-xs text-on-surface-variant truncate">{d.file_name}</p>
          </div>
          {d.status !== "submitted" && (
            <span className={`text-label-sm font-bold px-2 py-0.5 rounded-full border shrink-0 ${
              d.status === "accepted"
                ? "text-on-success-container bg-success-container border-success-outline"
                : "text-on-error-container bg-error-container border-error-outline"}`}>
              {d.status === "accepted" ? <Check size={10} className="inline" /> : null} {d.status}
            </span>
          )}
          <button onClick={() => onOpen(d)}
            className="text-xs font-semibold text-secondary hover:text-secondary shrink-0">
            View
          </button>
          {!readOnly && onDelete && d.status === "submitted" && (
            <button onClick={() => onDelete(d)} aria-label="Remove document"
              className="text-on-surface-variant hover:text-error shrink-0 transition-colors">
              <Trash2 size={15} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
