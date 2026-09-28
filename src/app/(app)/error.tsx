"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, ErrorState } from "@/components/ui";

/**
 * (app)/error.tsx — boundary for every authenticated route.
 *
 * Renders inside AppShellLayout, so the nav stays put and the person can move
 * somewhere else instead of being stranded on a dead screen.
 *
 * Route-specific boundaries (feed, explore, challenges/[id], profile) sit
 * below this one and catch first; this is the catch-all for everything else.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Until Sentry is wired up (Phase 8), the console is the only sink we have.
    // `digest` is the only id shared with the server logs, so always log it.
    console.error("[app] boundary caught:", error.digest ?? "(no digest)", error);
  }, [error]);

  return (
    <ErrorState
      icon={<TriangleAlert size={24} className="text-error" aria-hidden="true" />}
      title="This page hit a snag"
      message="We couldn't finish loading this screen. Your progress and streaks are safe — nothing was lost."
      reference={error.digest ?? null}
    >
      <Button variant="primary" onClick={reset}>
        <RotateCcw size={16} aria-hidden="true" />
        Try again
      </Button>
      <Link href="/feed">
        <Button variant="outline">Back to home</Button>
      </Link>
    </ErrorState>
  );
}
