/**
 * app/(app)/join/[code]/page.tsx — invite link landing.
 *
 * The destination of every shared challenge link. Joins the signed-in user and
 * forwards them straight into the challenge, so the path from "tapped a link in
 * a WhatsApp group" to "inside the challenge" is one screen with no decisions.
 *
 * Signed-out visitors are sent to /login by src/proxy.ts (the "/join" prefix is
 * in APP_ROUTE_PREFIXES) carrying ?redirectTo, so they land back here after
 * authenticating and the join still completes.
 *
 * Joining is a write, so it happens in a Server Action behind an explicit tap
 * rather than during render — a GET that mutates would fire on every prefetch,
 * link preview and messaging-app crawler that touches the URL.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Flame, Link2Off, Users } from "lucide-react";
import { Button, ErrorState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { joinByInviteCode } from "@/lib/data/invites";

interface PageProps {
  // Next 16: both are Promises and must be awaited.
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}

export const metadata: Metadata = {
  title: "Join a challenge",
  // An invite link is a capability, not a page — never let it be indexed.
  robots: { index: false, follow: false },
};

export default async function JoinPage({ params, searchParams }: PageProps) {
  const [{ code }, { error }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/join/${encodeURIComponent(code)}`);
  }

  // The Server Action bounced back here because the code was wrong, rotated,
  // or the challenge is gone.
  if (error) {
    return (
      <ErrorState
        icon={<Link2Off size={24} className="text-on-surface-variant" aria-hidden="true" />}
        title="This invite link doesn't work"
        message="It may have been replaced by a newer link, or the challenge may no longer exist. Ask whoever invited you for a fresh one."
      >
        <Link href="/explore">
          <Button variant="primary">Browse challenges</Button>
        </Link>
      </ErrorState>
    );
  }

  // Preview what they're being invited to, without joining.
  // A private challenge is not SELECTable by a non-participant, so this is
  // expected to be null for exactly the case invites exist for. The invite is
  // still valid — we just can't show the title yet, so the copy degrades
  // gracefully instead of claiming the link is broken.
  const { data: preview } = await supabase
    .from("challenges")
    .select("id, title, duration_days")
    .eq("invite_code", code.trim().toUpperCase())
    .maybeSingle();

  const challenge = preview as
    | { id: string; title: string | null; duration_days: number | null }
    | null;

  /** Server Action: perform the join, then hand off to the challenge. */
  async function accept() {
    "use server";

    const client = await createClient();
    const { challengeId, error: joinError } = await joinByInviteCode(client, code);

    if (joinError || !challengeId) {
      redirect(`/join/${encodeURIComponent(code)}?error=1`);
    }

    redirect(`/challenges/${challengeId}`);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-gutter py-space-xl">
      <div className="rounded-xl bg-surface-container-lowest p-space-lg text-center elev-1 surface-raised">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
          <Flame size={26} className="text-secondary" aria-hidden="true" />
        </div>

        <p className="mt-space-md text-label-sm uppercase tracking-wider text-on-surface-variant">
          You&apos;ve been invited
        </p>

        <h1 className="mt-1 text-headline-lg-mobile text-on-surface">
          {challenge?.title ?? "Join this challenge"}
        </h1>

        <p className="mx-auto mt-space-xs max-w-sm text-body-md text-on-surface-variant">
          {challenge?.duration_days
            ? `${challenge.duration_days} days. Post proof every day — your streak is visible to everyone in the challenge. That's the point.`
            : "Post proof every day — your streak is visible to everyone in the challenge. That's the point."}
        </p>

        <form action={accept} className="mt-space-lg">
          <Button type="submit" variant="primary" size="lg" fullWidth>
            <Users size={18} aria-hidden="true" />
            Accept invite
          </Button>
        </form>

        <Link
          href="/feed"
          className="mt-space-md inline-block text-label-md font-medium text-on-surface-variant hover:text-on-surface"
        >
          Not now
        </Link>
      </div>
    </div>
  );
}
