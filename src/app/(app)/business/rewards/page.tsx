"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Gift, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import { getBusinessQuests, type Quest } from "@/lib/data/businessQuests";

interface RewardClaim {
  id: string;
  quest_id: string;
  reward_id: string;
  user_id: string;
  rank: number | null;
  status: "pending"|"eligible"|"processing"|"fulfilled"|"failed"|"disputed";
  fulfilled_at: string | null;
  notes: string | null;
  created_at: string;
  profile: { full_name: string|null; avatar_url: string|null } | null;
  reward: { title: string; value: string|null; reward_type: string } | null;
  quest: { title: string } | null;
}

const STATUS_TABS = [
  { value: "all",        label: "All" },
  { value: "eligible",   label: "Eligible" },
  { value: "pending",    label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "fulfilled",  label: "Fulfilled" },
  { value: "failed",     label: "Failed" },
] as const;
type StatusFilter = typeof STATUS_TABS[number]["value"];

const STATUS_CFG = {
  pending:    { label: "Pending",    cls: "text-on-surface-variant bg-surface-container border-outline-variant" },
  eligible:   { label: "Eligible",   cls: "text-on-success-container bg-success-container border-success-outline" },
  processing: { label: "Processing", cls: "text-secondary bg-secondary-fixed border-secondary-fixed-dim" },
  fulfilled:  { label: "Fulfilled",  cls: "text-chart-3 bg-chart-3/10 border-chart-3/25" },
  failed:     { label: "Failed",     cls: "text-on-error-container bg-error-container border-error-outline" },
  disputed:   { label: "Disputed",   cls: "text-on-warning-container bg-warning-container border-warning-outline" },
} as const;

function timeAgo(d: string) {
  const m = Math.floor((Date.now()-new Date(d).getTime())/60000);
  if (m<60) return `${m}m ago`;
  const h=Math.floor(m/60); if(h<24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

export default function RewardsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [quests, setQuests] = useState<Quest[]>([]);
  const [claims, setClaims] = useState<RewardClaim[]>([]);
  const [fulfilling, setFulfilling] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const bp = await getMyBusinessProfile(supabase);
      if (!bp?.onboarding_done) { router.replace("/business/onboarding"); return; }
      const q = await getBusinessQuests(supabase, bp.id, { limit: 50 });
      setQuests(q);
      const ids = q.map(quest => quest.id);
      if (ids.length > 0) {
        const { data } = await supabase.from("quest_reward_claims")
          .select("*, profile:profiles!user_id(full_name,avatar_url), reward:quest_rewards!reward_id(title,value,reward_type), quest:quests!quest_id(title)")
          .in("quest_id", ids)
          .order("created_at", { ascending: false })
          .limit(100);
        setClaims((data ?? []) as RewardClaim[]);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filter === "all" ? claims : claims.filter(c => c.status === filter);

  const handleFulfill = async (claimId: string) => {
    setFulfilling(claimId);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("quest_reward_claims").update({
      status: "fulfilled",
      fulfilled_at: new Date().toISOString(),
      fulfilled_by: user.id,
    }).eq("id", claimId);
    setClaims(prev => prev.map(c => c.id === claimId ? { ...c, status: "fulfilled", fulfilled_at: new Date().toISOString() } : c));
    setFulfilling(null);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface pb-28">
      <div className="bg-surface-container-lowest border-b border-outline-variant px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <Link aria-label="Back" href="/business/dashboard"><ArrowLeft size={22} className="text-on-surface-variant" /></Link>
        <h1 className="text-body-lg font-black text-on-surface flex-1">Rewards</h1>
      </div>

      {/* Summary cards */}
      <div className="px-5 py-4 mx-auto measure-page">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Eligible", value: claims.filter(c => c.status === "eligible").length, color: "text-on-success-container" },
            { label: "Pending",  value: claims.filter(c => c.status === "pending").length,  color: "text-on-warning-container" },
            { label: "Fulfilled",value: claims.filter(c => c.status === "fulfilled").length, color: "text-chart-3" },
          ].map(s => (
            <div key={s.label} className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 flex flex-col items-center elev-1 surface-raised">
              <span className={`text-2xl font-black ${s.color}`}>{s.value}</span>
              <span className="text-xs text-on-surface-variant mt-0.5">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 mb-4">
          {STATUS_TABS.map(t => (
            <button key={t.value} onClick={() => setFilter(t.value)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                filter === t.value ? "bg-secondary text-white border-secondary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant elev-1 surface-raised">
            <Gift size={32} className="text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">No reward claims yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(claim => {
              const pName = claim.profile?.full_name ?? "Unknown";
              const sc = STATUS_CFG[claim.status] ?? STATUS_CFG.pending;
              const reward = claim.reward;
              return (
                <div key={claim.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 elev-1 surface-raised">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center shrink-0 font-bold text-secondary text-sm">
                      {pName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface">{pName}</p>
                      <p className="text-xs text-on-surface-variant truncate">{claim.quest?.title ?? "—"}</p>
                      {claim.rank && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Trophy size={11} className="text-warning" />
                          <span className="text-xs text-on-warning-container font-semibold">Rank #{claim.rank}</span>
                        </div>
                      )}
                    </div>
                    <span className={`text-label-sm font-bold px-2.5 py-1 rounded-full border shrink-0 ${sc.cls}`}>{sc.label}</span>
                  </div>

                  {reward && (
                    <div className="bg-surface-container-low rounded-xl px-3 py-2.5 mb-3 flex items-center gap-3">
                      <span className="text-xl">🎁</span>
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{reward.title}</p>
                        {reward.value && <p className="text-xs text-on-success-container font-bold">{reward.value}</p>}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-on-surface-variant mb-3">
                    <span>Claimed {timeAgo(claim.created_at)}</span>
                    {claim.fulfilled_at && <span className="text-on-success-container">Fulfilled {timeAgo(claim.fulfilled_at)}</span>}
                  </div>

                  {(claim.status === "eligible" || claim.status === "processing") && (
                    <button onClick={() => handleFulfill(claim.id)} disabled={fulfilling === claim.id}
                      className="w-full h-10 rounded-xl bg-success hover:bg-success text-white text-sm font-bold disabled:opacity-40 transition-all">
                      {fulfilling === claim.id ? "Marking…" : "✓ Mark as Fulfilled"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
