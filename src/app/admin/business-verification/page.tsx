/** /admin/business-verification — queue of business verification submissions. */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth/requireRole";
import { SUBMISSION_SELECT, type SubmissionStatus, type VerificationSubmission } from "@/lib/data/admin";
import { Empty, PageHeader, Panel, StatusChip, fmtDateTime } from "../ui";

export const dynamic = "force-dynamic";

const TABS: { key: SubmissionStatus | "all"; label: string }[] = [
  { key: "pending_review", label: "Pending" },
  { key: "needs_more_info", label: "Needs info" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export default async function VerificationQueuePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase } = await requireAdmin();
  const { status: raw } = await searchParams;
  const status = (TABS.find(t => t.key === raw)?.key ?? "pending_review") as SubmissionStatus | "all";

  let q = supabase.from("business_verification_submissions").select(SUBMISSION_SELECT)
    .order("submitted_at", { ascending: status === "pending_review" }).limit(100);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  const rows = (data ?? []) as VerificationSubmission[];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Business Verification" subtitle="Review submitted documents before granting the blue verified badge." />
      <nav aria-label="Filter by status" className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
        {TABS.map(t => (
          <Link key={t.key} href={`/admin/business-verification?status=${t.key}`} aria-current={status === t.key ? "page" : undefined}
            className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold leading-10 ${status === t.key ? "border-[#0d1c32] bg-[#0d1c32] text-white" : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
      <Panel>
        {error ? <Empty>Verification requests aren&apos;t available yet. Apply the roles migration to enable this queue.</Empty>
        : rows.length === 0 ? <Empty>No business verification requests.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-600">
                  <th className="px-4 py-3 font-semibold">Business</th>
                  <th className="px-4 py-3 font-semibold">Representative</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Documents</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3"><span className="sr-only">Review</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{s.business?.business_name ?? s.legal_name}</p>
                      <p className="text-xs text-gray-600">{s.legal_name}{s.business_type ? ` · ${s.business_type}` : ""}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-800">{s.representative_name}</td>
                    <td className="px-4 py-3 text-gray-800">{[s.city, s.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-gray-800">{s.documents.length}</td>
                    <td className="px-4 py-3 text-gray-800">{fmtDateTime(s.submitted_at)}</td>
                    <td className="px-4 py-3"><StatusChip status={s.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/business-verification/${s.id}`}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 px-3 font-semibold text-blue-700 hover:bg-blue-50">
                        Review <ChevronRight size={14} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
