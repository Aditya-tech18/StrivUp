/**
 * app/(app)/join/[code]/page.tsx — invite link landing.
 *
 * The destination of every shared challenge link, and therefore the page a
 * WhatsApp crawler hits. Two things follow from that:
 *
 *  1. It carries its own Open Graph metadata and an opengraph-image, built
 *     from get_invite_preview rather than a table read, because an invite
 *     normally points at a private challenge nobody anonymous can SELECT.
 *
 *  2. It renders for signed-out visitors instead of bouncing them. The proxy
 *     used to 302 this path to /login, which meant someone tapping an invite
 *     landed on a password field with no idea what they had been invited to,
 *     and the crawler scraped that same login page. Now they see the invite,
 *     and the sign-in detour carries them back here.
 *
 * Joining is still a write behind a session: it happens in a Server Action on
 * an explicit submit, never during render, so no prefetch or crawler can
 * trigger it.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Link2Off, Users } from "lucide-react";
import { BrandMark, Button, ErrorState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { joinByInviteCode } from "@/lib/data/invites";
import {
  getInviteSharePreview,
  buildShareDescription,
  formatTenure,
} from "@/lib/data/share";
import { SharePreviewLanding } from "@/components/features/share/SharePreviewLanding";
import { AutoSubmit } from "./AutoSubmit";

interface PageProps {
  // Next 16: both are Promises and must be awaited.
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string; auto?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const preview = await getInviteSharePreview(code);

  // An invite link is a capability, so it stays out of search results either
  // way. noindex does not stop a messaging app from reading og: tags, which
  // is the whole point of this block.
  const robots = { index: false, follow: false };

  if (!preview) {
    return { title: "Join a challenge", robots };
  }

  const description = buildShareDescription(preview);
  return {
    title: preview.title,
    description,
    robots,
    openGraph: {
      type: "article",
      siteName: "StrivUp",
      title: preview.title,
      description,
      url: `/join/${code}`,
    },
    twitter: {
      card: "summary_large_image",
      title: preview.title,
      description,
    },
  };
}

export default async function JoinPage({ params, searchParams }: PageProps) {
  const [{ code }, { error, auto }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* Signed out: show what the invite is for, then send them to sign in with
     the destination attached. `auto=1` survives the round trip so that the
     accept fires on the way back and they land inside the challenge rather
     than on this page a second time. */
  if (!user) {
    const preview = await getInviteSharePreview(code);
    return (
      <SharePreviewLanding
        preview={preview}
        destination={`/join/${encodeURIComponent(code)}?auto=1`}
        invited
      />
    );
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

  const preview = await getInviteSharePreview(code);
  const tenure = preview ? formatTenure(preview.startDate, preview.endDate) : null;

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

  /* Came back from signing in having already tapped Join. Asking them to tap
     it again would be asking twice for the same decision, so the form submits
     itself. It is still a POST from a real form, so the no-mutation-on-GET
     rule holds and the button below is the no-JavaScript path. */
  const autoAccept = auto === "1";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-gutter py-space-xl">
      <div className="rounded-xl bg-surface-container-lowest p-space-lg text-center elev-1 surface-raised">
        <div className="flex justify-center">
          <BrandMark variant="wordmark" height={28} priority />
        </div>

        <p className="mt-space-md text-label-sm uppercase tracking-wider text-on-surface-variant">
          You&apos;ve been invited
        </p>

        <h1 className="mt-1 text-headline-lg-mobile text-on-surface">
          {preview?.title ?? "Join this challenge"}
        </h1>

        {tenure && (
          <p className="mt-space-xs text-body-md text-on-surface-variant">{tenure}</p>
        )}

        <p className="mx-auto mt-space-xs max-w-sm text-body-md text-on-surface-variant">
          Post proof every day. Your streak is visible to everyone in the
          challenge, which is the point.
        </p>

        <form action={accept} className="mt-space-lg">
          <Button type="submit" variant="primary" size="lg" fullWidth>
            <Users size={18} aria-hidden="true" />
            {autoAccept ? "Joining…" : "Accept invite"}
          </Button>
          {autoAccept && <AutoSubmit />}
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
