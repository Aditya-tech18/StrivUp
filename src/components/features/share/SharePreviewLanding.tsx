/**
 * SharePreviewLanding — what a signed-out visitor sees on a shared link.
 *
 * Tapping a WhatsApp preview used to land on /login with the challenge name
 * nowhere in sight, which is a poor trade for someone who was just shown a
 * card: they arrive at a password field with no evidence they are in the
 * right place. This renders the same card the preview showed, then asks them
 * to sign in, carrying the destination so they land on the real page
 * afterwards.
 *
 * It is a server component and deliberately holds nothing but the public
 * preview fields. The task list, proof uploader, feed, leaderboard and join
 * action all stay behind the session check in the page above it.
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Flag, Link2Off, MapPin, Users, Zap } from "lucide-react";
import type { SharePreview } from "@/lib/data/share";
import { formatTenure } from "@/lib/data/share";
import { BrandMark, UserAvatar } from "@/components/ui";
import { ClosedBadge } from "@/components/features/participation/ClosedBadge";
import { isPastDeadline } from "@/lib/participation";

export function SharePreviewLanding({
  preview,
  destination,
  invited = false,
}: {
  preview: SharePreview | null;
  destination: string;
  /** Reached through an invite link, which changes the wording only. */
  invited?: boolean;
}) {
  const signIn = `/login?redirectTo=${encodeURIComponent(destination)}`;
  const action = "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary-container px-4 text-center font-bold text-on-secondary-container transition-opacity hover:opacity-90";

  const header = (
    <header className="border-b border-outline-variant/60 pt-safe">
      <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-1 sm:px-6">
        <Link href="/" aria-label="Back to StrivUp" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <p className="flex-1 font-display font-extrabold tracking-tight">{invited ? "Challenge invite" : preview?.kind === "quest" ? "Quest details" : "Challenge details"}</p>
        <BrandMark variant="mark" height={23} />
      </div>
    </header>
  );

  if (!preview) {
    return (
      <div className="min-h-[calc(100svh-var(--bottom-nav-h))] bg-surface text-on-surface md:min-h-screen">
        {header}
        <div className="mx-auto max-w-xl space-y-4 px-4 pt-4 sm:px-6 sm:pt-6">
          <section className="space-y-3 rounded-2xl bg-surface-container-low p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-surface-container-high text-on-surface-variant">
              <Link2Off size={22} aria-hidden="true" />
            </span>
            <h1 className="font-display text-2xl font-extrabold tracking-tight">This link is not available</h1>
            <p className="text-sm leading-relaxed text-on-surface-variant">
              {invited
                ? "This invite may have been replaced by a newer link, or the challenge may no longer exist. Ask whoever invited you for a fresh one."
                : "It may have been removed, or it may be private. Sign in if you were invited to it."}
            </p>
          </section>
          <Link href={signIn} className={action}>Sign in</Link>
        </div>
      </div>
    );
  }

  const tenure = formatTenure(preview.startDate, preview.endDate);
  const kindLabel = preview.kind === "challenge" ? "Challenge" : "Quest";
  const KindIcon = preview.kind === "challenge" ? Flag : MapPin;
  const closed = preview.closed || isPastDeadline(preview.endDate);

  return (
    <div className="min-h-[calc(100svh-var(--bottom-nav-h))] bg-surface text-on-surface md:min-h-screen">
      {header}
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-4 pb-8 sm:px-6 sm:pt-6">
        <article className="overflow-hidden rounded-2xl bg-surface-container-low sm:rounded-3xl">
          <div className={`relative flex min-h-56 flex-col justify-end overflow-hidden bg-[#151c2a] p-4 text-white sm:min-h-64 sm:p-6 ${closed ? "grayscale" : ""}`}>
            {preview.imageUrl ? (
              <Image
                src={preview.imageUrl}
                alt=""
                fill
                preload
                sizes="(max-width: 576px) 90vw, 528px"
                className="object-cover"
              />
            ) : (
              <KindIcon size={94} strokeWidth={1} className="absolute top-7 right-7 text-white/20" aria-hidden="true" />
            )}
            <div className="absolute inset-0 bg-linear-to-b from-black/20 to-[#101522]" aria-hidden="true" />
            {closed ? <div className="relative mb-auto"><ClosedBadge /></div> : <p className="relative mb-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-streak px-2.5 py-1 text-xs font-bold text-on-streak">
              <KindIcon size={13} aria-hidden="true" />
              {invited ? "You have been invited" : kindLabel}
            </p>}
            <h1 className="relative mt-7 break-words font-display text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
              {preview.title}
            </h1>
            {preview.organizerName && (
              <p className="relative mt-2 flex items-center gap-2 text-sm font-semibold text-white/85">
                <UserAvatar src={preview.organizerImageUrl} size={24} /> Hosted by {preview.organizerName}
              </p>
            )}
          </div>

          {tenure || preview.participantCount > 0 ? (
            <div className="flex flex-wrap gap-2 p-3 sm:p-4">
              {tenure && (
                <span className="flex min-w-fit flex-1 items-center gap-2 rounded-xl bg-surface-container-high/65 px-3 py-2.5 text-sm font-semibold">
                  <CalendarDays size={17} className="shrink-0 text-secondary" aria-hidden="true" />
                  {tenure}
                </span>
              )}
              {preview.participantCount > 0 && (
                <span className="flex min-w-fit flex-1 items-center gap-2 rounded-xl bg-surface-container-high/65 px-3 py-2.5 text-sm font-semibold">
                  <Users size={17} className="shrink-0 text-streak-ink" aria-hidden="true" />
                  {preview.participantCount.toLocaleString()} joined
                </span>
              )}
            </div>
          ) : null}
        </article>

        <div className="space-y-2">
          <Link href={signIn} className={action}>
            <Zap size={17} aria-hidden="true" />
            {invited && !closed ? "Join challenge" : "Open in StrivUp"}
          </Link>
          <p className="text-center text-sm text-on-surface-variant">
            {closed
              ? `Sign in to see the full ${kindLabel.toLowerCase()}.`
              : invited
              ? "Sign in or create an account. You will land straight in the challenge."
              : `Sign in to see the full ${kindLabel.toLowerCase()} and join.`}
          </p>
        </div>
      </div>
    </div>
  );
}
