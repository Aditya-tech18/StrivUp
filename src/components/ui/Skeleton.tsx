/**
 * Skeleton — shimmer placeholder for content that is still loading.
 *
 * Promoted from the local `Sk` helper in profile/page.tsx so every async
 * surface shares one look. Uses the `surface-container-highest` token rather
 * than the hardcoded #e4e2e4 the original had — same colour, but it now
 * follows the design system if that token ever changes.
 *
 * Usage:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-24 w-full rounded-2xl" />
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-surface-container-highest ${className}`}
    />
  );
}
