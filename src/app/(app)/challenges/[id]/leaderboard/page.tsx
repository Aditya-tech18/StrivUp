/**
 * app/(app)/challenges/[id]/leaderboard/page.tsx — Full Leaderboard
 *
 * Server component: fetches up to 50 participants ranked by current_streak
 * (longest_streak as tie-break) from the streaks view.
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getChallengeLeaderboard, getChallengeDetail } from "@/lib/data/challenges";
import { Card } from "@/components/ui";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LeaderboardPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const [challenge, entries] = await Promise.all([
    getChallengeDetail(supabase, id),
    getChallengeLeaderboard(supabase, id, 50),
  ]);

  if (!challenge) notFound();

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-outline-variant">
        <div className="flex items-center gap-3 px-4 h-14 max-w-2xl mx-auto">
          <Link
            href={`/challenges/${id}`}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors"
            aria-label="Back to challenge"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="type-headline-sm text-on-surface font-semibold leading-tight">
              Leaderboard
            </h1>
            <p className="text-xs text-on-surface-variant">{challenge.title}</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {entries.length > 0 ? (
          <Card bordered padding="none">
            {entries.map((entry, idx) => (
              <div
                key={entry.rank}
                className={[
                  "flex items-center gap-3 px-4 py-3",
                  idx < entries.length - 1 ? "border-b border-outline-variant" : "",
                ].join(" ")}
              >
                {/* Rank */}
                <span
                  className={[
                    "w-7 text-center font-bold flex-shrink-0",
                    entry.rank === 1 ? "text-yellow-500 text-base" : "text-on-surface-variant text-sm",
                  ].join(" ")}
                >
                  {entry.rank}
                </span>

                {/* Avatar */}
                <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-surface-variant">
                  <Image
                    src={entry.avatarUrl}
                    alt={entry.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>

                {/* Name + streak */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-on-surface text-sm truncate">{entry.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {entry.totalDays !== null
                      ? `${entry.daysCompleted}/${entry.totalDays} days`
                      : `${entry.daysCompleted} day streak`}
                  </p>
                </div>

                {/* Badge + trophy */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {entry.badge === "champion" && (
                    <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 rounded-full px-2 py-0.5">
                      Champion
                    </span>
                  )}
                  {entry.badge === "leader" && (
                    <span className="text-[10px] font-semibold text-secondary bg-secondary/10 rounded-full px-2 py-0.5">
                      Leader
                    </span>
                  )}
                  {entry.rank === 1 && (
                    <Trophy size={16} className="text-yellow-500" aria-label="Champion" />
                  )}
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center">
              <Trophy size={32} className="text-yellow-500" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="type-headline-sm text-on-surface font-semibold">
                No rankings yet
              </p>
              <p className="type-body-md text-on-surface-variant text-sm max-w-xs">
                Rankings appear once participants start building streaks.
              </p>
            </div>
          </div>
        )}

        <div className="h-4" aria-hidden="true" />
      </div>
    </div>
  );
}
