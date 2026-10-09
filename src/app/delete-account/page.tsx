import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail, Trash2 } from "lucide-react";
import { BrandMark } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/legal/privacy";

/**
 * /delete-account — the public account-deletion page.
 *
 * Play requires apps that let people create an account to publish a
 * web-reachable page explaining how to delete it, which has to work without
 * installing the app. The page that actually performs the deletion lives at
 * /settings/delete-account and needs a session; this one explains the route in
 * and gives an email fallback for anyone locked out of theirs.
 *
 * It states what deletion does from what the code does: deleteMyAccount()
 * removes the auth user, and the schema cascades from there. It does not
 * promise a retention window, because nothing in the system enforces one.
 */
export const metadata: Metadata = {
  title: "Delete your account",
  description:
    "How to permanently delete your StrivUp account and the data attached to it.",
  alternates: { canonical: "/delete-account" },
};

const REMOVED = [
  "Your profile: name, username, photo, bio, links and interests",
  "Your challenge and quest participation, and the proofs you submitted",
  "Your streaks, StrivCoin balance and activity history",
  "Your follows, followers and comments",
];

export default function PublicDeleteAccountPage() {
  return (
    <main className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface/95 pt-safe backdrop-blur-sm">
        <div className="mx-auto flex h-14 measure-form items-center gap-3 px-gutter">
          <Link
            href="/"
            aria-label="StrivUp home"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          <BrandMark variant="wordmark" height={18} priority />
        </div>
      </header>

      <div className="mx-auto measure-form px-gutter py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-error-outline bg-error-container">
            <Trash2 size={30} className="text-error" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h1 className="text-headline-lg-mobile text-on-surface">Delete your account</h1>
          <p className="max-w-sm text-body-md text-on-surface-variant">
            Deleting your StrivUp account is permanent. It cannot be undone, and
            the data below cannot be restored afterwards.
          </p>
        </div>

        <section className="mt-8 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 elev-1 surface-raised">
          <h2 className="text-headline-sm text-on-surface">From inside the app</h2>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-body-md text-on-surface-variant">
            <li>Sign in to StrivUp.</li>
            <li>Open Settings, then Account.</li>
            <li>Choose Delete Account and type DELETE to confirm.</li>
          </ol>
          <Link
            href="/settings/delete-account"
            className="mt-4 inline-flex h-12 items-center justify-center rounded-xl border border-outline-variant px-5 font-semibold text-on-surface pressable hover:bg-surface-container"
          >
            Go to Delete Account
          </Link>
        </section>

        <section className="mt-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 elev-1 surface-raised">
          <h2 className="text-headline-sm text-on-surface">What is removed</h2>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-body-md text-on-surface-variant">
            {REMOVED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3 text-body-sm text-on-surface-variant">
            Deletion removes your sign-in account, and everything above is
            removed with it. Content you posted inside someone else&apos;s
            challenge is removed too, so their leaderboard totals change
            accordingly.
          </p>
        </section>

        <section className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-5">
          <h2 className="text-headline-sm text-on-surface">
            If you cannot sign in
          </h2>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Email us from the address on the account and we will delete it for
            you. Tell us the account email or your username.
          </p>
          <p className="mt-3 flex items-center gap-2 text-body-md">
            <Mail size={16} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-secondary hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>

        <p className="mt-6 text-center text-body-sm text-on-surface-variant">
          See also the{" "}
          <Link href="/privacy" className="font-semibold text-secondary hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
