import Link from "next/link";
import { Flame } from "lucide-react";

/**
 * AuthCard — the shell every auth screen sits in.
 *
 * The logo block, headline and error banner were duplicated verbatim in the
 * login and signup forms; adding phone, forgot-password and reset-password
 * screens would have made five copies. One component instead, so the screens
 * cannot drift apart visually.
 */
export function AuthCard({
  title,
  subtitle,
  error,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  /** Rendered as an alert banner above the content when present. */
  error?: string | null;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md space-y-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <Link
          href="/"
          aria-label="StrivUp home"
          className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-container"
        >
          <Flame size={28} className="text-on-primary" aria-hidden="true" />
        </Link>
        <p className="text-overline tracking-widest text-secondary">STRIVUP</p>
      </div>

      <div className="space-y-1 text-center">
        <h1 className="text-headline-lg-mobile text-on-surface">{title}</h1>
        {subtitle ? (
          <p className="text-body-md text-on-surface-variant">{subtitle}</p>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-error-outline bg-error-container px-4 py-3 text-body-md text-on-error-container"
        >
          {error}
        </div>
      ) : null}

      {children}

      {footer ? (
        <p className="text-center text-body-md text-on-surface-variant">{footer}</p>
      ) : null}
    </div>
  );
}
