"use client";
/**
 * /business/profile — Public-facing Business Profile preview
 * Shows how the business appears to users on STRIVUP.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Edit2, Globe, MapPin, ShieldCheck, Store, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile, type BusinessProfile } from "@/lib/data/business";
import { getBusinessQuests, type Quest } from "@/lib/data/businessQuests";

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-headline-md font-black text-on-surface">{value}</span>
      <span className="text-label-sm text-on-surface-variant font-medium mt-0.5">{label}</span>
    </div>
  );
}

export default function BusinessProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [bp, setBp] = useState<BusinessProfile | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [completedQuests, setCompletedQuests] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const profile = await getMyBusinessProfile(supabase);
      if (!profile?.onboarding_done) { router.replace("/business/onboarding"); return; }
      setBp(profile);

      // Fetch quests
      const q = await getBusinessQuests(supabase, profile.id, { limit: 20 });
      setQuests(q);
      setTotalParticipants(q.reduce((sum, quest) => sum + quest.participant_count, 0));
      setCompletedQuests(q.filter(quest => quest.quest_status === "completed").length);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!bp) return null;

  const name = bp.business_name || "Your Business";
  const city = [bp.city, bp.state].filter(Boolean).join(", ");
  const activeQuests = quests.filter(q => q.quest_status === "active");

  return (
    <div className="min-h-screen bg-surface pb-28">
      {/* Header */}
      <div className="bg-surface-container-lowest border-b border-outline-variant px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <Link aria-label="Back" href="/business/dashboard"><ArrowLeft size={22} className="text-on-surface-variant" /></Link>
        <h1 className="text-body-lg font-black text-on-surface flex-1">Business Profile</h1>
        <button onClick={() => router.push("/business/settings")}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-outline-variant text-sm font-semibold text-on-surface-variant bg-surface-container-lowest hover:bg-surface-container-low">
          <Edit2 size={14} /> Edit
        </button>
      </div>

      <div className="max-w-lg mx-auto">
        {/* Cover / Header card */}
        <div className="bg-surface-container-lowest border-b border-outline-variant px-5 pt-6 pb-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-20 h-20 rounded-2xl bg-surface-container overflow-hidden border border-outline-variant shrink-0 flex items-center justify-center">
              {bp.logo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={bp.logo_url} alt={name} className="w-full h-full object-cover" />
                : <Store size={32} className="text-on-surface-variant" />
              }
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-headline-md font-black text-on-surface leading-tight">{name}</h1>
                {bp.verification_status === "verified" && (
                  <ShieldCheck size={18} className="text-secondary shrink-0" />
                )}
              </div>
              {bp.business_username && <p className="text-sm text-on-surface-variant">@{bp.business_username}</p>}
              {bp.category && (
                <span className="inline-block mt-1 text-xs font-semibold text-secondary bg-secondary-fixed px-2.5 py-0.5 rounded-full">
                  {bp.category}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {bp.description && (
            <p className="text-sm text-on-surface-variant leading-relaxed mb-4">{bp.description}</p>
          )}

          {/* Location + Website */}
          <div className="flex flex-col gap-1.5 mb-4">
            {city && (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <MapPin size={14} className="text-on-surface-variant shrink-0" />
                <span>{city}</span>
              </div>
            )}
            {bp.website && (
              <a href={bp.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-secondary hover:underline">
                <Globe size={14} className="shrink-0" />
                <span className="truncate">{bp.website.replace(/^https?:\/\/(www\.)?/, "")}</span>
              </a>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-around py-3 border-t border-b border-outline-variant">
            <StatBadge label="Quests" value={quests.length} />
            <div className="w-px h-8 bg-surface-container" />
            <StatBadge label="Active" value={activeQuests.length} />
            <div className="w-px h-8 bg-surface-container" />
            <StatBadge label="Participants" value={totalParticipants.toLocaleString()} />
            <div className="w-px h-8 bg-surface-container" />
            <StatBadge label="Completed" value={completedQuests} />
          </div>

          {/* Verification status */}
          {bp.verification_status !== "verified" && (
            <div className={`mt-4 px-4 py-3 rounded-xl flex items-center gap-3 ${
              bp.verification_status === "submitted" || bp.verification_status === "under_review"
                ? "bg-secondary-fixed border border-secondary-fixed-dim"
                : bp.verification_status === "rejected"
                ? "bg-error-container border border-error-outline"
                : "bg-warning-container border border-warning-outline"
            }`}>
              <span className="text-lg">
                {bp.verification_status === "submitted" || bp.verification_status === "under_review" ? "⏳"
                 : bp.verification_status === "rejected" ? "✕"
                 : "⚠"}
              </span>
              <div className="flex-1">
                <p className={`text-sm font-bold ${
                  bp.verification_status === "submitted" || bp.verification_status === "under_review" ? "text-secondary"
                  : bp.verification_status === "rejected" ? "text-on-error-container"
                  : "text-on-warning-container"
                }`}>
                  {bp.verification_status === "submitted" || bp.verification_status === "under_review"
                    ? "Verification Under Review"
                    : bp.verification_status === "rejected"
                    ? "Verification Rejected"
                    : "Verification Incomplete"}
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {bp.verification_status === "submitted" || bp.verification_status === "under_review"
                    ? "Your business will be verified within 24–48 hours."
                    : bp.verification_status === "rejected"
                    ? bp.rejection_reason ?? "Please check your details and resubmit."
                    : "Complete verification to publish Quests."}
                </p>
              </div>
              {(bp.verification_status === "rejected" || bp.verification_status === "draft" || bp.verification_status === "incomplete") && (
                <button onClick={() => router.push("/business/settings")}
                  className="text-xs font-bold text-secondary shrink-0">
                  Fix →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Active Quests */}
        <div className="px-5 py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body-lg font-black text-on-surface">
              {activeQuests.length > 0 ? "Active Quests" : "Your Quests"}
            </h2>
            <button onClick={() => router.push("/business/quests")}
              className="text-sm text-secondary font-semibold">View all</button>
          </div>

          {quests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant">
              <div className="w-14 h-14 rounded-2xl bg-secondary-fixed flex items-center justify-center">
                <span className="text-2xl">🏆</span>
              </div>
              <p className="text-sm font-semibold text-on-surface-variant">No Quests yet</p>
              <p className="text-xs text-on-surface-variant max-w-xs">Create your first Quest to start attracting participants.</p>
              <button onClick={() => router.push("/business/quests/new")}
                className="h-9 px-5 rounded-xl bg-secondary text-white text-sm font-bold">
                Create Quest
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(activeQuests.length > 0 ? activeQuests : quests).slice(0, 5).map(quest => (
                <div key={quest.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden flex gap-3 p-3">
                  <div className="w-16 h-16 rounded-xl bg-surface-container overflow-hidden shrink-0 flex items-center justify-center">
                    {quest.cover_url || quest.thumbnail_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={quest.cover_url ?? quest.thumbnail_url ?? ""} alt={quest.title} className="w-full h-full object-cover" />
                      : <span className="text-2xl">🏆</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0 py-0.5">
                    <p className="text-sm font-bold text-on-surface line-clamp-1">{quest.title}</p>
                    {quest.category && <p className="text-xs text-on-surface-variant">{quest.category}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                        <Users size={11} />{quest.participant_count} participants
                      </div>
                      <span className={`text-label-sm font-bold px-2 py-0.5 rounded-full ${
                        quest.quest_status === "active" ? "bg-success-container text-on-success-container"
                        : quest.quest_status === "completed" ? "bg-purple-50 text-purple-700"
                        : "bg-surface-container text-on-surface-variant"
                      }`}>
                        {quest.quest_status.charAt(0).toUpperCase() + quest.quest_status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
