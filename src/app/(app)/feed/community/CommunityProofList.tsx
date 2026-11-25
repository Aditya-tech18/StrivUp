"use client";

import { useState } from "react";
import { FeedCard, type FeedPost } from "@/components/features/FeedCard";

export function CommunityProofList({ posts, viewerId }: { posts: FeedPost[]; viewerId: string }) {
  const [challengeId, setChallengeId] = useState("");
  const challenges = new Map(posts.map((post) => [post.challengeId, post.challengeTitle]));
  const filtered =
    challengeId && challenges.has(challengeId)
      ? posts.filter((post) => post.challengeId === challengeId)
      : posts;

  return (
    <section aria-label="Recent proofs" className="flex min-w-0 flex-col gap-4">
      {challenges.size > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-2">
          <label
            htmlFor="community-challenge"
            className="px-2 text-sm font-semibold text-on-surface"
          >
            Filter recent proofs
          </label>
          <select
            id="community-challenge"
            value={challenges.has(challengeId) ? challengeId : ""}
            onChange={(event) => setChallengeId(event.target.value)}
            className="min-h-11 w-full min-w-0 rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface focus-visible:outline-2 focus-visible:outline-secondary sm:flex-1"
          >
            <option value="">All challenges</option>
            {Array.from(challenges, ([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </div>
      )}
      {filtered.map((post) => (
        <FeedCard key={post.id} post={post} viewerId={viewerId} />
      ))}
    </section>
  );
}
