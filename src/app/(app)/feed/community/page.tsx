import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, MessageSquare, ShieldCheck, User } from "lucide-react";
import { redirect } from "next/navigation";
import { AlertsBell, MobileMenu } from "@/components/ui";
import { getFeedPosts } from "@/lib/data/feed";
import { createClient } from "@/lib/supabase/server";
import { CommunityProofList } from "./CommunityProofList";

export const metadata: Metadata = {
  title: "Community Proof Feed",
  description: "See recent verified challenge proofs from the StrivUp community.",
};

export default async function CommunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=%2Ffeed%2Fcommunity");

  const posts = await getFeedPosts(supabase, { limit: 20, viewerId: user.id });

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface-container-lowest/95 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileMenu />
            <h1 className="truncate text-xl font-extrabold tracking-tight text-on-surface">
              Community
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <AlertsBell />
            <Link
              href="/profile"
              aria-label="Profile"
              className="grid size-11 place-items-center rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-secondary focus-visible:outline-2 focus-visible:outline-secondary"
            >
              <User size={20} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5 sm:px-6">
        <section
          aria-labelledby="verified-proofs-title"
          className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3.5"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-streak/15 text-streak-ink">
            <ShieldCheck size={21} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="verified-proofs-title" className="text-base font-bold text-on-surface">
              Verified proof feed
            </h2>
            <p className="mt-0.5 text-sm text-on-surface-variant">
              See what people have completed in StrivUp challenges.
            </p>
          </div>
        </section>

        {posts.length > 0 ? (
          <CommunityProofList posts={posts} viewerId={user.id} />
        ) : (
          <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 text-center">
            <MessageSquare size={26} className="mx-auto mb-3 text-secondary" aria-hidden="true" />
            <h2 className="text-lg font-bold text-on-surface">No recent proofs</h2>
            <Link
              href="/explore"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-secondary hover:underline focus-visible:outline-2 focus-visible:outline-secondary"
            >
              Explore challenges <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
