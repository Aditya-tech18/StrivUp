"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button, ErrorState } from "@/components/ui";

/**
 * Error boundary for the home feed.
 *
 * Scoped here rather than relying on (app)/error.tsx so a failure in this
 * route's data fetch does not blank the rest of the shell.
 */
export default function FeedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[feed] boundary caught:", error.digest ?? "(no digest)", error);
  }, [error]);

  return (
    <ErrorState
      title="Your feed didn't load"
      message="We couldn't reach the proof feed just now. Your streaks are safe."
      reference={error.digest ?? null}
    >
      <Button variant="primary" onClick={reset}>
        <RotateCcw size={16} aria-hidden="true" />
        Try again
      </Button>
      <Link href="/explore">
        <Button variant="outline">Browse challenges</Button>
      </Link>
    </ErrorState>
  );
}
