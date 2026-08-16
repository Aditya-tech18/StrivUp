"use client";

/**
 * ChallengeDetailClient.tsx — all interactive UI for a challenge detail page.
 *
 * Receives server-fetched props from page.tsx — no mock data here.
 *
 * Upload state machine: idle → uploading → pending | error
 *   "pending" = proof inserted with verification_status = 'pending'
 *   Nothing auto-approves yet; the feed only shows 'approved' posts.
 *
 * day_number is calculated from joinedAt (date the user joined this challenge).
 */

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  Filter,
  Flame,
  Loader2,
  Trophy,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { FeedCard, type FeedPost } from "@/components/features/FeedCard";
import { createClient } from "@/lib/supabase/client";

/* ── Public types ─────────────────────────────────────────────────────────── */
export interface ChallengeDetail {
  id: string;
  title: string;
  creatorName: string;
  bannerUrl: string;
  memberCount: number;
  activeCount: number;
  successPercent: number;
  currentStreak: number;
  currentDay: number;
  totalDays: number;
  todayTask: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  avatarUrl: string;
  daysCompleted: number;
  totalDays: number | null; // null = Indefinite challenge (no fixed duration)
  badge?: "champion" | "leader";
}

/* ── Props ────────────────────────────────────────────────────────────────── */
export interface ChallengeDetailClientProps {
  challenge: ChallengeDetail;
  leaderboard: LeaderboardEntry[];
  feed: FeedPost[];
  userId: string | null;
  joinedAt: string | null; // ISO timestamp, null if not a participant
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

/** Day number relative to the user's joined_at date (1-indexed, min 1) */
function calcDayNumber(joinedAt: string | null): number {
  if (!joinedAt) return 1;
  const ms = Date.now() - new Date(joinedAt).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

/* ── Upload state machine ─────────────────────────────────────────────────── */
type UploadState = "idle" | "uploading" | "pending" | "error";

function useUploadStateMachine(challengeId: string, userId: string | null, joinedAt: string | null) {
  const [state, setState] = useState<UploadState>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trigger = () => inputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting same file
    if (!file) return;

    setState("uploading");
    setPreview(null);
    setUploadError(null);

    try {
      if (!userId) throw new Error("You must be signed in to upload proof.");

      const supabase = createClient();

      // 1. Calculate day_number from joined_at
      const dayNumber = calcDayNumber(joinedAt);

      // 2. Upload file to proof-media bucket
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/proofs/${challengeId}/${dayNumber}-${Date.now()}.${ext}`;
      const { error: storageError } = await supabase.storage
        .from("proof-media")
        .upload(path, file, { upsert: false });
      if (storageError) throw storageError;

      const { data: { publicUrl } } = supabase.storage
        .from("proof-media")
        .getPublicUrl(path);

      // 3. Insert proof_submission row (verification_status defaults to 'pending')
      const { error: insertError } = await supabase
        .from("proof_submissions")
        .insert({
          challenge_id: challengeId,
          user_id: userId,
          day_number: dayNumber,
          media_url: publicUrl,
          verification_status: "pending",
          // caption is optional — add a caption field later if needed
        });
      if (insertError) throw insertError;

      // 4. Generate data URL for preview
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setPreview(dataUrl);
      setState("pending");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
      setState("error");
    }
  };

  const reset = () => {
    setState("idle");
    setPreview(null);
    setUploadError(null);
  };

  return { state, preview, uploadError, inputRef, trigger, handleFile, reset };
}

/* ── Page client component ────────────────────────────────────────────────── */
export function ChallengeDetailClient({
  challenge,
  leaderboard,
  feed,
  userId,
  joinedAt,
}: ChallengeDetailClientProps) {
  const upload = useUploadStateMachine(challenge.id, userId, joinedAt);

  return (
    <div className="min-h-screen bg-surface">

      {/* ── TopAppBar ────────────────────────────────────────────────── */}
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
            href="/alerts"
            aria-label="Notifications"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors"
          >
            <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto pb-8 space-y-5">

        {/* ── Banner ────────────────────────────────────────────────── */}
        <div className="relative">
          <div className="relative h-48 w-full bg-surface-variant overflow-hidden">
            <Image
              src={challenge.bannerUrl}
              alt={challenge.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 672px"
              priority
            />
          </div>

          {/* Overlapping title card */}
          <div className="mx-4 -mt-6 relative z-10">
            <Card bordered padding="md" className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="type-headline-sm text-on-surface font-semibold leading-tight">
                  {challenge.title}
                </h1>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Created by {challenge.creatorName}
                </p>
              </div>
              <div className="flex items-center gap-1 bg-secondary-container rounded-full px-3 py-1 flex-shrink-0">
                <Users size={12} className="text-on-secondary-container" aria-hidden="true" />
                <span className="type-label-caps text-on-secondary-container text-[10px] font-semibold">
                  {formatCount(challenge.memberCount)} MEMBERS
                </span>
              </div>
            </Card>
          </div>
        </div>

        <div className="px-4 space-y-5">

          {/* ── Stats row ───────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3" role="list" aria-label="Challenge statistics">
            {[
              { label: "ACTIVE",  value: challenge.activeCount.toLocaleString(), icon: null },
              { label: "SUCCESS", value: `${challenge.successPercent}%`,          icon: null },
              { label: "STREAK",  value: challenge.currentStreak,                 icon: <Flame size={14} className="text-secondary-fixed-dim" aria-hidden="true" /> },
            ].map(({ label, value, icon }) => (
              <Card key={label} bordered padding="sm" className="text-center" role="listitem">
                <p className="type-label-caps text-on-surface-variant text-[10px]">{label}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {icon}
                  <p className="font-bold text-on-surface text-xl leading-tight">{value}</p>
                </div>
              </Card>
            ))}
          </div>

          {/* ── Current Challenge card (dark navy gradient) ────────── */}
          <div
            className="rounded-xl p-5 space-y-4"
            style={{ background: "linear-gradient(135deg, #0d1c32 0%, #1a3a6b 100%)" }}
          >
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar size={12} className="text-white/60" aria-hidden="true" />
                <span className="type-label-caps text-white/60 text-[10px]">
                  CURRENT CHALLENGE
                </span>
              </div>
              <h2 className="text-white font-semibold text-base leading-snug">
                Day {challenge.currentDay}: {challenge.todayTask}
              </h2>
              <p className="text-white/50 text-xs mt-1">
                {challenge.currentDay} of {challenge.totalDays} days
              </p>
            </div>

            {/* Hidden file input */}
            <input
              ref={upload.inputRef}
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              onChange={upload.handleFile}
              aria-hidden="true"
            />

            {/* ── State: idle ── */}
            {upload.state === "idle" && (
              <button
                type="button"
                onClick={upload.trigger}
                disabled={!userId}
                className={[
                  "w-full h-11 rounded-lg bg-white text-primary",
                  "flex items-center justify-center gap-2",
                  "font-semibold text-sm",
                  "hover:bg-white/90 active:bg-white/80 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                  !userId ? "opacity-50 cursor-not-allowed" : "",
                ].join(" ")}
              >
                <Upload size={16} aria-hidden="true" />
                {userId ? "Upload Today's Proof" : "Sign in to upload proof"}
              </button>
            )}

            {/* ── State: uploading ── */}
            {upload.state === "uploading" && (
              <div className="w-full h-11 rounded-lg bg-white/10 flex items-center justify-center gap-2 text-white/80 text-sm font-medium">
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Uploading…
              </div>
            )}

            {/* ── State: pending (uploaded, awaiting approval) ── */}
            {upload.state === "pending" && (
              <div className="space-y-2">
                {upload.preview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={upload.preview}
                    alt="Proof preview"
                    className="w-full rounded-lg object-cover max-h-40"
                  />
                )}
                <div className="w-full h-11 rounded-lg bg-yellow-500/20 border border-yellow-400/30 flex items-center justify-center gap-2 text-yellow-300 text-sm font-medium">
                  <Clock size={16} aria-hidden="true" />
                  Pending review — we&apos;ll notify you when approved
                </div>
                <button
                  type="button"
                  onClick={upload.reset}
                  className="w-full text-white/40 text-xs hover:text-white/60 transition-colors"
                >
                  Upload again
                </button>
              </div>
            )}

            {/* ── State: error ── */}
            {upload.state === "error" && (
              <div className="space-y-2">
                {upload.uploadError && (
                  <p className="text-red-300 text-xs">{upload.uploadError}</p>
                )}
                <div className="w-full h-11 rounded-lg bg-red-500/20 border border-red-400/30 flex items-center justify-center gap-2 text-red-300 text-sm font-medium">
                  <XCircle size={16} aria-hidden="true" />
                  Upload failed. Try again.
                </div>
                <button
                  type="button"
                  onClick={upload.trigger}
                  className={[
                    "w-full h-11 rounded-lg bg-white text-primary",
                    "flex items-center justify-center gap-2",
                    "font-semibold text-sm",
                    "hover:bg-white/90 transition-colors",
                  ].join(" ")}
                >
                  <Upload size={16} aria-hidden="true" />
                  Retry Upload
                </button>
              </div>
            )}
          </div>

          {/* ── Leaderboard ───────────────────────────────────────────── */}
          <section aria-label="Leaderboard">
            <div className="flex items-center justify-between mb-3">
              <h2 className="type-headline-sm text-on-surface font-semibold">
                Leaderboard
              </h2>
              <Link
                href={`/challenges/${challenge.id}/leaderboard`}
                className="text-secondary text-sm font-semibold hover:underline"
              >
                View All
              </Link>
            </div>

            {leaderboard.length > 0 ? (
              <Card bordered padding="none">
                {leaderboard.map((entry, idx) => (
                  <div
                    key={entry.rank}
                    className={[
                      "flex items-center gap-3 px-4 py-3",
                      idx < leaderboard.length - 1 ? "border-b border-outline-variant" : "",
                    ].join(" ")}
                  >
                    {/* Rank */}
                    <span
                      className={[
                        "w-6 text-center font-bold text-sm flex-shrink-0",
                        entry.rank === 1 ? "text-yellow-500" : "text-on-surface-variant",
                      ].join(" ")}
                    >
                      {entry.rank}
                    </span>
                    {/* Avatar */}
                    <div className="relative w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-surface-variant">
                      <Image
                        src={entry.avatarUrl}
                        alt={entry.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    {/* Name + days */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-on-surface text-sm truncate">
                          {entry.name}
                        </span>
                        {entry.badge === "champion" && (
                          <Badge variant="secondary" className="text-[10px] !bg-yellow-100 !text-yellow-700">
                            Champion
                          </Badge>
                        )}
                        {entry.badge === "leader" && (
                          <Badge variant="default" className="text-[10px]">
                            Leader
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-on-surface-variant">
                      {entry.totalDays !== null
                        ? `${entry.daysCompleted}/${entry.totalDays} DAYS`
                        : `${entry.daysCompleted} DAY STREAK`}
                    </p>
                    </div>
                    {/* Trophy for #1 */}
                    {entry.rank === 1 && (
                      <Trophy size={18} className="text-yellow-500 flex-shrink-0" aria-label="Champion trophy" />
                    )}
                  </div>
                ))}
              </Card>
            ) : (
              <div className="rounded-xl border border-outline-variant px-6 py-5 text-center">
                <p className="text-on-surface-variant text-sm">
                  No streaks recorded yet. Be the first!
                </p>
              </div>
            )}
          </section>

          {/* ── Community Feed ────────────────────────────────────────── */}
          <section aria-label="Community Feed">
            <div className="flex items-center justify-between mb-3">
              <h2 className="type-headline-sm text-on-surface font-semibold">
                Community Feed
              </h2>
              <button
                type="button"
                className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors"
                aria-label="Filter feed"
              >
                <Filter size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {feed.length > 0 ? (
              <div className="space-y-4">
                {feed.map((post) => (
                  <FeedCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-outline-variant px-6 py-8 text-center">
                <p className="type-body-md text-on-surface-variant text-sm">
                  No approved posts yet.
                  Upload your proof above to be the first!
                </p>
              </div>
            )}
          </section>

        </div>

        {/* Bottom nav clearance */}
        <div className="h-4" aria-hidden="true" />
      </div>
    </div>
  );
}
