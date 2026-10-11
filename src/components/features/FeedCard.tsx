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
import Link from "next/link";
import { BadgeCheck, Flame, MessageCircle, ThumbsUp, Flag, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { createClient } from "@/lib/supabase/client";
import { ProofComments } from "@/components/features/ProofComments";
import { clampAspect } from "@/lib/image";
import { PeopleListSheet } from "@/components/features/people/PeopleList";
import { getPostLikers, type PersonCard } from "@/lib/data/social";
import { Facepile } from "@/components/features/people/Facepile";

/* ── Public type ─────────────────────────────────────────────────────────── */
export interface FeedPost {
  id: string;
  authorName: string;
  authorAvatarUrl: string;
  verified: boolean;
  category: string;
  dayLabel: string; // e.g. "2H AGO"
  streakDay: number; // e.g. 45
  proofImageUrl: string;
  /** Natural pixel size, when known. Null for proofs uploaded before
   *  dimensions were recorded — those fall back to a 4:3 box. */
  mediaWidth: number | null;
  mediaHeight: number | null;
  caption: string;
  likeCount: number;
  /** A few of the people who liked it, for the facepile line. */
  likePreview?: PersonCard[];
  commentCount: number;
  /** Has the current viewer already liked this proof? */
  viewerHasLiked: boolean;
  /** Needed so the proof owner can moderate comments on their own post. */
  authorId: string;
  adminRemoved: boolean;
}

/* ── FeedCard ────────────────────────────────────────────────────────────── */
export function FeedCard({ post, viewerId = null }: { post: FeedPost; viewerId?: string | null }) {
  const [ref, visible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.08 });
  // Optimistic like state. The server is the truth, but a like that waits for
  // a round trip feels broken, so the UI moves first and rolls back on failure.
  const [liked, setLiked] = useState(post.viewerHasLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [likersOpen, setLikersOpen] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [showComments, setShowComments] = useState(false);

  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState<string>("other");
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const handleToggleLike = async () => {
    if (!viewerId || likeBusy || post.adminRemoved) return;

    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((n) => n + (wasLiked ? -1 : 1));
    setLikeBusy(true);

    const supabase = createClient();
    const { error } = wasLiked
      ? await supabase.from("proof_likes").delete().eq("proof_id", post.id).eq("user_id", viewerId)
      : await supabase.from("proof_likes").insert({ proof_id: post.id, user_id: viewerId });

    if (error) {
      // Roll back to exactly what we had, rather than guessing a value.
      setLiked(wasLiked);
      setLikeCount((n) => n + (wasLiked ? 1 : -1));
    }
    setLikeBusy(false);
  };

  const handleReport = async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("You must be logged in to report.");
      return;
    }

    const { error } = await supabase.from("proof_reports").insert({
      proof_id: post.id,
      // The live column is reported_by, not reporter_id. With the wrong name
      // PostgREST rejects the whole insert, so every report failed.
      reported_by: user.id,
      reason: reportReason,
      status: "pending",
    });

    if (error) {
      // (proof_id, reported_by) is unique, so a second report on the same post
      // is a conflict rather than a fault — say so instead of "failed".
      alert(
        error.code === "23505"
          ? "You've already reported this post. Our moderators are on it."
          : "Failed to submit report."
      );
      setIsReporting(false);
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
          {/* The avatar and name are the obvious way to reach someone's
              profile, and until now neither was a link — tapping a person in
              the feed simply did nothing. /u accepts a UUID as well as a
              username, which matters because most accounts have no username. */}
          <Link
            href={`/u/${post.authorId}`}
            className="flex items-center gap-3 min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1"
            aria-label={`View ${post.authorName}'s profile`}
          >
            <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-surface-variant">
              <Image
                src={post.authorAvatarUrl}
                alt=""
                fill
                className="object-cover"
                unoptimized // DiceBear SVGs
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-headline-md text-on-surface font-semibold truncate hover:underline">
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
              <p className="text-overline text-on-surface-variant text-label-sm leading-tight mt-0.5">
                {post.category} &bull; {post.dayLabel}
              </p>
            </div>
          </Link>
          {/* Streak badge */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-primary-container rounded-full px-2.5 py-1 flex-shrink-0">
              <Flame size={12} className="text-secondary-fixed-dim" aria-hidden="true" />
              <span className="text-overline text-on-primary text-label-sm font-semibold">
                DAY {post.streakDay}
              </span>
            </div>
          </div>
        </div>

        {/* ── Proof image ──
            Laid out at the image's own aspect ratio rather than forced into
            16:9, which used to crop the top and bottom off every portrait
            phone photo. clampAspect bounds it to 4:5–1.91:1 so a panorama or a
            full-page screenshot cannot take over the feed; inside that range,
            which is nearly every real photo, nothing is cropped at all.
            Setting it as a style keeps the box reserved before the image
            loads, so the feed does not jump as pictures arrive. */}
        <div
          className="relative w-full bg-surface-variant flex items-center justify-center"
          style={{ aspectRatio: clampAspect(post.mediaWidth, post.mediaHeight) }}
        >
          {post.adminRemoved ? (
            <div className="flex flex-col items-center gap-2 text-on-surface-variant p-4 text-center">
              <ShieldAlert size={32} />
              <p className="text-body-md font-semibold text-on-surface">Content removed</p>
              <p className="text-body-sm text-on-surface-variant">This content was removed by a moderator.</p>
            </div>
          ) : (
            <>
              <Image
                src={post.proofImageUrl}
                alt={`Proof of work by ${post.authorName}`}
                fill
                // contain, not cover: the container is already the right shape,
                // so the only images this affects are the clamped extremes —
                // and letterboxing those beats cutting content out of them.
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 640px"
              />
              {/* Reporting UI Overlay */}
              {isReporting && (
                <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-4">
                  <div className="bg-surface p-4 rounded-xl elev-5 w-full max-w-sm">
                    <h3 className="text-headline-md text-on-surface mb-2 font-semibold">Report Content</h3>
                    <select aria-label="Report reason" 
                      className="w-full p-2 mb-4 rounded-xl bg-surface-container border border-outline-variant text-on-surface text-body-md"
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
                        className="px-4 py-2 text-body-sm font-medium text-on-surface-variant tap-target"
                        onClick={() => setIsReporting(false)}
                      >
                        Cancel
                      </button>
                      <button 
                        className="px-4 py-2 text-body-sm font-medium bg-error text-on-error rounded-xl tap-target"
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
          <p className="text-body-md text-on-surface leading-relaxed line-clamp-3">
            {post.caption}
          </p>
        </div>

        {/* ── Like / comment row ── */}
        <div className="flex items-center justify-between px-4 pb-4 pt-1">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={handleToggleLike}
              disabled={!viewerId || post.adminRemoved}
              aria-pressed={liked}
              aria-label={liked ? `Unlike, ${likeCount} likes` : `Like, ${likeCount} likes`}
              className={[
                "flex items-center gap-1.5 transition-colors duration-150 group",
                "disabled:cursor-default disabled:opacity-50",
                liked ? "text-secondary" : "text-on-surface-variant hover:text-secondary",
              ].join(" ")}
            >
              <ThumbsUp
                size={16}
                strokeWidth={1.75}
                // Filled once liked, so the state reads at a glance rather than
                // depending on a colour difference alone.
                fill={liked ? "currentColor" : "none"}
                className="group-hover:scale-110 transition-transform duration-150"
                aria-hidden="true"
              />
              <span className="text-body-md text-sm">{likeCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowComments((v) => !v)}
              aria-expanded={showComments}
              aria-label={`${commentCount} comments`}
              className={[
                "flex items-center gap-1.5 transition-colors duration-150 group",
                showComments ? "text-secondary" : "text-on-surface-variant hover:text-secondary",
              ].join(" ")}
            >
              <MessageCircle
                size={16}
                strokeWidth={1.75}
                className="group-hover:scale-110 transition-transform duration-150"
                aria-hidden="true"
              />
              <span className="text-body-md text-sm">{commentCount}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {reportSubmitted && (
              <span className="text-body-sm text-success text-xs">Reported</span>
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

        {/* "N likes", tappable, the way Instagram does it. Kept out of the
            like button itself: that button toggles your own like, and one
            control cannot both toggle and open a list without one of the two
            being a surprise. */}
        {likeCount > 0 && (
          <div className="px-4 pb-3 -mt-1">
            <Facepile
              people={post.likePreview ?? []}
              total={likeCount}
              verb="Liked by"
              noun="like"
              onOpen={() => setLikersOpen(true)}
            />
          </div>
        )}
      </Card>

      <PeopleListSheet
        open={likersOpen}
        title="Likes"
        viewerId={viewerId}
        emptyMessage="No likes yet."
        onClose={() => setLikersOpen(false)}
        load={() => getPostLikers(createClient(), post.id, viewerId)}
      />

      {showComments ? (
        <ProofComments
          proofId={post.id}
          viewerId={viewerId}
          proofOwnerId={post.authorId}
          onCountChange={(d) => setCommentCount((n) => Math.max(0, n + d))}
        />
      ) : null}
    </div>
  );
}
