/**
 * app/(app)/explore/page.tsx — Explore / Challenge Discovery
 *
 * Server component: fetches featured + trending challenges from Supabase
 * and passes them as props to ExploreClient (which owns the filter chip
 * state and search bar). FeaturedCard/TrendingRow components live in
 * ExploreClient so they remain purely client-side.
 */

import Link from "next/link";
import { Flame, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getFeaturedChallenges, getTrendingChallenges } from "@/lib/data/challenges";
import { ExploreClient } from "./ExploreClient";

/* ── Public types — re-exported so ExploreClient and challenges.ts can import */
export interface FeaturedChallenge {
  id: string;
  title: string;
  creatorName: string;
  coverImageUrl: string;
  memberCount: number;
  durationLabel: string;
  verified: boolean;
}

export interface TrendingChallenge {
  id: string;
  title: string;
  creatorName: string;
  thumbnailUrl: string;
  currentDay: number;
  totalDays: number;
  memberCount: number;
  progressPercent: number;
  visibility: "public" | "private";
  isParticipant: boolean;
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default async function ExplorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [featured, trending] = await Promise.all([
    getFeaturedChallenges(supabase),
    getTrendingChallenges(supabase, user?.id ?? null),
  ]);

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Sticky top bar (matches feed page) ───────────────────────── */}
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-outline-variant">
        <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-container flex items-center justify-center">
              <Flame size={16} className="text-on-primary" aria-hidden="true" />
            </div>
            <span className="type-label-caps text-secondary tracking-widest font-semibold">
              STRIV
            </span>
          </div>
          <Link
            href="/settings"
            aria-label="Settings"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors duration-150"
          >
            <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* Client-side interactive content */}
      <ExploreClient featured={featured} trending={trending} />
    </div>
  );
}
