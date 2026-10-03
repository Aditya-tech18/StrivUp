import type { ReactNode } from "react";

interface ErrorStateProps {
  /** Short, human sentence. Not "Error 500". */
  title: string;
  /** One or two lines explaining what the person can do next. */
  message: string;
  /** Optional lucide icon, already sized by the caller. */
  icon?: ReactNode;
  /** Action buttons — retry, go home, etc. */
  children?: ReactNode;
  /** Shown in small print, for support. Never a raw stack trace. */
  reference?: string | null;
}

/**
 * ErrorState — shared presentational shell for error boundaries, 404s and
 * other dead ends.
 *
 * Deliberately has no "use client" directive so it can be rendered from both
 * client error boundaries (error.tsx, global-error.tsx) and server components
 * (not-found.tsx). It holds no state and takes no callbacks of its own.
 *
 * Copy guidance: address the person, not the machine. Say what happened and
 * what to do, never "an unexpected error occurred".
 */
export function ErrorState({
  title,
  message,
  icon,
  children,
  reference,
}: ErrorStateProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? (
        <div
          className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-container"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}

      <h1 className="text-headline-md font-bold text-on-surface">{title}</h1>

      <p className="mt-2 max-w-sm text-body-md leading-relaxed text-on-surface-variant">
        {message}
      </p>

      {children ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {children}
        </div>
      ) : null}

      {reference ? (
        <p className="mt-8 font-mono text-label-sm text-on-surface-variant/70">
          Reference: {reference}
        </p>
      ) : null}
    </div>
  );
}
