"use client";
import { useState } from "react";

/**
 * src/components/features/FeedCard.tsx
 *
 * Shared proof-of-work post card with scroll-triggered fade-in.
 * Used by both the Home Feed (/feed) and individual Challenge Detail pages.
 *
 * Data contract: FeedPost type is the single source of truth.
 * To swap to real Supabase data, pass rows from:
 *   supabase.from("proof_submissions").select("*, profiles(*)") → map to FeedPost
 */

import Image from "next/image";
import { BadgeCheck, Flame, MessageCircle, ThumbsUp, Flag, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { createClient } from "@/lib/supabase/client";

/* ── Public type ─────────────────────────────────────────────────────────── */
export interface FeedPost {
  id: string;
  authorName: string;
  authorAvatarUrl: string;
  verified: boolean;
  category: string;
  dayLabel: string;   // e.g. "2H AGO"
  streakDay: number;  // e.g. 45
  proofImageUrl: string;
  caption: string;
  likeCount: number;
  commentCount: number;
  adminRemoved: boolean;
}

/* ── FeedCard ────────────────────────────────────────────────────────────── */
export function FeedCard({ post }: { post: FeedPost }) {
  const [ref, visible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.08 });
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState<string>("other");
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const handleReport = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      alert("You must be logged in to report.");
      return;
    }

    const { error } = await supabase.from("proof_reports").insert({
      proof_id: post.id,
      reporter_id: user.id,
      reason: reportReason,
      status: "pending"
    });

    if (error) {
      alert("Failed to submit report.");
      console.error(error);
    } else {
      setReportSubmitted(true);
      setIsReporting(false);
      setTimeout(() => setReportSubmitted(false), 3000);
    }
  };

  return (
    <div
      ref={ref}
      className={[
        "transition-all duration-500 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5",
      ].join(" ")}
    >
      <Card bordered padding="none" className="overflow-hidden">
        {/* ── Header: avatar + meta + streak badge ── */}
        <div className="flex items-start justify-between gap-3 p-4 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-surface-variant">
              <Image
                src={post.authorAvatarUrl}
                alt={post.authorName}
                fill
                className="object-cover"
                unoptimized // DiceBear SVGs
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="type-headline-sm text-on-surface font-semibold truncate">
                  {post.authorName}
                </span>
                {post.verified && (
                  <BadgeCheck
                    size={15}
                    className="text-secondary flex-shrink-0"
                    aria-label="Verified"
                  />
                )}
              </div>
              <p className="type-label-caps text-on-surface-variant text-[10px] leading-tight mt-0.5">
                {post.category} &bull; {post.dayLabel}
              </p>
            </div>
          </div>
          {/* Streak badge */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-primary-container rounded-full px-2.5 py-1 flex-shrink-0">
              <Flame size={12} className="text-secondary-fixed-dim" aria-hidden="true" />
              <span className="type-label-caps text-on-primary text-[10px] font-semibold">
                DAY {post.streakDay}
              </span>
            </div>
          </div>
        </div>

        {/* ── Proof image (16:9) ── */}
        <div className="relative w-full aspect-video bg-surface-variant flex items-center justify-center">
          {post.adminRemoved ? (
            <div className="flex flex-col items-center gap-2 text-on-surface-variant p-4 text-center">
              <ShieldAlert size={32} />
              <p className="type-body-md font-semibold text-on-surface">Content removed</p>
              <p className="type-body-sm text-on-surface-variant">This content was removed by a moderator.</p>
            </div>
          ) : (
            <>
              <Image
                src={post.proofImageUrl}
                alt={`Proof of work by ${post.authorName}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 640px"
              />
              {/* Reporting UI Overlay */}
              {isReporting && (
                <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-4">
                  <div className="bg-surface p-4 rounded-xl shadow-lg w-full max-w-sm">
                    <h3 className="type-headline-sm text-on-surface mb-2 font-semibold">Report Content</h3>
                    <select 
                      className="w-full p-2 mb-4 rounded-lg bg-surface-container border border-outline-variant text-on-surface type-body-md"
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                    >
                      <option value="sexual_content">Sexual Content</option>
                      <option value="violence">Violence</option>
                      <option value="hate">Hate Speech</option>
                      <option value="fake_proof">Fake Proof</option>
                      <option value="harassment">Harassment</option>
                      <option value="spam">Spam</option>
                      <option value="other">Other</option>
                    </select>
                    <div className="flex justify-end gap-2">
                      <button 
                        className="px-4 py-2 type-body-sm font-medium text-on-surface-variant"
                        onClick={() => setIsReporting(false)}
                      >
                        Cancel
                      </button>
                      <button 
                        className="px-4 py-2 type-body-sm font-medium bg-error text-on-error rounded-lg"
                        onClick={handleReport}
                      >
                        Submit Report
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Caption ── */}
        <div className="px-4 pt-3 pb-2">
          <p className="type-body-md text-on-surface leading-relaxed line-clamp-3">
            {post.caption}
          </p>
        </div>

        {/* ── Like / comment row ── */}
        <div className="flex items-center justify-between px-4 pb-4 pt-1">
          <div className="flex items-center gap-5">
            <button
              type="button"
              className="flex items-center gap-1.5 text-on-surface-variant hover:text-secondary transition-colors duration-150 group"
              aria-label={`${post.likeCount} likes`}
            >
              <ThumbsUp
                size={16}
                strokeWidth={1.75}
                className="group-hover:scale-110 transition-transform duration-150"
                aria-hidden="true"
              />
              <span className="type-body-md text-sm">{post.likeCount}</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 text-on-surface-variant hover:text-secondary transition-colors duration-150 group"
              aria-label={`${post.commentCount} comments`}
            >
              <MessageCircle
                size={16}
                strokeWidth={1.75}
                className="group-hover:scale-110 transition-transform duration-150"
                aria-hidden="true"
              />
              <span className="type-body-md text-sm">{post.commentCount}</span>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            {reportSubmitted && (
              <span className="type-body-sm text-success text-xs">Reported</span>
            )}
            <button
              type="button"
              className="text-on-surface-variant hover:text-error transition-colors duration-150 group"
              aria-label="Report content"
              onClick={() => setIsReporting(true)}
              disabled={post.adminRemoved}
            >
              <Flag
                size={16}
                strokeWidth={1.75}
                className="group-hover:scale-110 transition-transform duration-150"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
