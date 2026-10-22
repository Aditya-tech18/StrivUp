"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart2, ChevronDown, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { getMyBusinessProfile } from "@/lib/data/business";
import { getBusinessQuests, getQuestAnalytics, type Quest } from "@/lib/data/businessQuests";
import { getPhysicalQuestAnalytics } from "@/lib/data/activity";
import { PhysicalQuestAnalytics } from "@/components/features/activity";
import type { PhysicalQuestAnalyticsData } from "@/lib/activity/types";

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
  orderCodesGenerated: number;
  ordersVerified: number;
  billCodesEntered: number;
  ordersRejected: number;
}

function MetricCard({ label, value, sub, color = "text-on-surface" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 elev-1 surface-raised">
      <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-on-surface-variant mt-0.5">{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-on-surface-variant w-28 shrink-0">{label}</p>
      <div className="flex-1 h-7 bg-surface-container rounded-xl overflow-hidden">
        <div className={`h-full ${color} rounded-xl transition-all duration-500 flex items-center px-3`}
          style={{ width: `${Math.max(pct, 4)}%` }}>
          {pct > 15 && <span className="text-xs font-bold text-white">{value}</span>}
        </div>
      </div>
      {pct <= 15 && <span className="text-sm font-bold text-on-surface-variant w-8 shrink-0">{value}</span>}
      <span className="text-xs text-on-surface-variant w-10 shrink-0 text-right">{pct}%</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useLocale();
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [physical, setPhysical] = useState<PhysicalQuestAnalyticsData | null>(null);
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
    const [a, p] = await Promise.all([
      getQuestAnalytics(supabase, questId),
      // Returns null for a quest with no physical tasks, so the panel simply
      // does not render for quests that never had one.
      getPhysicalQuestAnalytics(supabase, questId),
    ]);
    setAnalytics(a);
    setPhysical(p);
    setLoadingAnalytics(false);
  };

  const selectedQuest = quests.find(q => q.id === selectedQuestId);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface pb-28">
      <div className="bg-surface-container-lowest border-b border-outline-variant px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <Link aria-label="Back" href="/business/dashboard"><ArrowLeft size={22} className="text-on-surface-variant" /></Link>
        <h1 className="text-body-lg font-black text-on-surface flex-1">{t("an.title")}</h1>
        <LanguageToggle className="shrink-0" />
      </div>

      <div className="px-5 py-5 mx-auto measure-page flex flex-col gap-5">
        {/* Quest selector */}
        {quests.length > 0 ? (
          <>
            <div className="relative">
              <select aria-label="Quest" value={selectedQuestId ?? ""} onChange={e => handleQuestChange(e.target.value)}
                className="w-full h-11 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 pr-10 text-sm font-semibold text-on-surface focus:outline-none focus:border-secondary appearance-none">
                {quests.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            </div>

            {loadingAnalytics ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : analytics ? (
              <>
                {/* Key metrics grid */}
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label={t("an.totalViews")}       value={analytics.views.toLocaleString()}       color="text-secondary" />
                  <MetricCard label={t("stat.participants")}       value={analytics.joins.toLocaleString()}       color="text-on-success-container" />
                  <MetricCard label={t("an.completions")}        value={analytics.completions.toLocaleString()} color="text-chart-3" />
                  <MetricCard label={t("an.completionRate")}    value={`${analytics.completionRate}%`}         color="text-on-warning-container" />
                  <MetricCard label={t("an.pendingProofs")}     value={analytics.pendingProofs}                color="text-warning" />
                  <MetricCard label={t("an.approvalRate")}      value={`${analytics.approvalRate}%`}           color="text-chart-2" />
                </div>

                {/* Physical quest performance — only for quests that have a
                    physical activity task (spec §53). */}
                {physical && physical.participants > 0 && (
                  <PhysicalQuestAnalytics data={physical} />
                )}

                {/* Funnel */}
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 elev-1 surface-raised">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={18} className="text-secondary" />
                    <h3 className="text-body-lg font-black text-on-surface">{t("an.funnel")}</h3>
                  </div>
                  <div className="flex flex-col gap-3">
                    {(analytics.orderCodesGenerated > 0 ? [
                      { label: "Views",                 value: analytics.views,               color: "bg-chart-1" },
                      { label: "Joins",                 value: analytics.joins,               color: "bg-chart-2" },
                      { label: t("an.codesGenerated"), value: analytics.orderCodesGenerated, color: "bg-chart-3" },
                      { label: t("an.ordersVerified"),       value: analytics.ordersVerified,      color: "bg-chart-4" },
                      { label: t("an.billCodesEntered"),    value: analytics.billCodesEntered,    color: "bg-chart-5" },
                      { label: t("an.questCompletions"),     value: analytics.completions,         color: "bg-chart-6" },
                    ] : [
                      { label: "Views",          value: analytics.views,                  color: "bg-chart-1" },
                      { label: "Joins",          value: analytics.joins,                  color: "bg-chart-2" },
                      { label: t("an.proofsSubmitted"),value: analytics.approvedProofs + analytics.rejectedProofs + analytics.pendingProofs, color: "bg-chart-3" },
                      { label: t("an.proofsApproved"),value: analytics.approvedProofs,         color: "bg-chart-5" },
                      { label: "Completions",    value: analytics.completions,            color: "bg-chart-6" },
                    ]).map(row => (
                      <FunnelBar key={row.label} label={row.label} value={row.value} max={Math.max(analytics.views, 1)} color={row.color} />
                    ))}
                  </div>
                </div>

                {/* Proof breakdown */}
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 elev-1 surface-raised">
                  <h3 className="text-body-lg font-black text-on-surface mb-4">{t("an.proofSubmissions")}</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col items-center p-3 bg-warning-container rounded-xl">
                      <span className="text-2xl font-black text-on-warning-container">{analytics.pendingProofs}</span>
                      <span className="text-xs text-on-warning-container font-medium mt-0.5">{t("an.pending")}</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-success-container rounded-xl">
                      <span className="text-2xl font-black text-on-success-container">{analytics.approvedProofs}</span>
                      <span className="text-xs text-on-success-container font-medium mt-0.5">{t("an.approved")}</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-error-container rounded-xl">
                      <span className="text-2xl font-black text-error">{analytics.rejectedProofs}</span>
                      <span className="text-xs text-error font-medium mt-0.5">{t("an.rejected")}</span>
                    </div>
                  </div>
                </div>

                {/* Quest details */}
                {selectedQuest && (
                  <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 elev-1 surface-raised">
                    <h3 className="text-body-lg font-black text-on-surface mb-3">{t("an.questInfo")}</h3>
                    <div className="flex flex-col gap-2">
                      {[
                        { label: "Status",    value: selectedQuest.quest_status.replace("_"," ").toUpperCase() },
                        { label: "Category",  value: selectedQuest.category ?? "—" },
                        { label: t("an.visibility"),value: selectedQuest.visibility.replace("_"," ") },
                        { label: "Created",   value: new Date(selectedQuest.created_at).toLocaleDateString("en-IN") },
                        ...(selectedQuest.end_date ? [{ label: "Ends", value: new Date(selectedQuest.end_date).toLocaleDateString("en-IN") }] : []),
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between py-2 border-b border-outline-variant last:border-0">
                          <span className="text-sm text-on-surface-variant">{row.label}</span>
                          <span className="text-sm font-semibold text-on-surface capitalize">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-20 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant elev-1 surface-raised">
            <BarChart2 size={36} className="text-on-surface-variant" />
            <p className="text-body-lg font-black text-on-surface">{t("an.emptyTitle")}</p>
            <p className="text-sm text-on-surface-variant max-w-xs">{t("an.emptyBody")}</p>
            <button onClick={() => router.push("/business/quests/new")}
              className="h-10 px-5 rounded-xl bg-secondary text-white text-sm font-bold tap-target">
              Create a Quest
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
