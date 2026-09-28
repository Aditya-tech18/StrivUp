"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button, ErrorState } from "@/components/ui";

/**
 * Error boundary for a challenge detail page.
 *
 * Scoped here rather than relying on (app)/error.tsx so a failure in this
 * route's data fetch does not blank the rest of the shell.
 */
export default function ChallengeDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[challenge] boundary caught:", error.digest ?? "(no digest)", error);
  }, [error]);

  return (
    <ErrorState
      title="This challenge didn't load"
      message="We couldn't load this challenge's details. Any proof you already submitted is still recorded."
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
