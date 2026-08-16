/**
 * app/(app)/feed/page.tsx — STRIV Growth Feed
 *
 * Server component: fetches approved proof_submissions joined with profiles
 * and challenges, ordered by submitted_at desc, limit 20.
 *
 * To paginate: add a `page` searchParam and pass offset to getFeedPosts.
 */

import Link from "next/link";
import { CirclePlus, Flame, Settings, SquarePlus } from "lucide-react";
import { Badge } from "@/components/ui";
import { FeedCard } from "@/components/features/FeedCard";
import { createClient } from "@/lib/supabase/server";
import { getFeedPosts } from "@/lib/data/feed";

/* ── Page ────────────────────────────────────────────────────────────────── */
export default async function FeedPage() {
  const supabase = await createClient();
  const posts = await getFeedPosts(supabase, { limit: 20 });

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Sticky top bar ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-outline-variant">
        <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-container flex items-center justify-center">
              <Flame size={16} className="text-on-primary" aria-hidden="true" />
            </div>
            <span className="type-label-caps text-secondary tracking-widest font-semibold">
              STRIV
            </span>
          </div>
          {/* Settings */}
          <Link
            href="/settings"
            aria-label="Settings"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors duration-150"
          >
            <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">

        {/* ── Hero action row ───────────────────────────────────────── */}
        <section aria-label="Quick actions" className="grid grid-cols-2 gap-3">
          <Link
            href="/explore"
            className={[
              "flex items-center justify-center gap-2",
              "h-12 rounded-xl px-4",
              "bg-primary text-on-primary",
              "hover:opacity-90 active:opacity-80",
              "transition-opacity duration-150",
              "type-body-lg font-semibold text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
            ].join(" ")}
          >
            <CirclePlus size={18} strokeWidth={2} aria-hidden="true" />
            Join a Challenge
          </Link>
          <Link
            href="/challenges/new"
            className={[
              "flex items-center justify-center gap-2",
              "h-12 rounded-xl px-4",
              "bg-secondary text-on-secondary",
              "hover:opacity-90 active:opacity-80",
              "transition-opacity duration-150",
              "type-body-lg font-semibold text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
            ].join(" ")}
          >
            <SquarePlus size={18} strokeWidth={2} aria-hidden="true" />
            Create Challenges
          </Link>
        </section>

        {/* ── Feed section header ───────────────────────────────────── */}
        <section aria-label="Growth Feed">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="type-headline-sm text-on-surface font-semibold">
                Growth Feed
              </h2>
              <p className="type-label-caps text-on-surface-variant text-[10px] mt-0.5">
                RECENT ACTIVITY
              </p>
            </div>
            <Badge variant="secondary">Live</Badge>
          </div>

          {/* ── Feed cards / empty state ──────────────────────────── */}
          {posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post) => (
                <FeedCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-6 py-10 text-center">
              <p className="type-headline-sm text-on-surface font-semibold mb-1">
                No posts yet
              </p>
              <p className="type-body-md text-on-surface-variant text-sm">
                Approved proof submissions will appear here.
                Join a challenge and upload your first proof!
              </p>
            </div>
          )}
        </section>

        {/* ── End-of-feed spacer for bottom nav clearance ──────────── */}
        <div className="h-4" aria-hidden="true" />
      </div>
    </div>
  );
}
