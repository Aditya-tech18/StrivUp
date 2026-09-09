"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile, getBusinessVerifications, getVerificationInsights, type VerificationRequest } from "@/lib/data/business";

const FILTERS = ["all","approved","pending","rejected","expired"] as const;
type Filter = typeof FILTERS[number];

function timeAgo(d: string) {
  const m = Math.floor((Date.now()-new Date(d).getTime())/60000);
  if (m<60) return `${m}m ago`;
  const h=Math.floor(m/60); if (h<24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

export default function VerificationHistoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [verifs, setVerifs] = useState<VerificationRequest[]>([]);
  const [insights, setInsights] = useState({ total:0, approved:0, pending:0, rejected:0 });

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const bp = await getMyBusinessProfile(supabase);
      if (!bp?.onboarding_done) { router.replace("/business/onboarding"); return; }
      const [v, ins] = await Promise.all([
        getBusinessVerifications(supabase, bp.id, { limit:50 }),
        getVerificationInsights(supabase, bp.id),
      ]);
      setVerifs(v); setInsights(ins); setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filter === "all" ? verifs : verifs.filter(v => v.status === filter);

  const statusCfg = {
    approved: { label:"Verified",  cls:"text-green-700 bg-green-50 border-green-200" },
    pending:  { label:"Pending",   cls:"text-amber-700 bg-amber-50 border-amber-200" },
    rejected: { label:"Rejected",  cls:"text-red-700 bg-red-50 border-red-200" },
    expired:  { label:"Expired",   cls:"text-gray-500 bg-gray-50 border-gray-200" },
  } as const;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28">
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 sticky top-0 z-30">
        <Link href="/business/verification"><ArrowLeft size={22} className="text-gray-600" /></Link>
        <h1 className="text-[17px] font-black text-gray-900 flex-1">Verification History</h1>
      </div>

      <div className="px-5 py-5 max-w-lg mx-auto flex flex-col gap-5">
        {/* Insights */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label:"Total",    value:insights.total,    color:"text-gray-900" },
            { label:"Approved", value:insights.approved, color:"text-green-600" },
            { label:"Pending",  value:insights.pending,  color:"text-amber-600" },
            { label:"Rejected", value:insights.rejected, color:"text-red-600" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-3 flex flex-col items-center">
              <span className={`text-2xl font-black ${s.color}`}>{s.value}</span>
              <span className="text-[10px] text-gray-400 font-medium mt-0.5">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                filter===f ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center bg-white rounded-2xl border border-gray-100">
            <p className="text-sm text-gray-500">No {filter==="all" ? "" : filter} verifications yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {filtered.map(req => {
              const participant = req.participant as { full_name: string|null }|undefined;
              const pName = participant?.full_name ?? "Unknown";
              const challenge = (req.challenge as {title:string}|null)?.title ?? (req.quest as {title:string}|null)?.title ?? "—";
              const sc = statusCfg[req.status as keyof typeof statusCfg] ?? statusCfg.expired;
              return (
                <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 text-sm font-bold text-blue-600">
                    {pName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{pName}</p>
                    <p className="text-xs text-gray-400 truncate">{challenge}</p>
                    <p className="text-xs text-gray-400">{timeAgo(req.created_at)}</p>
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
