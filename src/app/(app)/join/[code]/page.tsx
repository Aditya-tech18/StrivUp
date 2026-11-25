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
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Camera, Flag, Link2Off, LockKeyhole, Users } from "lucide-react";
import { BrandMark, UserAvatar } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { joinByInviteCode } from "@/lib/data/invites";
import {
  getInviteSharePreview,
  buildShareDescription,
  formatTenure,
  type SharePreview,
} from "@/lib/data/share";
import { JoinForm, type InviteJoinState } from "./JoinForm";

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
    const destination = `/join/${encodeURIComponent(code)}?auto=1`;
    return (
      <InviteLanding preview={preview} unavailable={!preview} backHref="/">
        <Link href={`/login?redirectTo=${encodeURIComponent(destination)}`} className={INVITE_ACTION}>
          <LockKeyhole size={18} aria-hidden="true" />
          {preview ? "Join challenge" : "Sign in"}
        </Link>
        {preview ? <p className="text-center text-xs text-on-surface-variant">Sign in or create an account to accept your invite.</p> : null}
      </InviteLanding>
    );
  }

  // The Server Action bounced back here because the code was wrong, rotated,
  // or the challenge is gone.
  if (error) {
    return (
      <InviteLanding preview={null} unavailable backHref="/feed">
        <Link href="/explore" className={INVITE_ACTION}>Browse challenges</Link>
      </InviteLanding>
    );
  }

  const preview = await getInviteSharePreview(code);

  /** Server Action: perform the join, then hand off to the challenge. */
  async function accept(): Promise<InviteJoinState> {
    "use server";

    const client = await createClient();
    const { challengeId, error: joinError } = await joinByInviteCode(client, code);

    if (joinError || !challengeId) {
      return { error: joinError ?? "We couldn't join this challenge. Please try again." };
    }

    redirect(`/challenges/${challengeId}`);
  }

  /* A visitor returning from sign-in already chose Join. Start one POST after
     hydration; the form tracks the actual pending result and allows retry. */
  const autoAccept = auto === "1";

  return (
    <InviteLanding preview={preview} backHref="/feed">
      <JoinForm action={accept} autoAccept={autoAccept} />
      <Link
        href="/feed"
        className="flex min-h-11 items-center justify-center rounded-xl bg-surface-container-low px-4 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
      >
        Not now
      </Link>
    </InviteLanding>
  );
}

const INVITE_ACTION = "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary-container px-4 text-center font-bold text-on-secondary-container transition-opacity hover:opacity-90";

function InviteLanding({ preview, unavailable = false, backHref, children }: {
  preview: SharePreview | null;
  unavailable?: boolean;
  backHref: string;
  children: ReactNode;
}) {
  const tenure = preview ? formatTenure(preview.startDate, preview.endDate) : null;

  return (
    <div className="min-h-[calc(100svh-var(--bottom-nav-h))] bg-surface text-on-surface md:min-h-screen">
      <header className="border-b border-outline-variant/60 bg-surface pt-safe">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-1 sm:px-6">
          <Link href={backHref} aria-label="Go back" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface-container">
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          <p className="flex-1 font-display text-base font-extrabold tracking-tight sm:text-lg">Challenge invite</p>
          <BrandMark variant="mark" height={23} />
        </div>
      </header>

      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 sm:pt-6">
        {unavailable ? (
          <div className="space-y-3 rounded-2xl bg-surface-container-low p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-surface-container-high text-on-surface-variant">
              <Link2Off size={22} aria-hidden="true" />
            </span>
            <h1 className="font-display text-2xl font-extrabold tracking-tight">This invite link doesn&apos;t work</h1>
            <p className="text-sm leading-relaxed text-on-surface-variant">It may have been replaced by a newer link, or the challenge may no longer exist. Ask whoever invited you for a fresh one.</p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl bg-surface-container-low p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary-fixed text-on-secondary-fixed">
                  {preview?.imageUrl ? (
                    <Image src={preview.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                  ) : <Flag size={26} aria-hidden="true" />}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="inline-flex items-center gap-1 rounded-full bg-streak px-2 py-0.5 text-xs font-bold text-on-streak">
                    <LockKeyhole size={12} aria-hidden="true" /> Invite link
                  </p>
                  <h1 className="break-words font-display text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl">{preview?.title ?? "Join this challenge"}</h1>
                  {preview?.organizerName ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-on-surface-variant">
                      <UserAvatar src={preview.organizerImageUrl} size={20} />
                      Hosted by <span className="font-semibold text-on-surface">{preview.organizerName}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {preview ? (
              <section aria-labelledby="invite-details" className="space-y-3 rounded-2xl bg-surface-container-low p-4 sm:p-5">
                <h2 id="invite-details" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
                  <Flag size={18} className="text-secondary" aria-hidden="true" /> Challenge details
                </h2>
                {preview.imageUrl ? (
                  <div className="relative aspect-[2.6] overflow-hidden rounded-xl bg-surface-container-high">
                    <Image src={preview.imageUrl} alt="" fill sizes="(max-width: 575px) 90vw, 496px" className="object-cover" preload />
                    <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" />
                  </div>
                ) : null}
                <div className={tenure ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
                  {tenure ? (
                    <div className="space-y-1 rounded-xl bg-surface-container-high/65 px-3 py-2.5">
                      <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-on-surface-variant uppercase">
                        <CalendarDays size={15} aria-hidden="true" /> Dates
                      </p>
                      <p className="text-sm font-semibold">{tenure}</p>
                    </div>
                  ) : null}
                  <div className="space-y-1 rounded-xl bg-surface-container-high/65 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-on-surface-variant uppercase">
                      <Users size={15} className="text-streak-ink" aria-hidden="true" /> Members
                    </p>
                    <p className="text-sm font-semibold">{preview.participantCount.toLocaleString()} joined</p>
                  </div>
                </div>
              </section>
            ) : null}

            <div className="flex items-start gap-3 rounded-2xl bg-surface-container-low p-4 sm:p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-container-high text-streak-ink">
                <Camera size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display font-extrabold tracking-tight">Daily check-ins</h2>
                <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">Post proof each day and build a streak with the people in your challenge.</p>
              </div>
            </div>
          </>
        )}

        <footer className="sticky bottom-[var(--bottom-nav-h)] z-10 -mx-4 space-y-2 bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:bottom-0">
          {children}
        </footer>
      </div>
    </div>
  );
}
