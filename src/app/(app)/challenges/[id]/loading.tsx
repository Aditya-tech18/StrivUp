import { Skeleton } from "@/components/ui";

/**
 * Shown the instant a challenge link is tapped, before the server has
 * answered.
 *
 * The group-level (app)/loading.tsx is feed-shaped, so until now opening a
 * challenge flashed three post cards and then replaced them with a hero and a
 * task list. This matches the real layout, so the skeleton turns into content
 * in place rather than being swapped out.
 */
export default function ChallengeDetailLoading() {
  return (
    <div aria-busy="true" className="min-h-screen bg-surface">
      <span className="sr-only" role="status">
        Loading challenge…
      </span>

      {/* Top bar */}
      <div className="flex h-14 items-center justify-between border-b border-outline-variant px-4 pt-safe">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>

      <div className="mx-auto measure-page">
        {/* Hero */}
        <Skeleton className="h-56 w-full rounded-none" />

        <div className="space-y-5 px-4 py-5">
          <div className="space-y-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2 rounded-xl border border-outline-variant p-3">
                <Skeleton className="mx-auto h-5 w-10" />
                <Skeleton className="mx-auto h-3 w-14" />
              </div>
            ))}
          </div>

          {/* Task list */}
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-outline-variant p-4"
              >
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
