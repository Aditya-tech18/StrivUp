import { Skeleton } from "@/components/ui";

/**
 * (app)/loading.tsx — shown while any authenticated route streams in.
 *
 * Shaped like a feed rather than a spinner: a layout-matching skeleton makes
 * the wait feel shorter and stops the content jumping when it arrives.
 *
 * `aria-busy` + the visually-hidden live text tell screen readers that work is
 * in progress, since the skeleton blocks themselves are aria-hidden.
 */
export default function AppLoading() {
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-2xl px-4 py-6">
      <span className="sr-only" role="status">
        Loading…
      </span>

      {/* Header row */}
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>

      {/* Content cards */}
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
          >
            <div className="mb-3 flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-44 w-full rounded-xl" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
