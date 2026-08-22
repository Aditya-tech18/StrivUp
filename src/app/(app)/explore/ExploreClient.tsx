"use client";

/**
 * ExploreClient.tsx — client component for the Explore page.
 *
 * Receives server-fetched data as props and owns all client-side state
 * (filter chips, search input, join state per challenge).
 *
 * Join flow (public challenges):
 *   idle → loading → joined (navigate to /challenges/[id])
 *   If unique-constraint error (already a participant) → treat as joined.
 *
 * Private challenges: show an inline toast on Request click.
 */

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  Flame,
  Loader2,
  Lock,
  Search,
  Users,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { FeaturedChallenge, TrendingChallenge } from "./page";

/* ── Filter chips ────────────────────────────────────────────────────────── */
const FILTER_CHIPS = [
  "Trending", "Premium", "Near Me", "My College", "Coding", "AI", "Fitness",
] as const;
type FilterChip = (typeof FILTER_CHIPS)[number];

/* ── Join helper ─────────────────────────────────────────────────────────── */
async function joinChallenge(challengeId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "not-authed" };

  const { error } = await supabase.from("challenge_participants").insert({
    challenge_id: challengeId,
    user_id: user.id,
    status: "active",
  });

  // Unique constraint violation = already a participant → treat as success
  if (error && !error.message.includes("duplicate") && !error.message.includes("unique")) {
    return { error: error.message };
  }
  return { error: null };
}

/* ── Private toast ───────────────────────────────────────────────────────── */
const PRIVATE_MSG = "Private challenges require an invitation — this isn't available yet.";

