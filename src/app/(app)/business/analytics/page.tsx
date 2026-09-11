"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart2, ChevronDown, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import { getBusinessQuests, getQuestAnalytics, type Quest } from "@/lib/data/businessQuests";

interface Analytics {
  views: number;
  joins: number;
  completions: number;
  completionRate: number;
  pendingProofs: number;
  approvedProofs: number;
  rejectedProofs: number;
  approvalRate: number;
  eventTimeline: { event_type: string; created_at: string }[];
}

function MetricCard({ label, value, sub, color = "text-gray-900" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-gray-600 w-28 shrink-0">{label}</p>
      <div className="flex-1 h-7 bg-gray-100 rounded-xl overflow-hidden">
        <div className={`h-full ${color} rounded-xl transition-all duration-500 flex items-center px-3`}
          style={{ width: `${Math.max(pct, 4)}%` }}>
          {pct > 15 && <span className="text-xs font-bold text-white">{value}</span>}
        </div>
      </div>
      {pct <= 15 && <span className="text-sm font-bold text-gray-700 w-8 shrink-0">{value}</span>}
      <span className="text-xs text-gray-400 w-10 shrink-0 text-right">{pct}%</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const bp = await getMyBusinessProfile(supabase);
      if (!bp?.onboarding_done) { router.replace("/business/onboarding"); return; }
      const q = await getBusinessQuests(supabase, bp.id, { limit: 20 });
      setQuests(q);
      if (q.length > 0) {
        setSelectedQuestId(q[0].id);
        const a = await getQuestAnalytics(supabase, q[0].id);
        setAnalytics(a);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleQuestChange = async (questId: string) => {
    setSelectedQuestId(questId);
    setLoadingAnalytics(true);
    const a = await getQuestAnalytics(supabase, questId);
    setAnalytics(a);
    setLoadingAnalytics(false);
  };

  const selectedQuest = quests.find(q => q.id === selectedQuestId);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28">
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <Link href="/business/dashboard"><ArrowLeft size={22} className="text-gray-600" /></Link>
        <h1 className="text-[17px] font-black text-gray-900 flex-1">Analytics</h1>
      </div>

      <div className="px-5 py-5 max-w-2xl mx-auto flex flex-col gap-5">
        {/* Quest selector */}
        {quests.length > 0 ? (
          <>
            <div className="relative">
              <select value={selectedQuestId ?? ""} onChange={e => handleQuestChange(e.target.value)}
                className="w-full h-11 rounded-xl border border-gray-200 bg-white px-4 pr-10 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 appearance-none">
                {quests.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {loadingAnalytics ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : analytics ? (
              <>
                {/* Key metrics grid */}
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Total Views"       value={analytics.views.toLocaleString()}       color="text-blue-600" />
                  <MetricCard label="Participants"       value={analytics.joins.toLocaleString()}       color="text-green-600" />
                  <MetricCard label="Completions"        value={analytics.completions.toLocaleString()} color="text-purple-600" />
                  <MetricCard label="Completion Rate"    value={`${analytics.completionRate}%`}         color="text-amber-600" />
                  <MetricCard label="Pending Proofs"     value={analytics.pendingProofs}                color="text-orange-500" />
                  <MetricCard label="Approval Rate"      value={`${analytics.approvalRate}%`}           color="text-teal-600" />
                </div>

                {/* Funnel */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={18} className="text-blue-600" />
                    <h3 className="text-[15px] font-black text-gray-900">Quest Funnel</h3>
                  </div>
                  <div className="flex flex-col gap-3">
                    {[
                      { label: "Views",          value: analytics.views,                  color: "bg-blue-400" },
                      { label: "Joins",          value: analytics.joins,                  color: "bg-blue-500" },
                      { label: "Proofs Submitted",value: analytics.approvedProofs + analytics.rejectedProofs + analytics.pendingProofs, color: "bg-indigo-500" },
                      { label: "Proofs Approved",value: analytics.approvedProofs,         color: "bg-green-500" },
                      { label: "Completions",    value: analytics.completions,            color: "bg-purple-500" },
                    ].map(row => (
                      <FunnelBar key={row.label} label={row.label} value={row.value} max={Math.max(analytics.views, 1)} color={row.color} />
                    ))}
                  </div>
                </div>

                {/* Proof breakdown */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="text-[15px] font-black text-gray-900 mb-4">Proof Submissions</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col items-center p-3 bg-amber-50 rounded-xl">
                      <span className="text-2xl font-black text-amber-600">{analytics.pendingProofs}</span>
                      <span className="text-xs text-amber-600 font-medium mt-0.5">Pending</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-green-50 rounded-xl">
                      <span className="text-2xl font-black text-green-600">{analytics.approvedProofs}</span>
                      <span className="text-xs text-green-600 font-medium mt-0.5">Approved</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-red-50 rounded-xl">
                      <span className="text-2xl font-black text-red-500">{analytics.rejectedProofs}</span>
                      <span className="text-xs text-red-500 font-medium mt-0.5">Rejected</span>
                    </div>
                  </div>
                </div>

                {/* Quest details */}
                {selectedQuest && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h3 className="text-[15px] font-black text-gray-900 mb-3">Quest Info</h3>
                    <div className="flex flex-col gap-2">
                      {[
                        { label: "Status",    value: selectedQuest.quest_status.replace("_"," ").toUpperCase() },
                        { label: "Category",  value: selectedQuest.category ?? "—" },
                        { label: "Visibility",value: selectedQuest.visibility.replace("_"," ") },
                        { label: "Created",   value: new Date(selectedQuest.created_at).toLocaleDateString("en-IN") },
                        ...(selectedQuest.end_date ? [{ label: "Ends", value: new Date(selectedQuest.end_date).toLocaleDateString("en-IN") }] : []),
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                          <span className="text-sm text-gray-400">{row.label}</span>
                          <span className="text-sm font-semibold text-gray-800 capitalize">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-20 text-center bg-white rounded-2xl border border-gray-100">
            <BarChart2 size={36} className="text-gray-200" />
            <p className="text-[17px] font-black text-gray-900">No Analytics Yet</p>
            <p className="text-sm text-gray-400 max-w-xs">Analytics will appear once people start interacting with your Quest.</p>
            <button onClick={() => router.push("/business/quests/new")}
              className="h-10 px-5 rounded-xl bg-blue-600 text-white text-sm font-bold">
              Create a Quest
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
