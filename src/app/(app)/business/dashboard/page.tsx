"use client";

/**
 * /business/dashboard — Main business hub.
 * Shows: profile header, stats, business tools grid, active campaigns, recent activity.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen, ChevronRight, ClipboardCheck, Clock, Edit2, Plus, Shield, ShieldCheck, Star, Store, TrendingUp, Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Badge } from "@/components/ui";
import { getMyBusinessProfile, getBusinessVerifications, type BusinessProfile, type VerificationRequest } from "@/lib/data/business";

/* ── Status badge ─────────────────────────────────────────────────────── */
function VerificationBadge({ status }: { status: BusinessProfile["verification_status"] }) {
  const config: Record<BusinessProfile["verification_status"], { label: string; variant: "success" | "error" | "primary" | "default" | "outline" | "secondary" }> = {
    verified:     { label: "✓ Verified",          variant: "success" },
    submitted:    { label: "⏳ Under Review",       variant: "primary" },
    under_review: { label: "⏳ Under Review",       variant: "primary" },
    incomplete:   { label: "⚠ Incomplete",         variant: "default" },
    draft:        { label: "Draft",                 variant: "outline" },
    rejected:     { label: "✕ Rejected",            variant: "error" },
    suspended:    { label: "Suspended",             variant: "error" },
  };
  const c = config[status] ?? config.draft;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

/* ── Recent verification row ──────────────────────────────────────────── */
function VerificationRow({ req }: { req: VerificationRequest }) {
  const name = ((req.participant as unknown as { full_name: string | null; avatar_url: string | null; username: string | null } | null))?.full_name ?? "Unknown";
  const challenge = ((req.challenge as unknown as { title: string } | null))?.title ?? ((req.quest as unknown as { title: string } | null))?.title ?? "—";
  const statusConfig = {
    approved: { label: "Verified", color: "text-on-tertiary-container bg-tertiary-fixed" },
    pending:  { label: "Pending",  color: "text-amber-700 bg-amber-100" },
    rejected: { label: "Rejected", color: "text-error bg-error-container" },
    expired:  { label: "Expired",  color: "text-on-surface-variant bg-surface-container" },
  } as const;
  const sc = statusConfig[req.status as keyof typeof statusConfig] ?? statusConfig.expired;
  const timeAgo = formatTimeAgo(req.created_at);

  return (
    <div className="flex items-center gap-3 py-3 border-b border-outline-variant last:border-0">
      <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
        <span className="type-headline-sm text-secondary font-bold">{name.charAt(0).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="type-body-md font-semibold text-on-surface">{name}</p>
        <p className="type-body-md text-on-surface-variant truncate">{challenge}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.color}`}>{sc.label}</span>
        <span className="type-body-md text-on-surface-variant">{timeAgo}</span>
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ── Main ─────────────────────────────────────────────────────────────── */
export default function BusinessDashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [bp, setBp] = useState<BusinessProfile | null>(null);
  const [recentVerifications, setRecentVerifications] = useState<VerificationRequest[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const profile = await getMyBusinessProfile(supabase);
      if (!profile) { router.replace("/business/onboarding"); return; }
      if (!profile.onboarding_done) { router.replace("/business/onboarding"); return; }

      setBp(profile);

      // Fetch recent verifications
      const verifs = await getBusinessVerifications(supabase, profile.id, { limit: 5 });
      setRecentVerifications(verifs);

      // Fetch business challenges
      const { data: ch } = await supabase
        .from("challenges")
        .select("id, title, description, thumbnail_url, challenge_participants!challenge_id(count)")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);

      setChallenges(ch ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!bp) return null;

  const displayName = bp.business_name || "Your Business";
  const displayCity = [bp.city, bp.state].filter(Boolean).join(", ") || "";

  return (
    <div className="min-h-screen bg-surface pb-24">
      {/* ── Profile header ─────────────────────────────────────────── */}
      <div className="bg-surface-container-lowest border-b border-outline-variant px-5 py-5">
        <div className="flex items-start gap-4">
          {/* Logo */}
          <div className="w-16 h-16 rounded-2xl bg-surface-container border border-outline-variant overflow-hidden shrink-0 flex items-center justify-center">
            {bp.logo_url
              ? <img src={bp.logo_url} alt={displayName} className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
              : <Store size={28} className="text-on-surface-variant" />
            }
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="type-headline-sm text-on-surface">{displayName}</h1>
              <VerificationBadge status={bp.verification_status} />
            </div>
            {bp.business_username && (
              <p className="type-body-md text-on-surface-variant">@{bp.business_username}</p>
            )}
            {bp.category && <p className="type-body-md text-on-surface-variant">{bp.category}</p>}
            {displayCity && (
              <p className="type-body-md text-on-surface-variant">{displayCity}</p>
            )}
          </div>

          <Link href="/business/settings" aria-label="Edit profile">
            <div className="w-9 h-9 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center hover:bg-surface-container-high transition-colors">
              <Edit2 size={16} className="text-on-surface-variant" />
            </div>
          </Link>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-0 mt-5 border border-outline-variant rounded-xl overflow-hidden">
          {[
            { label: "Customers", value: bp.total_customers.toLocaleString() },
            { label: "Challenges", value: bp.total_challenges.toLocaleString() },
            { label: "Participants", value: bp.total_participants.toLocaleString() },
            { label: "Rating", value: bp.rating > 0 ? `${bp.rating}★` : "—" },
          ].map((s, i) => (
            <div key={s.label} className={`flex flex-col items-center py-3 px-1 bg-surface-container-lowest ${i > 0 ? "border-l border-outline-variant" : ""}`}>
              <span className="type-stat-value text-on-surface font-bold leading-none">{s.value}</span>
              <span className="type-label-caps text-on-surface-variant mt-0.5">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 py-5 flex flex-col gap-6">
        {/* ── Rejection notice ───────────────────────────────────────── */}
        {bp.verification_status === "rejected" && bp.rejection_reason && (
          <Card bordered padding="md" className="border-error/30 bg-error-container">
            <p className="type-body-md font-semibold text-error mb-1">⚠ Verification Rejected</p>
            <p className="type-body-md text-error">{bp.rejection_reason}</p>
            <Button variant="outline" size="sm" className="mt-3 border-error text-error" onClick={() => router.push("/business/onboarding")}>
              Resubmit
            </Button>
          </Card>
        )}

        {/* ── Business Tools ─────────────────────────────────────────── */}
        <div>
          <h2 className="type-headline-sm text-on-surface mb-1">Business Tools</h2>
          <p className="type-body-md text-on-surface-variant mb-4">Manage your challenges, verify participants and track your impact on STRIVUP.</p>

          <div className="grid grid-cols-2 gap-3">
            {/* Verification */}
            <Card bordered padding="md" className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                <ShieldCheck size={22} className="text-secondary" />
              </div>
              <div>
                <p className="type-body-md font-semibold text-on-surface">Verification</p>
                <p className="type-body-md text-on-surface-variant">Verify participant activities and business visits.</p>
              </div>
              <Button variant="primary" size="sm" onClick={() => router.push("/business/verification")}>
                Verify Participant →
              </Button>
            </Card>

            {/* Verification History */}
            <Card bordered padding="md" className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-variant flex items-center justify-center">
                <BookOpen size={22} className="text-on-surface-variant" />
              </div>
              <div>
                <p className="type-body-md font-semibold text-on-surface">Verification History</p>
                <p className="type-body-md text-on-surface-variant">View all past verifications.</p>
              </div>
              <Link href="/business/verification/history" className="type-body-md text-secondary font-semibold flex items-center gap-1">
                View all <ChevronRight size={14} />
              </Link>
            </Card>

            {/* Pending Requests */}
            <Card bordered padding="md" className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-variant flex items-center justify-center">
                <Clock size={22} className="text-on-surface-variant" />
              </div>
              <div>
                <p className="type-body-md font-semibold text-on-surface">Pending Requests</p>
                <p className="type-body-md text-on-surface-variant">Check and approve pending verifications.</p>
              </div>
              <Link href="/business/verification?filter=pending" className="type-body-md text-secondary font-semibold flex items-center gap-1">
                View <ChevronRight size={14} />
              </Link>
            </Card>

            {/* How Verification Works */}
            <Card bordered padding="md" className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-variant flex items-center justify-center">
                <ClipboardCheck size={22} className="text-on-surface-variant" />
              </div>
              <div>
                <p className="type-body-md font-semibold text-on-surface">How Verification Works</p>
                <p className="type-body-md text-on-surface-variant">Learn how the verification process works.</p>
              </div>
              <Link href="/business/verification/how-it-works" className="type-body-md text-secondary font-semibold flex items-center gap-1">
                Learn <ChevronRight size={14} />
              </Link>
            </Card>
          </div>
        </div>

        {/* ── Active Campaigns ────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="type-headline-sm text-on-surface">Your Active Campaigns</h2>
            <Link href="/challenges" className="type-body-md text-secondary font-semibold">View all</Link>
          </div>
          {challenges.length === 0 ? (
            <Card bordered padding="lg" className="flex flex-col items-center gap-3 text-center">
              <TrendingUp size={32} className="text-on-surface-variant" />
              <p className="type-body-lg text-on-surface">No campaigns yet</p>
              <p className="type-body-md text-on-surface-variant">Create your first challenge to start attracting customers.</p>
              <Button variant="primary" size="sm" onClick={() => router.push("/challenges/new")}>
                <Plus size={16} /> Create Challenge
              </Button>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {challenges.map((ch: any) => {
                const count = Array.isArray(ch.challenge_participants)
                  ? ch.challenge_participants.length
                  : (ch.challenge_participants?.[0]?.count ?? 0);
                return (
                  <Link key={ch.id} href={`/challenges/${ch.id}`}>
                    <Card bordered padding="md" className="flex items-center gap-3 hover:bg-surface-container-high transition-colors">
                      <div className="w-12 h-12 rounded-xl bg-secondary/10 overflow-hidden shrink-0 flex items-center justify-center">
                        {ch.thumbnail_url
                          ? <img src={ch.thumbnail_url} alt={ch.title} className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                          : <Star size={20} className="text-secondary" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="type-body-md font-semibold text-on-surface truncate">{ch.title}</p>
                        <p className="type-body-md text-on-surface-variant truncate">{ch.description}</p>
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-on-tertiary-container bg-tertiary-fixed px-2 py-0.5 rounded-full mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" /> Active
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="type-body-md font-bold text-on-surface">{count}</p>
                        <p className="type-body-md text-on-surface-variant">Participants</p>
                      </div>
                      <ChevronRight size={16} className="text-on-surface-variant shrink-0" />
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Recent Activity ─────────────────────────────────────────── */}
        {recentVerifications.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="type-headline-sm text-on-surface">Recent Activity</h2>
              <Link href="/business/verification/history" className="type-body-md text-secondary font-semibold">View all</Link>
            </div>
            <Card bordered padding="md">
              {recentVerifications.map(req => (
                <VerificationRow key={req.id} req={req} />
              ))}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
