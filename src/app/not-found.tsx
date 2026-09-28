import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button, ErrorState } from "@/components/ui";

/**
 * Root not-found.tsx — unmatched paths outside the authenticated (app) group.
 *
 * Renders with only the root layout, so there is no nav here. Points at the
 * gateway rather than /feed, because someone hitting a bad URL may well be
 * signed out and /feed would just bounce them to /login.
 */
export default function RootNotFound() {
  return (
    <main className="min-h-screen bg-surface">
      <ErrorState
        icon={<SearchX size={24} className="text-on-surface-variant" aria-hidden="true" />}
        title="Page not found"
        message="That link doesn't lead anywhere. It may have expired or been mistyped."
      >
        <Link href="/">
          <Button variant="primary">Go to StrivUp</Button>
        </Link>
      </ErrorState>
    </main>
  );
}
