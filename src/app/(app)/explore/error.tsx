"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button, ErrorState } from "@/components/ui";

/**
 * Error boundary for challenge discovery.
 *
 * Scoped here rather than relying on (app)/error.tsx so a failure in this
 * route's data fetch does not blank the rest of the shell.
 */
export default function ExploreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[explore] boundary caught:", error.digest ?? "(no digest)", error);
  }, [error]);

  return (
    <ErrorState
      title="Explore didn't load"
      message="We couldn't fetch challenges right now. Try again in a moment."
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
