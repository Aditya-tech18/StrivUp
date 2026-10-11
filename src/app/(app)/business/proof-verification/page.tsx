"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronDown, ExternalLink, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import { getBusinessQuests, getQuestSubmissions, reviewSubmission, type QuestTaskSubmission, type Quest } from "@/lib/data/businessQuests";

const TABS = [
  { value: "pending",                label: "Pending",       cls: "text-on-warning-container bg-warning-container border-warning-outline" },
  { value: "approved",               label: "Approved",      cls: "text-on-success-container bg-success-container border-success-outline" },
  { value: "rejected",               label: "Rejected",      cls: "text-on-error-container bg-error-container border-error-outline" },
  { value: "resubmission_required",  label: "Resubmission",  cls: "text-chart-3 bg-chart-3/10 border-chart-3/25" },
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
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const tabCounts = TABS.reduce((acc, t) => {
    acc[t.value] = submissions.filter(s => s.verification_status === t.value && (selectedQuest === "all" || s.quest_id === selectedQuest)).length;
    return acc;
  }, {} as Record<TabValue, number>);

  return (
    <div className="min-h-screen bg-surface pb-28">
      <div className="bg-surface-container-lowest border-b border-outline-variant px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <Link aria-label="Back" href="/business/dashboard"><ArrowLeft size={22} className="text-on-surface-variant" /></Link>
        <h1 className="text-body-lg font-black text-on-surface flex-1">Proof Verification</h1>
        {tabCounts.pending > 0 && (
          <span className="bg-error text-white text-xs font-bold px-2 py-0.5 rounded-full">{tabCounts.pending}</span>
        )}
      </div>

      {/* Quest selector */}
      <div className="bg-surface-container-lowest border-b border-outline-variant px-5 py-3">
        <div className="relative mx-auto measure-page">
          <select aria-label="Filter by quest" value={selectedQuest} onChange={e => setSelectedQuest(e.target.value)}
            className="w-full h-10 rounded-xl border border-outline-variant bg-surface-container-low px-4 pr-10 text-sm font-medium text-on-surface-variant focus:outline-none focus:border-secondary appearance-none tap-target">
            <option value="all">All Quests</option>
            {quests.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
        </div>
      </div>

      {/* Tab row */}
      <div className="bg-surface-container-lowest border-b border-outline-variant px-5 flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.value ? "border-secondary text-secondary" : "border-transparent text-on-surface-variant"
            }`}>
            {t.label}
            {tabCounts[t.value] > 0 && (
              <span className={`text-label-sm font-bold px-1.5 py-0.5 rounded-full border ${tab === t.value ? "bg-secondary-fixed text-secondary border-secondary-fixed-dim" : "bg-surface-container text-on-surface-variant border-outline-variant"}`}>
                {tabCounts[t.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="px-5 py-5 mx-auto measure-page flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant elev-1 surface-raised">
            <CheckCircle2 size={32} className="text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">No {tab === "pending" ? "pending" : tab} submissions.</p>
          </div>
        ) : (
          filtered.map(sub => {
            const pName = (sub.participant as { full_name: string|null } | undefined)?.full_name ?? "Unknown";
            const taskTitle = (sub.task as { title: string } | undefined)?.title ?? "—";
            const isImg = sub.media_url && /\.(jpg|jpeg|png|webp|gif)/i.test(sub.media_url);
            return (
              <div key={sub.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden elev-1 surface-raised">
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center shrink-0 font-bold text-secondary text-sm">
                      {pName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface">{pName}</p>
                      <p className="text-xs text-on-surface-variant truncate">Task: {taskTitle}</p>
                      <p className="text-xs text-on-surface-variant">{timeAgo(sub.submitted_at)}</p>
                    </div>
                    {sub.verification_status !== "pending" && (
                      <span className={`text-label-sm font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                        sub.verification_status === "approved" ? "text-on-success-container bg-success-container border-success-outline" :
                        sub.verification_status === "rejected" ? "text-on-error-container bg-error-container border-error-outline" :
                        "text-chart-3 bg-chart-3/10 border-chart-3/25"
                      }`}>
                        {sub.verification_status === "approved" ? "Approved" : sub.verification_status === "rejected" ? "Rejected" : "Resubmission"}
                      </span>
                    )}
                  </div>

                  {/* Media preview */}
                  {sub.media_url && isImg && (
                    <div className="w-full h-48 rounded-xl overflow-hidden bg-surface-container mb-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sub.media_url} alt="proof" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {sub.media_url && !isImg && (
                    <a href={sub.media_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-secondary text-sm font-medium mb-3 hover:underline">
                      <ExternalLink size={14} /> View Submitted Proof
                    </a>
                  )}
                  {sub.caption && (
                    <p className="text-sm text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2 mb-3">{sub.caption}</p>
                  )}
                  {sub.rejection_reason && (
                    <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-2 mb-3">Reason: {sub.rejection_reason}</p>
                  )}
                </div>

                {/* Actions — only for pending */}
                {sub.verification_status === "pending" && (
                  <div className="border-t border-outline-variant px-4 py-3 flex gap-2">
                    <button onClick={() => { setShowRejectModal(sub.id); setRejectReason(""); }}
                      className="flex-1 h-9 rounded-xl border-2 border-error-outline text-on-error-container text-sm font-bold flex items-center justify-center gap-1.5 tap-target">
                      <XCircle size={16} /> Reject
                    </button>
                    <button onClick={() => { setShowRejectModal(`resubmit-${sub.id}`); setRejectReason(""); }}
                      className="flex-1 h-9 rounded-xl border-2 border-chart-3/25 text-chart-3 text-sm font-bold tap-target">
                      Resubmit
                    </button>
                    <button onClick={() => handleApprove(sub.id)} disabled={reviewing === sub.id}
                      className="flex-1 h-9 rounded-xl bg-success text-white text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 tap-target">
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
          <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl p-5 elev-5">
            <h3 className="text-body-lg font-black text-on-surface mb-1">
              {showRejectModal.startsWith("resubmit-") ? "Request Resubmission" : "Reject Submission"}
            </h3>
            <p className="text-sm text-on-surface-variant mb-4">Optionally provide a reason for the participant.</p>
            <textarea aria-label="Rejection reason (optional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason (optional)..." rows={3}
              className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:outline-none focus:border-secondary resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => { setShowRejectModal(null); setRejectReason(""); }}
                className="flex-1 h-11 rounded-xl border border-outline-variant text-on-surface-variant font-semibold text-sm">
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = showRejectModal.startsWith("resubmit-") ? showRejectModal.replace("resubmit-","") : showRejectModal;
                  if (showRejectModal.startsWith("resubmit-")) handleResubmission(id);
                  else handleReject(id);
                }}
                disabled={!!reviewing}
                className={`flex-1 h-11 rounded-xl text-white font-bold text-sm disabled:opacity-40 ${showRejectModal.startsWith("resubmit-") ? "bg-chart-3" : "bg-error"}`}>
                {reviewing ? "…" : showRejectModal.startsWith("resubmit-") ? "Request Resubmission" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
