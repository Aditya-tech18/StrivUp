import type { Metadata } from "next";
import Image from "next/image";

/**
 * /offline — what the service worker serves when a navigation fails.
 *
 * Static on purpose: it has to render from the cache with no network and no
 * Supabase session, so it cannot read anything about the user.
 */
export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-gutter text-center">
      <Image
        src="/brand/wordmark.png"
        alt="StrivUp"
        width={180}
        height={50}
        priority
        className="h-auto w-[180px]"
      />
      <div className="space-y-2">
        <h1 className="text-headline-lg-mobile text-on-surface">You are offline</h1>
        <p className="mx-auto max-w-sm text-body-md text-on-surface-variant">
          StrivUp needs a connection to show your streaks, quests and proof
          codes. Nothing has been lost; reconnect and carry on where you were.
        </p>
      </div>
      {/* A real document navigation, not next/link. This page is served from
          the service worker cache after a failed navigation, so there may be no
          router to push with, and a client-side nav would not retry the
          network, which is the entire point of the button. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="inline-flex h-12 items-center justify-center rounded-xl bg-secondary px-6 font-bold text-white elev-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        Try again
      </a>
    </main>
  );
}
