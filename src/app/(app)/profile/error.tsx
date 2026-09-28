"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button, ErrorState } from "@/components/ui";

/**
 * Error boundary for the profile page.
 *
 * Scoped here rather than relying on (app)/error.tsx so a failure in this
 * route's data fetch does not blank the rest of the shell.
 */
export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[profile] boundary caught:", error.digest ?? "(no digest)", error);
  }, [error]);

  return (
    <ErrorState
      title="Your profile didn't load"
      message="We couldn't load your profile. Nothing has been changed or lost."
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
