import Link from "next/link";
import { Compass, SearchX } from "lucide-react";
import { Button, ErrorState } from "@/components/ui";

/**
 * (app)/not-found.tsx — served for notFound() inside the authenticated shell,
 * and for unmatched paths under the (app) route group.
 *
 * Also the page a visitor lands on for a profile that is deactivated or does
 * not exist, so the copy must not imply the thing definitely never existed —
 * saying "this account was deactivated" would leak that it does.
 */
export default function AppNotFound() {
  return (
    <ErrorState
      icon={<SearchX size={24} className="text-on-surface-variant" aria-hidden="true" />}
      title="We couldn't find that"
      message="This page may have moved, or it might be private. Try finding it from Explore."
    >
      <Link href="/explore">
        <Button variant="primary">
          <Compass size={16} aria-hidden="true" />
          Explore challenges
        </Button>
      </Link>
      <Link href="/feed">
        <Button variant="outline">Back to home</Button>
      </Link>
    </ErrorState>
  );
}
