"use client";
/**
 * Admin business verification queue + review panel.
 *
 * A decision is never a plain table write — admin_review_business() re-checks
 * the caller is an admin, refuses reject/resubmit/suspend without a reason,
 * and writes both the history row and the admin_actions audit entry in the
 * same transaction. This UI cannot approve anything the database wouldn't.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, Building2, Check, CheckCircle2, ExternalLink, FileText,
  Loader2, MapPin, RefreshCw, ShieldCheck, User, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DOC_TYPES, STATUS_UI, listApplications, platformStats, reviewBusiness,
  signedDocumentUrl,
  type BusinessApplication, type ReviewAction, type VerificationDocument,
  type VerificationStatus,
} from "@/lib/data/businessVerification";

const TABS: { value: VerificationStatus | "all"; label: string }[] = [
  { value: "submitted",             label: "Pending" },
  { value: "under_review",          label: "Under review" },
  { value: "resubmission_required", label: "Resubmission" },
  { value: "verified",              label: "Verified" },
  { value: "rejected",              label: "Rejected" },
  { value: "suspended",             label: "Suspended" },
  { value: "all",                   label: "All" },
];

const ACTIONS: { action: ReviewAction; label: string; cls: string; needsReason: boolean }[] = [
  { action: "approve",              label: "Approve Business",   cls: "bg-success hover:bg-success text-white",       needsReason: false },
  { action: "request_resubmission", label: "Request Resubmission", cls: "border border-chart-3/25 text-chart-3 hover:bg-chart-3/10", needsReason: true },
  { action: "reject",               label: "Reject",             cls: "border border-error-outline text-on-error-container hover:bg-error-container", needsReason: true },
  { action: "suspend",              label: "Suspend",            cls: "border border-outline-variant text-on-surface hover:bg-surface-container-low", needsReason: true },
];

export default function BusinessVerificationClient() {
  const [supabase] = useState(() => createClient());
  const [tab, setTab] = useState<VerificationStatus | "all">("submitted");
  const [rows, setRows] = useState<BusinessApplication[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BusinessApplication | null>(null);

  /** Pure fetch — returns data and sets nothing, so it is safe to await in an effect. */
  const fetchQueue = useCallback(async (status: VerificationStatus | "all") => {
    return Promise.all([
      listApplications(supabase, status === "all" ? undefined : status),
      platformStats(supabase),
    ]);
  }, [supabase]);

  // `loading` starts true and is turned on by the tab handler instead of here,
  // so the effect never sets state synchronously.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r, s] = await fetchQueue(tab);
      if (cancelled) return;
      setRows(r);
      setStats(s);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchQueue, tab]);

  /** Refresh from an event handler (button, post-decision). */
  const reload = async () => {
    setLoading(true);
    const [r, s] = await fetchQueue(tab);
    setRows(r);
    setStats(s);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-admin-chrome-high pb-24">
      {/* Admin chrome is deliberately dark — you should never mistake the admin
          console for the business dashboard while acting on someone's account. */}
      <header className="sticky top-0 z-30 bg-admin-chrome-high border-b border-white/10">
        <div className="measure-console mx-auto px-5 lg:px-8 h-14 flex items-center gap-3">
          <ShieldCheck size={18} className="text-admin-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-white">Business Verification</h1>
            <p className="text-label-sm text-on-admin-chrome-variant">STRIVUP admin console</p>
          </div>
          <Link href="/admin/moderation"
            className="h-9 px-3 rounded-xl border border-white/15 hover:bg-white/5 text-xs font-semibold text-on-admin-chrome-variant flex items-center transition-colors tap-target">
            Moderation
          </Link>
          <button onClick={() => void reload()} aria-label="Refresh"
            className="h-9 px-3 rounded-xl border border-white/15 hover:bg-white/5 text-xs font-semibold text-on-admin-chrome-variant flex items-center gap-1.5 transition-colors tap-target">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </header>

      <div className="measure-console mx-auto px-5 lg:px-8 py-6 flex flex-col gap-5">

        {/* Platform KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { k: "Pending review",  v: stats.pending_businesses },
            { k: "Verified",        v: stats.verified_businesses },
            { k: "Businesses",      v: stats.total_businesses },
            { k: "Users",           v: stats.total_users },
            { k: "Suspended",       v: stats.suspended_accounts },
          ].map((s) => (
            <div key={s.k} className="rounded-2xl bg-admin-chrome-high border border-white/10 px-4 py-3.5">
              <p className="text-label-sm font-bold uppercase tracking-wider text-on-admin-chrome-variant">{s.k}</p>
              <p className="text-2xl font-bold text-white mt-1">{s.v ?? 0}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <nav aria-label="Verification status" className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.value} onClick={() => { setLoading(true); setTab(t.value); }}
              aria-current={tab === t.value ? "page" : undefined}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                tab === t.value
                  ? "bg-secondary text-white"
                  : "text-white/50 hover:text-white hover:bg-white/5"}`}>
              {t.label}
            </button>
          ))}
        </nav>

        {/* Queue */}
        <section className="rounded-2xl bg-admin-chrome-high border border-white/10 overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center">
              <Loader2 size={22} className="text-admin-accent animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-on-admin-chrome-variant">
              Nothing in this queue.
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {rows.map((r) => {
                const ui = STATUS_UI[r.verification_status] ?? STATUS_UI.not_started;
                return (
                  <li key={r.business_id}>
                    <button onClick={() => setSelected(r)}
                      className="w-full text-left px-5 py-4 hover:bg-white/5 transition-colors flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <Building2 size={17} className="text-on-admin-chrome-variant" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {r.business_name ?? "Unnamed business"}
                        </p>
                        <p className="text-xs text-on-admin-chrome-variant truncate">
                          {[r.category, [r.city, r.state].filter(Boolean).join(", "), r.owner_email]
                            .filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="text-xs text-on-admin-chrome-variant shrink-0 hidden sm:block">
                        {r.document_count} doc{r.document_count === 1 ? "" : "s"}
                      </span>
                      <span className={`text-label-sm font-bold px-2 py-0.5 rounded-full border shrink-0 ${ui.cls}`}>
                        {ui.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {selected && (
        <ReviewPanel
          app={selected}
          supabase={supabase}
          onClose={() => setSelected(null)}
          onDone={() => { setSelected(null); void reload(); }}
        />
      )}
    </div>
  );
}

/* ── Review panel ──────────────────────────────────────────────────────── */

function ReviewPanel({
  app, supabase, onClose, onDone,
}: {
  app: BusinessApplication;
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [docs, setDocs] = useState<VerificationDocument[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<ReviewAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, string | null> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: d }, { data: p }] = await Promise.all([
        supabase.from("business_verification_documents").select("*")
          .eq("business_id", app.business_id).order("uploaded_at", { ascending: false }),
        supabase.from("business_profiles").select("*").eq("id", app.business_id).maybeSingle(),
      ]);
      if (cancelled) return;
      setDocs((d ?? []) as VerificationDocument[]);
      setProfile((p ?? null) as Record<string, string | null> | null);
    })();
    return () => { cancelled = true; };
  }, [supabase, app.business_id]);

  const openDoc = async (d: VerificationDocument) => {
    const url = await signedDocumentUrl(supabase, d.storage_path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError("Could not open that document.");
  };

  const act = async (action: ReviewAction, needsReason: boolean) => {
    if (needsReason && !reason.trim()) {
      setError("Tell the business what to fix — a decision they can't act on is a dead end.");
      return;
    }
    setBusy(action);
    setError(null);
    const res = await reviewBusiness(supabase, app.business_id, action, reason.trim() || undefined);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-2xl bg-admin-chrome-high border border-white/10 rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">

        <div className="sticky top-0 bg-admin-chrome-high border-b border-white/10 px-5 py-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{app.business_name}</p>
            <p className="text-label-sm text-on-admin-chrome-variant truncate">{app.owner_email}</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center shrink-0 tap-target">
            <X size={17} className="text-white/60" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">

          <Block title="Business information" icon={Building2}>
            <Row k="Business name" v={profile?.business_name} />
            <Row k="Legal name" v={profile?.legal_name} />
            <Row k="Category" v={profile?.category} />
            <Row k="Business type" v={profile?.business_type} />
            <Row k="Email" v={profile?.business_email} />
            <Row k="Phone" v={profile?.business_phone} />
            <Row k="Address" v={[profile?.address, profile?.city, profile?.state, profile?.pincode].filter(Boolean).join(", ")} />
            <Row k="Hours" v={profile?.operating_hours} />
          </Block>

          <Block title="Representative" icon={User}>
            <Row k="Name" v={profile?.rep_name} />
            <Row k="Role" v={profile?.rep_role} />
            <Row k="Email" v={profile?.rep_email} />
            <Row k="Phone" v={profile?.rep_phone} />
            <Row k="Declared at" v={profile?.declaration_accepted_at
              ? new Date(profile.declaration_accepted_at).toLocaleString("en-IN")
              : null} />
          </Block>

          <Block title="Public presence" icon={ExternalLink}>
            {profile?.website ? (
              <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
                target="_blank" rel="noopener noreferrer"
                className="text-sm text-admin-accent hover:underline break-all col-span-2">
                {profile.website}
              </a>
            ) : <Row k="Website" v={null} />}
            {profile?.google_maps_url && (
              <a href={profile.google_maps_url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-admin-accent hover:underline break-all col-span-2 flex items-center gap-1.5">
                <MapPin size={13} /> Google Business profile
              </a>
            )}
          </Block>

          {/* Documents — opened through short-lived signed URLs, never public links */}
          <div>
            <p className="text-label-sm font-bold uppercase tracking-wider text-on-admin-chrome-variant flex items-center gap-2">
              <FileText size={13} /> Documents ({docs.length})
            </p>
            {docs.length === 0 ? (
              <p className="text-sm text-on-admin-chrome-variant mt-3 py-6 text-center border border-dashed border-white/10 rounded-xl">
                No documents submitted.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-white/5 border-t border-white/5">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2.5">
                    <FileText size={15} className="text-on-admin-chrome-variant shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {DOC_TYPES.find((t) => t.value === d.doc_type)?.label ?? d.doc_type}
                      </p>
                      <p className="text-label-sm text-white/35 truncate">{d.file_name}</p>
                    </div>
                    <button onClick={() => openDoc(d)}
                      className="text-xs font-semibold text-admin-accent hover:text-on-admin-chrome-variant shrink-0">
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Decision */}
          <div className="border-t border-white/10 pt-5">
            <p className="text-label-sm font-bold uppercase tracking-wider text-on-admin-chrome-variant">Decision</p>
            <label htmlFor="review-reason" className="sr-only">Reason</label>
            <textarea id="review-reason" value={reason} rows={3}
              onChange={(e) => { setReason(e.target.value); setError(null); }}
              placeholder="Reason — required for reject, resubmission and suspend. The business sees this."
              className="w-full mt-2 rounded-xl bg-white/5 border border-white/10 px-3.5 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-secondary resize-none transition-colors" />

            {error && (
              <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-error/10 border border-error/30 px-3.5 py-2.5">
                <AlertCircle size={15} className="text-error-container shrink-0 mt-0.5" />
                <p className="text-sm text-error-container leading-relaxed">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              {ACTIONS.map((a) => (
                <button key={a.action} onClick={() => act(a.action, a.needsReason)}
                  disabled={busy !== null}
                  className={`h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors ${a.cls}`}>
                  {busy === a.action
                    ? <Loader2 size={15} className="animate-spin" />
                    : a.action === "approve" ? <CheckCircle2 size={15} /> : <Check size={15} />}
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({
  title, icon: Icon, children,
}: {
  title: string;
  icon: typeof Building2;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-label-sm font-bold uppercase tracking-wider text-on-admin-chrome-variant flex items-center gap-2">
        <Icon size={13} /> {title}
      </p>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5 mt-3">{children}</dl>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-label-sm font-semibold uppercase tracking-wider text-on-admin-chrome-variant">{k}</dt>
      <dd className="text-sm text-on-admin-chrome-variant mt-0.5 break-words">{v || "—"}</dd>
    </div>
  );
}
