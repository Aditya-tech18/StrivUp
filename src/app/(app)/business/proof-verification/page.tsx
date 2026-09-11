"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronDown, ExternalLink, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import { getBusinessQuests, getQuestSubmissions, reviewSubmission, type QuestTaskSubmission, type Quest } from "@/lib/data/businessQuests";

const TABS = [
  { value: "pending",                label: "Pending",       cls: "text-amber-700 bg-amber-50 border-amber-200" },
  { value: "approved",               label: "Approved",      cls: "text-green-700 bg-green-50 border-green-200" },
  { value: "rejected",               label: "Rejected",      cls: "text-red-700 bg-red-50 border-red-200" },
  { value: "resubmission_required",  label: "Resubmission",  cls: "text-purple-700 bg-purple-50 border-purple-200" },
] as const;
type TabValue = typeof TABS[number]["value"];

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

export default function ProofVerificationPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>("pending");
  const [quests, setQuests] = useState<Quest[]>([]);
  const [selectedQuest, setSelectedQuest] = useState("all");
  const [submissions, setSubmissions] = useState<QuestTaskSubmission[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const bp = await getMyBusinessProfile(supabase);
      if (!bp?.onboarding_done) { router.replace("/business/onboarding"); return; }
      const q = await getBusinessQuests(supabase, bp.id, { limit: 50 });
      setQuests(q);
      if (q.length > 0) {
        const allSubs: QuestTaskSubmission[] = [];
        for (const quest of q) {
          const subs = await getQuestSubmissions(supabase, quest.id);
          allSubs.push(...subs);
        }
        allSubs.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
        setSubmissions(allSubs);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = submissions.filter(s => {
    const matchTab = s.verification_status === tab;
    const matchQuest = selectedQuest === "all" || s.quest_id === selectedQuest;
    return matchTab && matchQuest;
  });

  const handleApprove = async (subId: string) => {
    setReviewing(subId);
    try {
      await reviewSubmission(supabase, subId, "approved");
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, verification_status: "approved" } : s));
    } finally { setReviewing(null); }
  };

  const handleReject = async (subId: string) => {
    setReviewing(subId);
    try {
      await reviewSubmission(supabase, subId, "rejected", rejectReason.trim() || undefined);
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, verification_status: "rejected", rejection_reason: rejectReason } : s));
      setShowRejectModal(null); setRejectReason("");
    } finally { setReviewing(null); }
  };

  const handleResubmission = async (subId: string) => {
    setReviewing(subId);
    try {
      await reviewSubmission(supabase, subId, "resubmission_required", rejectReason.trim() || undefined);
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, verification_status: "resubmission_required" } : s));
      setShowRejectModal(null); setRejectReason("");
    } finally { setReviewing(null); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const tabCounts = TABS.reduce((acc, t) => {
    acc[t.value] = submissions.filter(s => s.verification_status === t.value && (selectedQuest === "all" || s.quest_id === selectedQuest)).length;
    return acc;
  }, {} as Record<TabValue, number>);

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28">
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <Link href="/business/dashboard"><ArrowLeft size={22} className="text-gray-600" /></Link>
        <h1 className="text-[17px] font-black text-gray-900 flex-1">Proof Verification</h1>
        {tabCounts.pending > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{tabCounts.pending}</span>
        )}
      </div>

      {/* Quest selector */}
      <div className="bg-white border-b border-gray-100 px-5 py-3">
        <div className="relative max-w-2xl mx-auto">
          <select value={selectedQuest} onChange={e => setSelectedQuest(e.target.value)}
            className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-4 pr-10 text-sm font-medium text-gray-700 focus:outline-none focus:border-blue-500 appearance-none">
            <option value="all">All Quests</option>
            {quests.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Tab row */}
      <div className="bg-white border-b border-gray-100 px-5 flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.value ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400"
            }`}>
            {t.label}
            {tabCounts[t.value] > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${tab === t.value ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                {tabCounts[t.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="px-5 py-5 max-w-2xl mx-auto flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center bg-white rounded-2xl border border-gray-100">
            <CheckCircle2 size={32} className="text-gray-200" />
            <p className="text-sm text-gray-400">No {tab === "pending" ? "pending" : tab} submissions.</p>
          </div>
        ) : (
          filtered.map(sub => {
            const pName = (sub.participant as { full_name: string|null } | undefined)?.full_name ?? "Unknown";
            const taskTitle = (sub.task as { title: string } | undefined)?.title ?? "—";
            const isImg = sub.media_url && /\.(jpg|jpeg|png|webp|gif)/i.test(sub.media_url);
            return (
              <div key={sub.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 font-bold text-blue-600 text-sm">
                      {pName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{pName}</p>
                      <p className="text-xs text-gray-400 truncate">Task: {taskTitle}</p>
                      <p className="text-xs text-gray-400">{timeAgo(sub.submitted_at)}</p>
                    </div>
                    {sub.verification_status !== "pending" && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                        sub.verification_status === "approved" ? "text-green-700 bg-green-50 border-green-200" :
                        sub.verification_status === "rejected" ? "text-red-700 bg-red-50 border-red-200" :
                        "text-purple-700 bg-purple-50 border-purple-200"
                      }`}>
                        {sub.verification_status === "approved" ? "Approved" : sub.verification_status === "rejected" ? "Rejected" : "Resubmission"}
                      </span>
                    )}
                  </div>

                  {/* Media preview */}
                  {sub.media_url && isImg && (
                    <div className="w-full h-48 rounded-xl overflow-hidden bg-gray-100 mb-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sub.media_url} alt="proof" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {sub.media_url && !isImg && (
                    <a href={sub.media_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-600 text-sm font-medium mb-3 hover:underline">
                      <ExternalLink size={14} /> View Submitted Proof
                    </a>
                  )}
                  {sub.caption && (
                    <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2 mb-3">{sub.caption}</p>
                  )}
                  {sub.rejection_reason && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">Reason: {sub.rejection_reason}</p>
                  )}
                </div>

                {/* Actions — only for pending */}
                {sub.verification_status === "pending" && (
                  <div className="border-t border-gray-50 px-4 py-3 flex gap-2">
                    <button onClick={() => { setShowRejectModal(sub.id); setRejectReason(""); }}
                      className="flex-1 h-9 rounded-xl border-2 border-red-200 text-red-600 text-sm font-bold flex items-center justify-center gap-1.5">
                      <XCircle size={16} /> Reject
                    </button>
                    <button onClick={() => { setShowRejectModal(`resubmit-${sub.id}`); setRejectReason(""); }}
                      className="flex-1 h-9 rounded-xl border-2 border-purple-200 text-purple-600 text-sm font-bold">
                      Resubmit
                    </button>
                    <button onClick={() => handleApprove(sub.id)} disabled={reviewing === sub.id}
                      className="flex-1 h-9 rounded-xl bg-green-600 text-white text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40">
                      {reviewing === sub.id ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><CheckCircle2 size={16} /> Approve</>}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Reject / Resubmit Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center px-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-5">
            <h3 className="text-[17px] font-black text-gray-900 mb-1">
              {showRejectModal.startsWith("resubmit-") ? "Request Resubmission" : "Reject Submission"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">Optionally provide a reason for the participant.</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason (optional)..." rows={3}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:border-blue-500 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => { setShowRejectModal(null); setRejectReason(""); }}
                className="flex-1 h-11 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm">
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = showRejectModal.startsWith("resubmit-") ? showRejectModal.replace("resubmit-","") : showRejectModal;
                  if (showRejectModal.startsWith("resubmit-")) handleResubmission(id);
                  else handleReject(id);
                }}
                disabled={!!reviewing}
                className={`flex-1 h-11 rounded-xl text-white font-bold text-sm disabled:opacity-40 ${showRejectModal.startsWith("resubmit-") ? "bg-purple-600" : "bg-red-500"}`}>
                {reviewing ? "…" : showRejectModal.startsWith("resubmit-") ? "Request Resubmission" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
