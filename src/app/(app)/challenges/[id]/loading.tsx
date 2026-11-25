import { Skeleton } from "@/components/ui";

export default function ChallengeDetailLoading() {
  return (
    <div aria-busy="true" className="min-h-screen bg-surface">
      <span className="sr-only" role="status">Loading challenge…</span>

      <div className="border-b border-outline-variant/60 pt-safe">
        <div className="mx-auto flex h-[3.25rem] max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="ml-auto size-8 rounded-full" />
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-6">
        <Skeleton className="h-56 w-full rounded-2xl sm:h-72 sm:rounded-3xl lg:h-80" />

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="space-y-2 rounded-xl bg-surface-container-low p-3 sm:p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {[0, 1].map((index) => (
            <div key={index} className="space-y-3 rounded-2xl bg-surface-container-low p-4 sm:p-5">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
