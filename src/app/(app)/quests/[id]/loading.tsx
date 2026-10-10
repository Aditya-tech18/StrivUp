import { Skeleton } from "@/components/ui";

/**
 * Quest detail skeleton. Same reasoning as the challenge one: the group
 * fallback is feed-shaped and a quest is a cover, a reward block and a task
 * list, so this keeps the first paint in the right shape.
 */
export default function QuestDetailLoading() {
  return (
    <div aria-busy="true" className="min-h-screen bg-surface">
      <span className="sr-only" role="status">
        Loading quest…
      </span>

      <Skeleton className="h-60 w-full rounded-none" />

      <div className="mx-auto measure-page space-y-5 px-4 py-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-4 w-2/5" />
        </div>

        <Skeleton className="h-20 w-full rounded-2xl" />

        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-outline-variant p-4"
            >
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>

        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
