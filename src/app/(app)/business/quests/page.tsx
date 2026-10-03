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
  draft:          { label: "Draft",          cls: "bg-surface-container text-on-surface-variant" },
  pending_review: { label: "Under Review",   cls: "bg-warning-container text-on-warning-container" },
  published:      { label: "Published",      cls: "bg-secondary-fixed text-secondary" },
  active:         { label: "Active",         cls: "bg-success-container text-on-success-container" },
  paused:         { label: "Paused",         cls: "bg-warning-container text-on-warning-container" },
  completed:      { label: "Completed",      cls: "bg-purple-100 text-purple-700" },
  expired:        { label: "Expired",        cls: "bg-surface-container text-on-surface-variant" },
  rejected:       { label: "Rejected",       cls: "bg-error-container text-on-error-container" },
  archived:       { label: "Archived",       cls: "bg-surface-container text-on-surface-variant" },
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
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface pb-28">
      {/* Header */}
      <div className="bg-surface-container-lowest border-b border-outline-variant px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <Link aria-label="Back" href="/business/dashboard"><ArrowLeft size={22} className="text-on-surface-variant" /></Link>
        <h1 className="text-body-lg font-black text-on-surface flex-1">My Quests</h1>
        <button onClick={() => router.push("/business/quests/new")}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-secondary text-white text-sm font-bold">
          <Plus size={16} /> New Quest
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-surface-container-lowest border-b border-outline-variant px-5 flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`shrink-0 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.value ? "border-secondary text-secondary" : "border-transparent text-on-surface-variant hover:text-on-surface-variant"
            }`}>
            {t.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === t.value ? "bg-secondary-fixed text-secondary" : "bg-surface-container text-on-surface-variant"}`}>
              {t.value === "all" ? quests.length : quests.filter(q => q.quest_status === t.value).length}
            </span>
          </button>
        ))}
      </div>

      <div className="px-5 py-5 max-w-2xl mx-auto flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant">
            <div className="w-16 h-16 rounded-2xl bg-secondary-fixed flex items-center justify-center">
              <Plus size={28} className="text-secondary" />
            </div>
            <div>
              <p className="text-body-lg font-black text-on-surface">Your first Quest starts here</p>
              <p className="text-sm text-on-surface-variant mt-1 max-w-xs">Create a real-world mission, reward participation and grow your community.</p>
            </div>
            <button onClick={() => router.push("/business/quests/new")}
              className="h-11 px-6 rounded-xl bg-secondary text-white font-bold text-sm">
              Create Your First Quest
            </button>
          </div>
        ) : (
          filtered.map(quest => {
            const sc = STATUS_CONFIG[quest.quest_status] ?? STATUS_CONFIG.draft;
            return (
              <div key={quest.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden">
                <div className="flex gap-4 p-4">
                  {/* Cover */}
                  <div className="w-20 h-20 rounded-xl bg-surface-container overflow-hidden shrink-0">
                    {quest.cover_url || quest.thumbnail_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={quest.cover_url ?? quest.thumbnail_url ?? ""} alt={quest.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-2xl">🏆</div>
                    }
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-body-lg font-bold text-on-surface leading-tight line-clamp-2">{quest.title}</h3>
                      <span className={`shrink-0 text-label-sm font-bold px-2 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
                    </div>
                    {quest.category && <p className="text-xs text-on-surface-variant mb-2">{quest.category}</p>}
                    <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                      <span className="flex items-center gap-1"><Users size={12} />{quest.participant_count}</span>
                      <span className="flex items-center gap-1"><Eye size={12} />{quest.view_count}</span>
                      {quest.end_date && <span className="flex items-center gap-1"><Clock size={12} />Ends {formatDate(quest.end_date)}</span>}
                    </div>
                  </div>
                </div>
                {/* Actions */}
                <div className="border-t border-outline-variant px-4 py-2.5 flex items-center gap-2">
                  <Link href={`/quests/${quest.id}`} className="flex-1 h-8 flex items-center justify-center rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low">
                    View
                  </Link>
                  <button onClick={() => router.push(`/business/quests/new?edit=${quest.id}`)}
                    className="flex-1 h-8 flex items-center justify-center rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low">
                    Edit
                  </button>
                  <Link href={`/business/analytics?quest=${quest.id}`}
                    className="flex-1 h-8 flex items-center justify-center rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low">
                    Analytics
                  </Link>
                  {quest.quest_status === "active" && (
                    <button onClick={() => handleStatusChange(quest.id, "paused")}
                      className="flex-1 h-8 flex items-center justify-center rounded-lg bg-warning-container border border-warning-outline text-xs font-semibold text-on-warning-container">
                      Pause
                    </button>
                  )}
                  {quest.quest_status === "paused" && (
                    <button onClick={() => handleStatusChange(quest.id, "active")}
                      className="flex-1 h-8 flex items-center justify-center rounded-lg bg-success-container border border-success-outline text-xs font-semibold text-on-success-container">
                      Resume
                    </button>
                  )}
                  <ChevronRight size={16} className="text-on-surface-variant shrink-0" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
