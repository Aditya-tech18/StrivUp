"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Filter } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";
import {
  getMyBusinessProfile,
  getBusinessVerifications,
  getVerificationInsights,
  type VerificationRequest,
} from "@/lib/data/business";

const FILTERS = ["all", "approved", "pending", "rejected", "expired"] as const;
type Filter = (typeof FILTERS)[number];

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function VerificationHistoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [verifs, setVerifs] = useState<VerificationRequest[]>([]);
  const [insights, setInsights] = useState({ total: 0, approved: 0, pending: 0, rejected: 0 });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const bp = await getMyBusinessProfile(supabase);
      if (!bp?.onboarding_done) { router.replace("/business/onboarding"); return; }
      const [v, ins] = await Promise.all([
        getBusinessVerifications(supabase, bp.id, { limit: 50 }),
        getVerificationInsights(supabase, bp.id),
      ]);
      setVerifs(v);
      setInsights(ins);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filter === "all" ? verifs : verifs.filter(v => v.status === filter);

  const statusConf = {
    approved: { label: "Verified",  cls: "text-on-tertiary-container bg-tertiary-fixed" },
    pending:  { label: "Pending",   cls: "text-amber-700 bg-amber-100" },
    rejected: { label: "Rejected",  cls: "text-error bg-error-container" },
    expired:  { label: "Expired",   cls: "text-on-surface-variant bg-surface-container" },
  } as const;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant bg-surface-container-lowest">
        <Link href="/business/verification" className="text-on-surface-variant hover:text-on-surface transition-colors">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="type-headline-sm text-on-surface flex-1">Verification History</h1>
        <Filter size={20} className="text-on-surface-variant" />
      </div>

      <div className="px-5 py-5 flex flex-col gap-5 max-w-lg mx-auto">
        {/* Insights */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total",    value: insights.total,    color: "text-on-surface" },
            { label: "Approved", value: insights.approved, color: "text-on-tertiary-container" },
            { label: "Pending",  value: insights.pending,  color: "text-amber-700" },
            { label: "Rejected", value: insights.rejected, color: "text-error" },
          ].map(s => (
            <Card key={s.label} bordered padding="sm" className="flex flex-col items-center py-3">
              <span className={`text-2xl font-black ${s.color}`}>{s.value}</span>
              <span className="type-label-caps text-on-surface-variant mt-0.5">{s.label}</span>
            </Card>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                "shrink-0 px-4 py-1.5 rounded-full type-body-md font-medium border transition-colors",
                filter === f
                  ? "bg-secondary text-on-secondary border-secondary"
                  : "bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:border-outline",
              ].join(" ")}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="type-body-lg text-on-surface-variant">No {filter === "all" ? "" : filter} verifications yet.</p>
          </div>
        ) : (
          <Card bordered padding="md">
            {filtered.map(req => {
              const name = ((req.participant as unknown as { full_name: string | null; avatar_url: string | null; username: string | null } | null))?.full_name ?? "Unknown";
              const challenge = ((req.challenge as unknown as { title: string } | null))?.title ?? ((req.quest as unknown as { title: string } | null))?.title ?? "—";
              const sc = statusConf[req.status as keyof typeof statusConf] ?? statusConf.expired;
              return (
                <div key={req.id} className="flex items-center gap-3 py-3 border-b border-outline-variant last:border-0">
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                    <span className="type-body-md font-bold text-secondary">{name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="type-body-md font-semibold text-on-surface">{name}</p>
                    <p className="type-body-md text-on-surface-variant truncate">{challenge}</p>
                    <p className="type-body-md text-on-surface-variant">{formatTimeAgo(req.created_at)}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${sc.cls}`}>{sc.label}</span>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
