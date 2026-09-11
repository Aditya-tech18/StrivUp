"use client";
/**
 * /business/promote — Quest Promotion / Boost page.
 * MVP: UI + architecture ready. Payment integration pending.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import { getBusinessQuests, type Quest } from "@/lib/data/businessQuests";

const BUDGETS = [
  { label: "₹500",   value: 500,  reach: "500–1,000 users",   duration: "3 days" },
  { label: "₹1,000", value: 1000, reach: "1,000–2,500 users", duration: "7 days" },
  { label: "₹2,500", value: 2500, reach: "2,500–6,000 users", duration: "14 days" },
  { label: "₹5,000", value: 5000, reach: "6,000–15,000 users","duration": "30 days" },
];

export default function PromotePage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [selectedQuest, setSelectedQuest] = useState<string>("");
  const [selectedBudget, setSelectedBudget] = useState<typeof BUDGETS[0] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const bp = await getMyBusinessProfile(supabase);
      if (!bp?.onboarding_done) { router.replace("/business/onboarding"); return; }
      const q = await getBusinessQuests(supabase, bp.id, { limit: 20 });
      const activeOnes = q.filter(quest => quest.quest_status === "active");
      setQuests(activeOnes);
      if (activeOnes.length > 0) setSelectedQuest(activeOnes[0].id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const selectedQuestObj = quests.find(q => q.id === selectedQuest);

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28">
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <Link href="/business/dashboard"><ArrowLeft size={22} className="text-gray-600" /></Link>
        <h1 className="text-[17px] font-black text-gray-900 flex-1">Promote Quest</h1>
      </div>

      <div className="px-5 py-5 max-w-lg mx-auto flex flex-col gap-5">
        {/* What is promotion */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-black text-blue-900">Boost Your Quest Reach</h2>
              <p className="text-xs text-blue-700">Reach more STRIVUP users who match your audience</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: "👥", label: "More Participants" },
              { icon: "📈", label: "Higher Visibility" },
              { icon: "🎯", label: "Targeted Reach" },
            ].map(item => (
              <div key={item.label} className="bg-white/70 rounded-xl p-2.5 text-center">
                <p className="text-xl mb-1">{item.icon}</p>
                <p className="text-[10px] font-semibold text-blue-800">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quest selector */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-bold text-gray-900 mb-3">Select Quest to Promote</p>
          {quests.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">No active Quests to promote.</p>
              <button onClick={() => router.push("/business/quests/new")}
                className="h-9 px-5 rounded-xl bg-blue-600 text-white text-sm font-bold">
                Create a Quest First
              </button>
            </div>
          ) : (
            <div className="relative">
              <select value={selectedQuest} onChange={e => setSelectedQuest(e.target.value)}
                className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-4 pr-10 text-sm font-medium text-gray-700 focus:outline-none focus:border-blue-500 appearance-none">
                {quests.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}

          {selectedQuestObj && (
            <div className="mt-3 flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="w-12 h-12 rounded-xl bg-gray-200 overflow-hidden shrink-0">
                {selectedQuestObj.cover_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={selectedQuestObj.cover_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xl">🏆</div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{selectedQuestObj.title}</p>
                <p className="text-xs text-gray-400">{selectedQuestObj.participant_count} current participants</p>
              </div>
            </div>
          )}
        </div>

        {/* Budget selection */}
        {quests.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-sm font-bold text-gray-900 mb-1">Select Budget & Duration</p>
            <p className="text-xs text-gray-400 mb-4">Estimated reach is based on historical data and may vary.</p>
            <div className="grid grid-cols-2 gap-3">
              {BUDGETS.map(b => (
                <button key={b.value} type="button" onClick={() => setSelectedBudget(b)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedBudget?.value === b.value
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-100 bg-gray-50 hover:border-gray-200"
                  }`}>
                  <p className={`text-lg font-black mb-1 ${selectedBudget?.value === b.value ? "text-blue-700" : "text-gray-900"}`}>
                    {b.label}
                  </p>
                  <p className="text-[10px] text-gray-500 font-medium">{b.reach}</p>
                  <p className="text-[10px] text-gray-400">{b.duration}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-bold text-gray-900 mb-4">How Promotion Works</p>
          <div className="flex flex-col gap-3">
            {[
              { num: "1", text: "Your Quest appears in discovery feeds for relevant users" },
              { num: "2", text: "Targeted users matching your category and location see your Quest" },
              { num: "3", text: "More participants join → higher engagement → stronger impact" },
              { num: "4", text: "Budget is consumed only as your Quest receives promoted impressions" },
            ].map(step => (
              <div key={step.num} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[11px] font-black text-blue-600">{step.num}</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{step.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Payment pending notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <p className="text-sm font-bold text-amber-800 mb-1">💳 Payment Integration Coming Soon</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Paid promotion is currently in beta. We&apos;re integrating secure payment infrastructure.
            You can set up your promotion now and it will activate once payment is live.
          </p>
        </div>
      </div>

      {/* Sticky CTA */}
      {selectedBudget && quests.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 py-4">
          <div className="max-w-lg mx-auto flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-500">Selected budget:</span>
              <span className="font-black text-gray-900">{selectedBudget.label} · {selectedBudget.duration}</span>
            </div>
            <button
              onClick={() => alert("Payment integration coming soon. Your promotion setup has been saved.")}
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-all">
              <Zap size={18} /> Boost Quest — {selectedBudget.label}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
