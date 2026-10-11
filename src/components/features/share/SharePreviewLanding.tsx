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
import { Calendar, Users } from "lucide-react";
import type { SharePreview } from "@/lib/data/share";
import { formatTenure } from "@/lib/data/share";
import { BrandMark } from "@/components/ui";

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

  if (!preview) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-gutter text-center">
        <BrandMark variant="wordmark" height={28} />
        <h1 className="text-headline-md text-on-surface">This link is not available</h1>
        <p className="measure-form text-body-md text-on-surface-variant">
          {invited
            ? "This invite may have been replaced by a newer link, or the challenge may no longer exist. Ask whoever invited you for a fresh one."
            : "It may have been removed, or it may be private. Sign in if you were invited to it."}
        </p>
        <Link
          href={signIn}
          className="mt-2 flex h-12 items-center justify-center rounded-xl bg-primary px-8 text-body-md font-bold text-on-primary"
        >
          Sign in
        </Link>
      </main>
    );
  }

  const tenure = formatTenure(preview.startDate, preview.endDate);
  const kindLabel = preview.kind === "challenge" ? "Challenge" : "Quest";

  return (
    <main className="min-h-screen bg-surface px-gutter py-8 pb-16">
      <div className="mx-auto flex measure-form flex-col gap-6">
        <BrandMark variant="wordmark" height={24} />

        <article className="overflow-hidden rounded-3xl border border-outline-variant bg-share-card elev-3">
          <div className="relative aspect-[1120/322] w-full overflow-hidden bg-share-card-deep">
            {preview.imageUrl ? (
              /* The LCP element on this page, and the only thing on it worth
                 waiting for, so it is marked priority and sized for a
                 single-column layout capped at measure-form. */
              <Image
                src={preview.imageUrl}
                alt=""
                fill
                priority
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-label-md font-bold uppercase tracking-[0.3em] text-white/60">
                {kindLabel}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 p-5">
            <p className="text-label-sm font-bold uppercase tracking-[0.2em] text-white/60">
              {invited ? "You have been invited" : kindLabel}
            </p>
            <h1 className="text-headline-md font-bold leading-snug text-white">
              {preview.title}
            </h1>

            {preview.organizerName && (
              <div className="flex items-center gap-2.5">
                {preview.organizerImageUrl ? (
                  <Image
                    src={preview.organizerImageUrl}
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-full border border-white/25 object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-share-card-edge text-body-md font-bold text-white"
                  >
                    {preview.organizerName.replace("@", "").charAt(0).toUpperCase()}
                  </span>
                )}
                <p className="truncate text-body-md font-semibold text-white/80">
                  by {preview.organizerName}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body-md text-white/80">
              {tenure && (
                <span className="flex items-center gap-2">
                  <Calendar size={18} className="shrink-0" aria-hidden="true" />
                  {tenure}
                </span>
              )}
              {preview.participantCount > 0 && (
                <span className="flex items-center gap-2">
                  <Users size={18} className="shrink-0" aria-hidden="true" />
                  {preview.participantCount === 1
                    ? "1 joined"
                    : `${preview.participantCount} joined`}
                </span>
              )}
            </div>
          </div>
        </article>

        <div className="flex flex-col gap-2">
          <Link
            href={signIn}
            className="flex h-12 items-center justify-center rounded-xl bg-primary text-body-lg font-bold text-on-primary"
          >
            {invited ? "Join challenge" : "Open in StrivUp"}
          </Link>
          <p className="text-center text-body-sm text-on-surface-variant">
            {invited
              ? "Sign in or create an account. You will land straight in the challenge."
              : `Sign in to see the full ${kindLabel.toLowerCase()} and join.`}
          </p>
        </div>
      </div>
    </main>
  );
}
