"use client";
/**
 * /business/verify-business — request the blue verified badge.
 *
 * Status comes from business_profiles.verification_status (the one canonical
 * flag). Submitting never grants the badge: a STRIVUP admin reviews the
 * documents and approves, rejects or asks for more information.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, BadgeCheck, CheckCircle2, Clock, FileText, HelpCircle, Loader2, ShieldCheck, Trash2, Upload, XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile, type BusinessProfile } from "@/lib/data/business";
import type { VerificationSubmission } from "@/lib/data/admin";
import {
  DOC_TYPES, MAX_DOC_BYTES, getMySubmissions, submitVerification, uploadVerificationDoc, type SubmissionInput,
} from "@/lib/data/businessVerification";

const DOC_LABELS = [
  "Business registration certificate", "GST registration", "FSSAI licence", "Shop & establishment / trade licence",
  "Udyam registration", "Proof of address (utility bill / rent agreement)", "Other supporting document",
];

const BUSINESS_TYPES = ["Proprietorship", "Partnership", "LLP", "Private Limited", "Public Limited", "Trust / Society / NGO", "Other"];

type Status = "none" | "pending" | "needs_info" | "verified" | "rejected" | "suspended";

function mapStatus(s: BusinessProfile["verification_status"] | undefined): Status {
  if (s === "verified") return "verified";
  if (s === "submitted" || s === "under_review") return "pending";
  if (s === "needs_more_info") return "needs_info";
  if (s === "rejected") return "rejected";
  if (s === "suspended") return "suspended";
  return "none";
}

const STATUS_CARD: Record<Status, { title: string; body: string; icon: typeof Clock; cls: string }> = {
  none:       { title: "Not verified", body: "Verify your business to earn the blue badge. It tells customers your Quests really come from you.", icon: ShieldCheck, cls: "border-gray-200 bg-white text-gray-900" },
  pending:    { title: "Verification pending", body: "Your verification request is under review. We'll notify you when there's a decision.", icon: Clock, cls: "border-amber-200 bg-amber-50 text-amber-950" },
  needs_info: { title: "More information needed", body: "The review team needs a bit more before approving. See their note below and submit again.", icon: HelpCircle, cls: "border-blue-200 bg-blue-50 text-blue-950" },
  verified:   { title: "Verified business ✓", body: "Your blue verified badge is visible on your profile, Quests and in search.", icon: BadgeCheck, cls: "border-green-200 bg-green-50 text-green-950" },
  rejected:   { title: "Verification not approved", body: "You can fix the issue below and submit again.", icon: XCircle, cls: "border-red-200 bg-red-50 text-red-950" },
  suspended:  { title: "Badge suspended", body: "Your verified badge is suspended. Contact strivup.officialteam@gmail.com.", icon: XCircle, cls: "border-red-200 bg-red-50 text-red-950" },
};

const input = "h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-base text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";

export default function VerifyBusinessPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(true);
  const [bp, setBp] = useState<BusinessProfile | null>(null);
  const [history, setHistory] = useState<VerificationSubmission[]>([]);
  const [form, setForm] = useState<Omit<SubmissionInput, "documents" | "registration_ids">>({
    legal_name: "", business_type: "", representative_name: "", representative_role: "", phone: "", email: "",
    website: "", address: "", city: "", state: "", country: "India", notes: "",
  });
  const [reg, setReg] = useState({ gstin: "", fssai: "", udyam: "", cin: "" });
  const [docs, setDocs] = useState<SubmissionInput["documents"]>([]);
  const [docLabel, setDocLabel] = useState(DOC_LABELS[0]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const profile = await getMyBusinessProfile(supabase);
      if (!profile) { router.replace("/business/onboarding"); return; }
      const subs = await getMySubmissions(supabase, profile.id);
      setBp(profile);
      setHistory(subs);
      setForm(f => ({
        ...f,
        legal_name: profile.business_name ?? "", phone: profile.business_phone ?? "", email: profile.business_email ?? "",
        website: profile.website ?? "", address: profile.address ?? "", city: profile.city ?? "", state: profile.state ?? "",
      }));
      setLoading(false);
    })();
  }, [supabase, router]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || !bp) return;
    if (!DOC_TYPES.includes(file.type)) { setError("Upload a PDF, JPG, PNG or WebP file."); return; }
    if (file.size > MAX_DOC_BYTES) { setError("Each file must be 10 MB or smaller."); return; }
    setUploading(true); setError(null);
    try {
      const path = await uploadVerificationDoc(supabase, bp.id, file);
      setDocs(d => [...d, { path, label: docLabel, name: file.name }]);
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed."); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (!bp) return;
    setSubmitting(true); setError(null);
    const registration_ids = Object.fromEntries(Object.entries(reg).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim().toUpperCase()]));
    const res = await submitVerification(supabase, { ...form, registration_ids, documents: docs });
    setSubmitting(false);
    if (!res.ok) { setError(res.message); return; }
    const [profile, subs] = await Promise.all([getMyBusinessProfile(supabase), getMySubmissions(supabase, bp.id)]);
    setBp(profile); setHistory(subs); setDocs([]); setConfirmed(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FC]">
      <Loader2 size={28} className="animate-spin text-blue-600" aria-label="Loading" />
    </div>
  );

  const status = mapStatus(bp?.verification_status);
  const card = STATUS_CARD[status];
  const canSubmit = status === "none" || status === "needs_info" || status === "rejected";
  const latest = history[0];

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-16">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-2">
        <Link href="/business/dashboard" aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-gray-50">
          <ArrowLeft size={20} className="text-gray-700" />
        </Link>
        <h1 className="text-[17px] font-black text-gray-900">Verify Your Business</h1>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
        <div className={`flex items-start gap-3 rounded-2xl border p-5 ${card.cls}`}>
          <card.icon size={26} className="shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[17px] font-black">{card.title}</p>
            <p className="mt-0.5 text-sm">{card.body}</p>
            {(status === "needs_info" || status === "rejected") && (bp?.rejection_reason || latest?.review_note) && (
              <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm"><span className="font-semibold">Reviewer note:</span> {bp?.rejection_reason ?? latest?.review_note}</p>
            )}
          </div>
        </div>

        {canSubmit && (
          <>
            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-[17px] font-black text-gray-900">Why verify?</h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm text-gray-800">
                {["Blue badge on your profile, Quests and search results", "Customers trust Quests from verified businesses",
                  "Your full business card becomes visible on Quest pages"].map(t => (
                  <li key={t} className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />{t}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-gray-700">
                A STRIVUP admin reviews every request manually. Documents alone don&apos;t guarantee approval — we may cross-check registration numbers,
                your website and contact details. Documents are stored privately and only you and the review team can open them.
              </p>
            </section>

            <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-[17px] font-black text-gray-900">Business identity</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {([
                  ["legal_name", "Legal business name *"], ["representative_name", "Authorised representative *"],
                  ["representative_role", "Their role (e.g. Owner)"], ["phone", "Business phone"], ["email", "Business email"],
                  ["website", "Website"], ["address", "Address"], ["city", "City"], ["state", "State"],
                ] as const).map(([k, label]) => (
                  <label key={k} className={`flex flex-col gap-1 text-sm font-semibold text-gray-900 ${k === "address" ? "sm:col-span-2" : ""}`}>
                    {label}
                    <input className={input} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                      type={k === "email" ? "email" : k === "phone" ? "tel" : k === "website" ? "url" : "text"}
                      autoComplete={k === "email" ? "email" : k === "phone" ? "tel" : "off"} />
                  </label>
                ))}
                <label className="flex flex-col gap-1 text-sm font-semibold text-gray-900">
                  Business type
                  <select className={input} value={form.business_type} onChange={e => setForm(f => ({ ...f, business_type: e.target.value }))}>
                    <option value="">Select…</option>
                    {BUSINESS_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </label>
              </div>

              <h3 className="mt-2 text-sm font-black text-gray-900">Registration numbers <span className="font-normal text-gray-700">(whichever apply)</span></h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {([["gstin", "GSTIN"], ["fssai", "FSSAI licence no."], ["udyam", "Udyam no."], ["cin", "CIN / LLPIN"]] as const).map(([k, label]) => (
                  <label key={k} className="flex flex-col gap-1 text-sm font-semibold text-gray-900">
                    {label}
                    <input className={`${input} uppercase`} value={reg[k]} onChange={e => setReg(r => ({ ...r, [k]: e.target.value }))} />
                  </label>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-[17px] font-black text-gray-900">Supporting documents *</h2>
              <p className="text-sm text-gray-700">Different businesses have different proof — a restaurant might send FSSAI and GST, a gym a trade licence. PDF, JPG or PNG, up to 10 MB each.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select aria-label="Document type" className={`${input} sm:flex-1`} value={docLabel} onChange={e => setDocLabel(e.target.value)}>
                  {DOC_LABELS.map(l => <option key={l}>{l}</option>)}
                </select>
                <label className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 px-5 text-sm font-bold text-blue-700 hover:bg-blue-50 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} aria-hidden="true" />} Upload file
                  <input type="file" accept={DOC_TYPES.join(",")} className="sr-only" onChange={onFile} disabled={uploading} />
                </label>
              </div>
              {docs.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {docs.map(d => (
                    <li key={d.path} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2">
                      <FileText size={18} className="shrink-0 text-gray-600" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{d.label}</p>
                        <p className="truncate text-xs text-gray-700">{d.name}</p>
                      </div>
                      <button type="button" aria-label={`Remove ${d.name}`} onClick={() => setDocs(ds => ds.filter(x => x.path !== d.path))}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 hover:bg-red-50 hover:text-red-700">
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="flex flex-col gap-1 text-sm font-semibold text-gray-900">
                Anything the reviewer should know? <span className="font-normal text-gray-700">(optional)</span>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </label>
            </section>

            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-900">
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 h-5 w-5 accent-blue-600" />
              I confirm I&apos;m authorised to represent this business and the information and documents are genuine.
            </label>

            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

            <button type="button" onClick={submit}
              disabled={submitting || uploading || !confirmed || !form.legal_name.trim() || !form.representative_name.trim() || docs.length === 0}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 text-[15px] font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {submitting && <Loader2 size={16} className="animate-spin" />} Submit for review
            </button>
          </>
        )}

        {history.length > 0 && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-[15px] font-black text-gray-900">Request history</h2>
            <ul className="mt-2 divide-y divide-gray-100">
              {history.map(h => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="font-semibold capitalize text-gray-900">{h.status.replace(/_/g, " ")}</span>
                  <span className="text-gray-700">{new Date(h.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="text-gray-700">· {h.documents.length} document{h.documents.length !== 1 ? "s" : ""}</span>
                  {h.review_note && <span className="w-full text-gray-800">“{h.review_note}”</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
