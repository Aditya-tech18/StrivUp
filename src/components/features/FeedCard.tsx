"use client";

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
import { BadgeCheck, Flame, MessageCircle, ThumbsUp } from "lucide-react";
import { Card } from "@/components/ui";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";

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
}

/* ── FeedCard ────────────────────────────────────────────────────────────── */
export function FeedCard({ post }: { post: FeedPost }) {
  const [ref, visible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.08 });

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
          <div className="flex items-center gap-1 bg-primary-container rounded-full px-2.5 py-1 flex-shrink-0">
            <Flame size={12} className="text-secondary-fixed-dim" aria-hidden="true" />
            <span className="type-label-caps text-on-primary text-[10px] font-semibold">
              DAY {post.streakDay}
            </span>
          </div>
        </div>

        {/* ── Proof image (16:9) ── */}
        <div className="relative w-full aspect-video bg-surface-variant">
          <Image
            src={post.proofImageUrl}
            alt={`Proof of work by ${post.authorName}`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 640px"
          />
        </div>

        {/* ── Caption ── */}
        <div className="px-4 pt-3 pb-2">
          <p className="type-body-md text-on-surface leading-relaxed line-clamp-3">
            {post.caption}
          </p>
        </div>

        {/* ── Like / comment row ── */}
        <div className="flex items-center gap-5 px-4 pb-4 pt-1">
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
      </Card>
    </div>
  );
}
