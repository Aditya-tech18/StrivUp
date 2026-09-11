"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import { getBusinessQuests, type Quest } from "@/lib/data/businessQuests";

interface Participant {
  id: string;
  user_id: string;
  quest_id: string;
  verification_status: string;
  joined_at: string;
  completed_at: string | null;
  proof_media_url: string | null;
  profile: { full_name: string|null; avatar_url: string|null; username: string|null } | null;
  quest: { title: string } | null;
}

const FILTERS = ["all","pending","approved","rejected"] as const;
type Filter = typeof FILTERS[number];

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

export default function ParticipantsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedQuest, setSelectedQuest] = useState<string>("all");
  const [quests, setQuests] = useState<Quest[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const bp = await getMyBusinessProfile(supabase);
      if (!bp?.onboarding_done) { router.replace("/business/onboarding"); return; }

      const q = await getBusinessQuests(supabase, bp.id, { limit: 50 });
      setQuests(q);

      const questIds = q.map(quest => quest.id);
      if (questIds.length === 0) { setLoading(false); return; }

      const { data } = await supabase.from("quest_participants")
        .select("*, profile:profiles!user_id(full_name,avatar_url,username), quest:quests!quest_id(title)")
        .in("quest_id", questIds)
        .order("joined_at", { ascending: false })
        .limit(100);

      setParticipants((data ?? []) as Participant[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = participants.filter(p => {
    const matchQuest = selectedQuest === "all" || p.quest_id === selectedQuest;
    const matchFilter = filter === "all" || p.verification_status === filter;
    return matchQuest && matchFilter;
  });

  const statusCfg = {
    pending:  { label: "Active",    cls: "text-blue-700 bg-blue-50 border-blue-200" },
    approved: { label: "Completed", cls: "text-green-700 bg-green-50 border-green-200" },
    rejected: { label: "Dropped",   cls: "text-red-700 bg-red-50 border-red-200" },
  } as const;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28">
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <Link href="/business/dashboard"><ArrowLeft size={22} className="text-gray-600" /></Link>
        <h1 className="text-[17px] font-black text-gray-900 flex-1">Participants</h1>
        <span className="text-sm font-bold text-blue-600">{filtered.length}</span>
      </div>

      <div className="px-5 py-4 max-w-2xl mx-auto flex flex-col gap-3">
        {/* Quest filter */}
        <div className="relative">
          <select value={selectedQuest} onChange={e => setSelectedQuest(e.target.value)}
            className="w-full h-10 rounded-xl border border-gray-200 bg-white px-4 pr-10 text-sm font-medium text-gray-700 focus:outline-none focus:border-blue-500 appearance-none">
            <option value="all">All Quests</option>
            {quests.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                filter === f ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"
              }`}>
              {f === "all" ? "All" : f === "approved" ? "Completed" : f === "rejected" ? "Dropped" : "Active"}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center bg-white rounded-2xl border border-gray-100">
            <Users size={32} className="text-gray-300" />
            <p className="text-sm text-gray-500">No participants yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {filtered.map(p => {
              const pName = p.profile?.full_name ?? "Unknown";
              const sc = statusCfg[p.verification_status as keyof typeof statusCfg] ?? { label: "Unknown", cls: "text-gray-500 bg-gray-50 border-gray-200" };
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 font-bold text-blue-600 text-sm">
                    {p.profile?.avatar_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.profile.avatar_url} alt={pName} className="w-10 h-10 rounded-full object-cover" />
                      : pName.charAt(0)
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{pName}</p>
                    {p.profile?.username && <p className="text-xs text-gray-400">@{p.profile.username}</p>}
                    <p className="text-xs text-gray-400 truncate">{p.quest?.title ?? "—"}</p>
                    <p className="text-xs text-gray-400">Joined {timeAgo(p.joined_at)}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${sc.cls}`}>{sc.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
