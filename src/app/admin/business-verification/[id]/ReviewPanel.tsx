"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HelpCircle, Loader2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { reviewVerification, type SubmissionStatus } from "@/lib/data/admin";

type Decision = "approve" | "reject" | "needs_more_info";

const LABEL: Record<Decision, { verb: string; consequence: string; btn: string }> = {
  approve:         { verb: "Approve", consequence: "The business gets the blue verified badge everywhere on STRIVUP.", btn: "bg-green-700 hover:bg-green-800" },
  reject:          { verb: "Reject",  consequence: "The business is told verification wasn't approved and sees your note.", btn: "bg-red-700 hover:bg-red-800" },
  needs_more_info: { verb: "Request more information", consequence: "The business sees your note and can submit again.", btn: "bg-blue-700 hover:bg-blue-800" },
};

export function ReviewPanel({ submissionId, status, reviewNote, reviewedAt }: {
  submissionId: string; status: SubmissionStatus; reviewNote: string | null; reviewedAt: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState("");
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending_review") {
    return (
      <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-6">
        <p className="text-sm font-black text-gray-900">Decision recorded</p>
        {reviewedAt && <p className="mt-1 text-xs text-gray-600">{new Date(reviewedAt).toLocaleString("en-IN")}</p>}
        {reviewNote && <p className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-800">“{reviewNote}”</p>}
        <p className="mt-3 text-xs text-gray-600">The full action is in the audit log.</p>
      </aside>
    );
  }

  const submit = async (d: Decision) => {
    setBusy(true); setError(null);
    const res = await reviewVerification(createClient(), submissionId, d, note.trim(), internal.trim());
    setBusy(false);
    if (!res.ok) { setError(res.message); setConfirming(null); return; }
    router.refresh();
  };

  return (
    <aside className="flex h-fit flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-6">
      <p className="text-sm font-black text-gray-900">Review decision</p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-gray-900">
        Note to the business
        <span className="text-xs font-normal text-gray-600">Required to reject or request information. Keep it specific and actionable.</span>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
          className="rounded-xl border border-gray-300 px-3 py-2 text-base font-normal focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-gray-900">
        Internal note (admins only)
        <textarea value={internal} onChange={e => setInternal(e.target.value)} rows={2} placeholder="e.g. GSTIN checked on the GST portal"
          className="rounded-xl border border-gray-300 px-3 py-2 text-base font-normal focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
      </label>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {confirming ? (
        <div className="rounded-xl border border-gray-300 bg-gray-50 p-3">
          <p className="text-sm font-bold text-gray-900">{LABEL[confirming].verb} this business?</p>
          <p className="mt-1 text-xs text-gray-700">{LABEL[confirming].consequence} This is logged.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConfirming(null)} disabled={busy}
              className="h-10 flex-1 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-800">Cancel</button>
            <button type="button" onClick={() => submit(confirming)} disabled={busy}
              className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-white ${LABEL[confirming].btn}`}>
              {busy && <Loader2 size={14} className="animate-spin" />} Confirm
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setConfirming("approve")}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-green-700 text-sm font-bold text-white hover:bg-green-800">
            <CheckCircle2 size={16} aria-hidden="true" /> Approve — grant blue tick
          </button>
          <button type="button" onClick={() => setConfirming("needs_more_info")}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-300 text-sm font-bold text-blue-800 hover:bg-blue-50">
            <HelpCircle size={16} aria-hidden="true" /> Request more information
          </button>
          <button type="button" onClick={() => setConfirming("reject")}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-300 text-sm font-bold text-red-800 hover:bg-red-50">
            <XCircle size={16} aria-hidden="true" /> Reject
          </button>
        </div>
      )}
    </aside>
  );
}
