"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Clock, Eye, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import { getBusinessQuests, type Quest, type QuestStatus } from "@/lib/data/businessQuests";

const TABS: { label: string; value: QuestStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Drafts", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Completed", value: "completed" },
  { label: "Rejected", value: "rejected" },
];

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:          { label: "Draft",          cls: "bg-gray-100 text-gray-600" },
  pending_review: { label: "Under Review",   cls: "bg-yellow-100 text-yellow-700" },
  published:      { label: "Published",      cls: "bg-blue-100 text-blue-700" },
  active:         { label: "Active",         cls: "bg-green-100 text-green-700" },
  paused:         { label: "Paused",         cls: "bg-orange-100 text-orange-700" },
  completed:      { label: "Completed",      cls: "bg-purple-100 text-purple-700" },
  expired:        { label: "Expired",        cls: "bg-gray-100 text-gray-500" },
  rejected:       { label: "Rejected",       cls: "bg-red-100 text-red-600" },
  archived:       { label: "Archived",       cls: "bg-gray-100 text-gray-400" },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function BusinessQuestsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<QuestStatus | "all">("all");
  const [quests, setQuests] = useState<Quest[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const bp = await getMyBusinessProfile(supabase);
      if (!bp?.onboarding_done) { router.replace("/business/onboarding"); return; }
      setBusinessId(bp.id);
      const q = await getBusinessQuests(supabase, bp.id, { limit: 50 });
      setQuests(q);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = tab === "all" ? quests : quests.filter(q => q.quest_status === tab);

  const handleStatusChange = async (questId: string, newStatus: QuestStatus) => {
    if (!businessId) return;
    await supabase.from("quests").update({ quest_status: newStatus }).eq("id", questId).eq("business_id", businessId);
    setQuests(prev => prev.map(q => q.id === questId ? { ...q, quest_status: newStatus } : q));
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <Link href="/business/dashboard"><ArrowLeft size={22} className="text-gray-600" /></Link>
        <h1 className="text-[17px] font-black text-gray-900 flex-1">My Quests</h1>
        <button onClick={() => router.push("/business/quests/new")}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-blue-600 text-white text-sm font-bold">
          <Plus size={16} /> New Quest
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-5 flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`shrink-0 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.value ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>
            {t.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === t.value ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
              {t.value === "all" ? quests.length : quests.filter(q => q.quest_status === t.value).length}
            </span>
          </button>
        ))}
      </div>

      <div className="px-5 py-5 max-w-2xl mx-auto flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center bg-white rounded-2xl border border-gray-100">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Plus size={28} className="text-blue-600" />
            </div>
            <div>
              <p className="text-[17px] font-black text-gray-900">Your first Quest starts here</p>
              <p className="text-sm text-gray-500 mt-1 max-w-xs">Create a real-world mission, reward participation and grow your community.</p>
            </div>
            <button onClick={() => router.push("/business/quests/new")}
              className="h-11 px-6 rounded-xl bg-blue-600 text-white font-bold text-sm">
              Create Your First Quest
            </button>
          </div>
        ) : (
          filtered.map(quest => {
            const sc = STATUS_CONFIG[quest.quest_status] ?? STATUS_CONFIG.draft;
            return (
              <div key={quest.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex gap-4 p-4">
                  {/* Cover */}
                  <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                    {quest.cover_url || quest.thumbnail_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={quest.cover_url ?? quest.thumbnail_url ?? ""} alt={quest.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-2xl">🏆</div>
                    }
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-[15px] font-bold text-gray-900 leading-tight line-clamp-2">{quest.title}</h3>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
                    </div>
                    {quest.category && <p className="text-xs text-gray-400 mb-2">{quest.category}</p>}
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Users size={12} />{quest.participant_count}</span>
                      <span className="flex items-center gap-1"><Eye size={12} />{quest.view_count}</span>
                      {quest.end_date && <span className="flex items-center gap-1"><Clock size={12} />Ends {formatDate(quest.end_date)}</span>}
                    </div>
                  </div>
                </div>
                {/* Actions */}
                <div className="border-t border-gray-50 px-4 py-2.5 flex items-center gap-2">
                  <Link href={`/quests/${quest.id}`} className="flex-1 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                    View
                  </Link>
                  <button onClick={() => router.push(`/business/quests/new?edit=${quest.id}`)}
                    className="flex-1 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                    Edit
                  </button>
                  <Link href={`/business/analytics?quest=${quest.id}`}
                    className="flex-1 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                    Analytics
                  </Link>
                  {quest.quest_status === "active" && (
                    <button onClick={() => handleStatusChange(quest.id, "paused")}
                      className="flex-1 h-8 flex items-center justify-center rounded-lg bg-orange-50 border border-orange-200 text-xs font-semibold text-orange-600">
                      Pause
                    </button>
                  )}
                  {quest.quest_status === "paused" && (
                    <button onClick={() => handleStatusChange(quest.id, "active")}
                      className="flex-1 h-8 flex items-center justify-center rounded-lg bg-green-50 border border-green-200 text-xs font-semibold text-green-600">
                      Resume
                    </button>
                  )}
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