/* ── FeaturedCard ────────────────────────────────────────────────────────── */
function FeaturedCard({ challenge }: { challenge: FeaturedChallenge }) {
  return (
    <Link href={`/challenges/${challenge.id}`}>
      <Card padding="none" bordered className="flex-shrink-0 w-[280px] overflow-hidden">
        <div className="relative aspect-video w-full bg-surface-variant">
          <Image src={challenge.coverImageUrl} alt={challenge.title} fill className="object-cover" sizes="280px" />
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="text-[10px] shadow-sm">Featured</Badge>
          </div>
          {challenge.verified && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-white/70 backdrop-blur-sm px-2 py-0.5 border border-white/50">
              <CheckCircle2 size={11} className="text-secondary" aria-hidden="true" />
              <span className="text-[10px] font-semibold text-secondary leading-none">Verified</span>
            </div>
          )}
        </div>
        <div className="p-3 space-y-1.5">
          <h3 className="type-headline-sm text-on-surface font-semibold leading-snug line-clamp-2">{challenge.title}</h3>
          <p className="type-body-md text-on-surface-variant text-xs">by {challenge.creatorName}</p>
          <div className="flex items-center gap-3 pt-0.5">
            <span className="flex items-center gap-1 text-on-surface-variant text-xs">
              <Users size={12} aria-hidden="true" />{challenge.memberCount.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-on-surface-variant text-xs">
              <Calendar size={12} aria-hidden="true" />{challenge.durationLabel}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/* ── TrendingRow ─────────────────────────────────────────────────────────── */
function TrendingRow({
  challenge,
  onPrivateClick,
}: {
  challenge: TrendingChallenge;
  onPrivateClick: () => void;
}) {
  const router = useRouter();
  const [joinState, setJoinState] = useState<"idle" | "loading" | "joined">("idle");
  const [isPending, startTransition] = useTransition();
  const isPublic = challenge.visibility === "public";

  const handleJoin = () => {
    if (!isPublic) { onPrivateClick(); return; }
    if (joinState === "joined" || joinState === "loading") return;

    setJoinState("loading");
    startTransition(async () => {
      const { error } = await joinChallenge(challenge.id);
      if (error === "not-authed") {
        // Redirect to login then back
        router.push(`/login?next=/challenges/${challenge.id}`);
        return;
      }
      if (error) {
        // Generic error — reset, let user try again
        setJoinState("idle");
        return;
      }
      // Success: navigate to challenge
      setJoinState("joined");
      router.push(`/challenges/${challenge.id}`);
    });
  };

  return (
    <Card bordered padding="none" className="flex items-center gap-3 p-3">
      <Link href={`/challenges/${challenge.id}`} className="flex-shrink-0">
        <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-surface-variant">
          <Image src={challenge.thumbnailUrl} alt={challenge.title} fill className="object-cover" sizes="56px" />
        </div>
      </Link>
      <div className="flex-1 min-w-0 space-y-1">
        <h3 className="type-headline-sm text-on-surface font-semibold text-sm leading-tight line-clamp-1">{challenge.title}</h3>
        <p className="type-body-md text-on-surface-variant text-xs">{challenge.creatorName}</p>
        <div className="flex items-center gap-3 text-xs text-on-surface-variant">
          <span className="flex items-center gap-0.5">
            <Flame size={11} className="text-secondary-fixed-dim" aria-hidden="true" />
            Day {challenge.currentDay}/{challenge.totalDays}
          </span>
          <span className="flex items-center gap-1">
            <Users size={11} aria-hidden="true" />{challenge.memberCount.toLocaleString()}
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-surface-container" role="progressbar"
          aria-valuenow={challenge.progressPercent} aria-valuemin={0} aria-valuemax={100}
          aria-label={`${challenge.progressPercent}% complete`}>
          <div className="h-full rounded-full bg-secondary transition-all duration-500" style={{ width: `${challenge.progressPercent}%` }} />
        </div>
      </div>
      <div className="flex-shrink-0">
        {challenge.isParticipant ? (
          <Link
            href={`/challenges/${challenge.id}`}
            className={[
              "inline-flex items-center h-8 px-3 rounded-lg",
              "bg-secondary/10 text-secondary text-xs font-semibold",
              "hover:bg-secondary/20 transition-colors",
            ].join(" ")}
          >
            View →
          </Link>
        ) : joinState === "joined" ? (
          <div className="flex items-center gap-1 text-green-600 text-xs font-semibold">
            <CheckCircle2 size={14} aria-hidden="true" />
            Joined
          </div>
        ) : (
          <Button
            id={`join-${challenge.id}`}
            variant={isPublic ? "primary" : "outline"}
            size="sm"
            onClick={handleJoin}
            disabled={joinState === "loading" || isPending}
            aria-label={isPublic ? `Join ${challenge.title}` : `Request to join ${challenge.title}`}
          >
            {joinState === "loading" || isPending ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : isPublic ? (
              "Join"
            ) : (
              <span className="flex items-center gap-1">
                <Lock size={11} aria-hidden="true" />
                Request
              </span>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ── ExploreClient ───────────────────────────────────────────────────────── */
export interface ExploreClientProps {
  featured: FeaturedChallenge[];
  trending: TrendingChallenge[];
}

export function ExploreClient({ featured, trending }: ExploreClientProps) {
  const [activeChip, setActiveChip] = useState<FilterChip>("Trending");
  const [privateToast, setPrivateToast] = useState(false);

  const showPrivateToast = () => {
    setPrivateToast(true);
    setTimeout(() => setPrivateToast(false), 3500);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">

      {/* ── Private challenge toast ─────────────────────────────────── */}
      {privateToast && (
        <div
          role="status"
          aria-live="polite"
          className={[
            "fixed top-16 left-1/2 -translate-x-1/2 z-50",
            "flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg",
            "bg-on-surface text-surface text-sm font-medium",
            "animate-in fade-in slide-in-from-top-2 duration-200",
            "max-w-sm w-[calc(100%-2rem)]",
          ].join(" ")}
        >
          <Lock size={14} aria-hidden="true" className="flex-shrink-0" />
          {PRIVATE_MSG}
        </div>
      )}

      {/* ── Headline ─────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h1 className="type-headline-md text-on-surface font-semibold">Challenges</h1>
        <p className="type-body-md text-on-surface-variant">Discover communities that help you stay consistent.</p>
      </div>

      {/* ── Search ────────────────────────────────────────────────────── */}
      <div className="relative flex items-center">
        <span className="absolute left-4 text-on-surface-variant pointer-events-none flex items-center z-10">
          <Search size={17} aria-hidden="true" />
        </span>
        <input
          id="explore-search"
          type="search"
          placeholder="Search Challenges, Communities or Creators..."
          className={[
            "w-full h-11 pl-10 pr-4 rounded-full border border-outline-variant",
            "bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant",
            "text-[length:var(--font-size-body-lg)] transition-colors duration-150",
            "focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary",
          ].join(" ")}
          aria-label="Search challenges, communities or creators"
        />
      </div>

      {/* ── Filter chips ──────────────────────────────────────────────── */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" role="group" aria-label="Filter challenges">
        {FILTER_CHIPS.map((chip) => {
          const isActive = activeChip === chip;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => setActiveChip(chip)}
              aria-pressed={isActive}
              className={[
                "flex-shrink-0 h-8 px-4 rounded-full border text-sm font-medium",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1",
                isActive
                  ? "bg-secondary text-on-secondary border-secondary"
                  : "bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:bg-surface-container hover:text-on-surface",
              ].join(" ")}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* ── Featured Premium Challenges ─────────────────────────────── */}
      <section aria-label="Featured Premium Challenges">
        <h2 className="type-headline-sm text-on-surface font-semibold mb-3">Featured Premium Challenges</h2>
        {featured.length > 0 ? (
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
            {featured.map((c) => <FeaturedCard key={c.id} challenge={c} />)}
          </div>
        ) : (
          <p className="text-on-surface-variant text-sm">No featured challenges yet. Create one to get started!</p>
        )}
      </section>

      {/* ── Trending Challenges ─────────────────────────────────────── */}
      <section aria-label="Trending Challenges">
        <div className="flex items-center justify-between mb-3">
          <h2 className="type-headline-sm text-on-surface font-semibold">Trending Challenges</h2>
          <p className="type-label-caps text-on-surface-variant text-[10px]">ACTIVE NOW</p>
        </div>
        {trending.length > 0 ? (
          <div className="space-y-3">
            {trending.map((c) => (
              <TrendingRow key={c.id} challenge={c} onPrivateClick={showPrivateToast} />
            ))}
          </div>
        ) : (
          <p className="text-on-surface-variant text-sm">No challenges found. Be the first to create one!</p>
        )}
      </section>

      <div className="h-4" aria-hidden="true" />
    </div>
  );
}
