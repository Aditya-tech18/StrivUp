/**
 * app/(app)/creator/challenges/[id]/submissions/page.tsx
 *
 * Creator-only review queue for a challenge's proof submissions.
 * Auth check: if the current user is not the challenge's creator, return 404.
 * The page fetches all submissions server-side and passes them to
 * SubmissionsReviewClient for interactive approve/reject.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSubmissionsForReview } from "@/lib/data/tasks";
import { SubmissionsReviewClient } from "./SubmissionsReviewClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SubmissionsPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // 1. Get current user — must be authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  // 2. Verify this user is the challenge creator
  const { data: challenge, error } = await supabase
    .from("challenges")
    .select("id, title, creator_id")
    .eq("id", id)
    .single();

  if (error || !challenge || challenge.creator_id !== user.id) notFound();

  // 3. Fetch all submissions for this challenge
  const submissions = await getSubmissionsForReview(supabase, id, "all");

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
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-secondary" aria-hidden="true" />
            <h1 className="type-headline-sm text-on-surface font-semibold">
              Review Submissions
            </h1>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5">
        <SubmissionsReviewClient
          initialSubmissions={submissions}
          challengeTitle={challenge.title as string}
          reviewerId={user.id}
        />
        <div className="h-8" aria-hidden="true" />
      </div>
    </div>
  );
}
