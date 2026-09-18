"use client";
/**
 * BusinessQuestDetailClient — Quest detail for business-created quests.
 * Shows business info, tasks list, rewards, rules, and CTA.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Calendar, CheckCircle2, ChevronRight,
  Globe, MapPin, ShieldCheck, Trophy, Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { BusinessQuestDetail } from "@/lib/data/quests";

interface Props {
  quest: BusinessQuestDetail;
  currentUserId: string | null;
}

const PROOF_ICON: Record<string, string> = {
  photo: "📷", video: "🎥", screenshot: "📸", photo_text: "📝",
  qr: "🔲", bill_document: "📄", location: "📍", manual: "✋", none: "✅",
};

const REWARD_ICON: Record<string, string> = {
  cash: "💵", coupon: "🏷", gift_card: "🎁", discount: "%",
  product: "📦", subscription: "📱", voucher: "🎫",
  certificate: "🏆", internship: "💼", custom: "⭐", other: "🎀",
};

export default function BusinessQuestDetailClient({ quest, currentUserId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [hasJoined, setHasJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) { setLoading(false); return; }
    supabase.from("quest_participants")
      .select("id")
      .eq("quest_id", quest.id)
      .eq("user_id", currentUserId)
      .maybeSingle()
      .then(({ data }) => { setHasJoined(!!data); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, quest.id]);

  const handleJoin = async () => {
    if (!currentUserId) { router.push(`/login?redirectTo=/quests/${quest.id}`); return; }
    setJoining(true);
    const { error } = await supabase.from("quest_participants").upsert(
      { quest_id: quest.id, user_id: currentUserId, verification_status: "pending", joined_at: new Date().toISOString() },
      { onConflict: "quest_id,user_id", ignoreDuplicates: true }
    );
    if (!error) {
      setHasJoined(true);
      // Track join event
      supabase.from("quest_events").insert({ quest_id: quest.id, user_id: currentUserId, event_type: "join" }).then(() => { /* fire and forget */ }, () => { /* ignore errors */ });
    }
    setJoining(false);
  };

  const formatDate = (d: string | null) => d
    ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const isVerifiedBiz = quest.business_verification === "verified";

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <h1 className="text-[15px] font-black text-gray-900 flex-1 truncate">{quest.title}</h1>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
          quest.quest_status === "active" ? "bg-green-50 text-green-700" :
          quest.quest_status === "completed" ? "bg-purple-50 text-purple-700" :
          "bg-gray-100 text-gray-500"
        }`}>
          {quest.quest_status.charAt(0).toUpperCase() + quest.quest_status.slice(1)}
        </span>
      </div>

      {/* Cover Image */}
      {(quest.cover_url || quest.thumbnail_url) && (
        <div className="w-full h-52 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={quest.cover_url ?? quest.thumbnail_url ?? ""} alt={quest.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-5 py-5 max-w-lg mx-auto flex flex-col gap-5">

        {/* Business info */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
            {quest.business_logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={quest.business_logo} alt={quest.business_name ?? ""} className="w-full h-full object-cover" />
              : <span className="text-xl font-black text-gray-400">{(quest.business_name ?? "B").charAt(0)}</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-gray-900 truncate">{quest.business_name ?? "Business"}</p>
              {isVerifiedBiz && <ShieldCheck size={15} className="text-blue-600 shrink-0" />}
            </div>
            <p className="text-xs text-gray-400">Quest Creator</p>
          </div>
          {quest.destination_link && (
            <a href={quest.destination_link} target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Globe size={16} className="text-blue-600" />
            </a>
          )}
        </div>

        {/* Quest info */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-xl font-black text-gray-900 mb-2">{quest.title}</h2>
          {quest.category && (
            <span className="inline-block text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full mb-3">{quest.category}</span>
          )}
          {quest.description && <p className="text-sm text-gray-600 leading-relaxed mb-4">{quest.description}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Users size={15} className="text-blue-500 shrink-0" />
              <span>{quest.participant_count} Participants</span>
            </div>
            {quest.location_name && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <MapPin size={15} className="text-blue-500 shrink-0" />
                <span className="truncate">{quest.location_name}</span>
              </div>
            )}
            {quest.start_date && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar size={15} className="text-blue-500 shrink-0" />
                <span>Starts {formatDate(quest.start_date)}</span>
              </div>
            )}
            {quest.end_date && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar size={15} className="text-blue-500 shrink-0" />
                <span>Ends {formatDate(quest.end_date)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tasks */}
        {quest.tasks.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-[15px] font-black text-gray-900 mb-4">
              Quest Tasks ({quest.tasks.length})
            </h3>
            <div className="flex flex-col gap-3">
              {quest.tasks.map((task, i) => (
                <div key={task.id} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-black text-xs mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{task.title}</p>
                      {task.is_required && <span className="text-[10px] font-semibold text-red-500">Required</span>}
                      <span className="text-xs text-gray-400">{PROOF_ICON[task.proof_type] ?? "📋"} {task.proof_type}</span>
                    </div>
                    {task.description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{task.description}</p>}
                    {task.instructions && <p className="text-xs text-blue-600 mt-1 italic">ℹ {task.instructions}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rewards */}
        {quest.rewards.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Trophy size={18} className="text-amber-500" />
              <h3 className="text-[15px] font-black text-gray-900">Rewards</h3>
            </div>
            <div className="flex flex-col gap-3">
              {quest.rewards.map(reward => (
                <div key={reward.id} className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <span className="text-xl shrink-0">{REWARD_ICON[reward.reward_type] ?? "🎀"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{reward.title}</p>
                    {reward.rank_from && (
                      <p className="text-xs text-amber-600 font-semibold">
                        🏅 Rank {reward.rank_from}{reward.rank_to && reward.rank_to !== reward.rank_from ? `–${reward.rank_to}` : ""}
                      </p>
                    )}
                  </div>
                  {reward.value && (
                    <span className="text-sm font-black text-green-600 shrink-0">{reward.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rules */}
        {(quest.rules || quest.eligibility) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-[15px] font-black text-gray-900 mb-3">Rules & Eligibility</h3>
            {quest.eligibility && (
              <div className="mb-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Eligibility</p>
                <p className="text-sm text-gray-600 leading-relaxed">{quest.eligibility}</p>
              </div>
            )}
            {quest.rules && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Rules</p>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{quest.rules}</p>
              </div>
            )}
          </div>
        )}

        {/* If joined, show tasks progress link */}
        {hasJoined && (
          <Link href={`/quests/${quest.id}/tasks`}>
            <div className="bg-blue-600 rounded-2xl px-5 py-4 flex items-center gap-3 hover:bg-blue-700 transition-colors">
              <CheckCircle2 size={22} className="text-white shrink-0" />
              <div className="flex-1">
                <p className="text-white font-black text-[15px]">View My Progress</p>
                <p className="text-blue-200 text-xs">Submit proof and track your tasks</p>
              </div>
              <ChevronRight size={20} className="text-white shrink-0" />
            </div>
          </Link>
        )}
      </div>

      {/* Sticky CTA */}
      {!loading && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 py-4 safe-area-bottom">
          {hasJoined ? (
            <Link href={`/quests/${quest.id}/tasks`}>
              <button className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold text-[15px]">
                Continue Quest →
              </button>
            </Link>
          ) : quest.quest_status === "completed" ? (
            <button disabled className="w-full h-12 rounded-xl bg-gray-200 text-gray-500 font-bold text-[15px] cursor-not-allowed">
              Quest Ended
            </button>
          ) : (
            <button onClick={handleJoin} disabled={joining}
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[15px] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {joining
                ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Joining…</>
                : "Join Quest"
              }
            </button>
          )}
        </div>
      )}
    </div>
  );
}
