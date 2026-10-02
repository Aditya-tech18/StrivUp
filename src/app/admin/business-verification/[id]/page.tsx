/** /admin/business-verification/[id] — review one submission. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { requireAdmin } from "@/lib/auth/requireRole";
import { SUBMISSION_SELECT, type VerificationSubmission } from "@/lib/data/admin";
import { PageHeader, Panel, StatusChip, fmtDateTime } from "../../ui";
import { ReviewPanel } from "./ReviewPanel";

export const dynamic = "force-dynamic";

export default async function ReviewSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;

  const { data } = await supabase.from("business_verification_submissions").select(SUBMISSION_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const s = data as VerificationSubmission;

  // Private bucket: short-lived signed links, generated only for admins (storage RLS).
  const docs = await Promise.all(s.documents.map(async d => {
    const { data: signed } = await supabase.storage.from("business-verification-docs").createSignedUrl(d.path, 600);
    return { ...d, url: signed?.signedUrl ?? null };
  }));

  const { data: history } = await supabase.from("business_verification_submissions")
    .select("id, status, submitted_at, review_note").eq("business_id", s.business_id).neq("id", s.id)
    .order("submitted_at", { ascending: false });

  const reg = Object.entries(s.registration_ids ?? {}).filter(([, v]) => v);
  const rows: [string, string | null][] = [
    ["Legal name", s.legal_name], ["Business type", s.business_type],
    ["Representative", [s.representative_name, s.representative_role].filter(Boolean).join(" · ")],
    ["Phone", s.phone], ["Email", s.email], ["Website", s.website],
    ["Address", [s.address, s.city, s.state, s.country].filter(Boolean).join(", ")],
    ...reg.map(([k, v]) => [k.toUpperCase(), v] as [string, string]),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/business-verification" className="mb-3 inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900">
        <ArrowLeft size={16} aria-hidden="true" /> Verification queue
      </Link>
      <PageHeader title={s.business?.business_name ?? s.legal_name}
        subtitle={`Submitted ${fmtDateTime(s.submitted_at)}`} actions={<StatusChip status={s.status} />} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Submitted information">
            <dl className="divide-y divide-gray-100">
              {rows.map(([k, v]) => (
                <div key={k} className="flex gap-4 px-4 py-2.5 text-sm">
                  <dt className="w-36 shrink-0 text-gray-600">{k}</dt>
                  <dd className="min-w-0 flex-1 break-words font-medium text-gray-900">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            {s.notes && <p className="border-t border-gray-100 px-4 py-3 text-sm text-gray-800"><span className="font-semibold">Notes from business:</span> {s.notes}</p>}
          </Panel>

          <Panel title={`Documents (${docs.length})`}>
            <ul className="divide-y divide-gray-100">
              {docs.map(d => (
                <li key={d.path} className="flex items-center gap-3 px-4 py-3">
                  <FileText size={18} className="shrink-0 text-gray-500" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{d.label ?? "Document"}</p>
                    <p className="truncate text-xs text-gray-600">{d.name ?? d.path.split("/").pop()}</p>
                  </div>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                      Open <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  ) : <span className="text-xs text-red-700">File unavailable</span>}
                </li>
              ))}
            </ul>
            <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-600">
              Links expire after 10 minutes. Uploaded documents alone don&apos;t prove authenticity — cross-check registration numbers on official portals and contact details independently.
            </p>
          </Panel>

          {(history ?? []).length > 0 && (
            <Panel title="Previous attempts">
              <ul className="divide-y divide-gray-100">
                {(history ?? []).map(h => (
                  <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <StatusChip status={h.status} />
                    <span className="text-gray-700">{fmtDateTime(h.submitted_at)}</span>
                    {h.review_note && <span className="min-w-0 flex-1 truncate text-gray-800">“{h.review_note}”</span>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <ReviewPanel submissionId={s.id} status={s.status} reviewNote={s.review_note} reviewedAt={s.reviewed_at} />
      </div>
    </div>
  );
}
