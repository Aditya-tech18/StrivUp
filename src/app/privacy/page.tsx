import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { BrandMark } from "@/components/ui";
import { PRIVACY_EFFECTIVE, PRIVACY_SECTIONS, SUPPORT_EMAIL } from "@/lib/legal/privacy";

/**
 * /privacy — the public privacy policy.
 *
 * Play Console asks for a privacy policy URL and checks that it loads without
 * signing in. The in-app copy at /settings/privacy-policy is behind the auth
 * guard in proxy.ts, so it cannot be the URL given to Play. Both render the
 * same array from src/lib/legal/privacy.ts.
 */
export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How StrivUp collects, uses, stores and shares your information, and how to exercise your rights over it.",
  alternates: { canonical: "/privacy" },
};

export default function PublicPrivacyPage() {
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
        <h1 className="text-headline-lg-mobile text-on-surface">Privacy Policy</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Effective {PRIVACY_EFFECTIVE}
        </p>

        <div className="mt-6 flex flex-col gap-4">
          {PRIVACY_SECTIONS.map((section) => (
            <section
              key={section.title}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 elev-1 surface-raised"
            >
              <h2 className="text-headline-sm text-on-surface">{section.title}</h2>
              <p className="mt-2 text-body-md leading-relaxed text-on-surface-variant">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-5">
          <p className="flex items-center gap-2 text-body-md text-on-surface">
            <Mail size={16} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-secondary hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p className="text-body-sm text-on-surface-variant">
            To delete your account and data, see{" "}
            <Link href="/delete-account" className="font-semibold text-secondary hover:underline">
              account deletion
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
