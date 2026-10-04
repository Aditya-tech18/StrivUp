import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Activity as ActivityIcon, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getActivityDashboard,
  getActivityHistory,
  getMyPhysicalTasks,
  hasConnectedProvider,
} from "@/lib/data/activity";
import {
  ActivityHistory,
  ActivityProgressCard,
  DailyStepsCard,
} from "@/components/features/activity";

/**
 * /activity — "My Activity" dashboard (spec §14, §37).
 *
 * Today, the week, the streak, and every physical quest task in flight.
 * Strava-ish in feel, but deliberately not a fitness social network: the only
 * reason activity is shown here is that it makes quests measurable.
 */
export const dynamic = "force-dynamic";

export default async function ActivityDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/activity");

  const [connected, dashboard, tasks, history] = await Promise.all([
    hasConnectedProvider(supabase, user.id),
    getActivityDashboard(supabase, 7),
    getMyPhysicalTasks(supabase, user.id),
    getActivityHistory(supabase, user.id, 15),
  ]);

  const today = dashboard?.today ?? new Date().toISOString().slice(0, 10);
  const activeTasks = tasks.filter((t) => t.period_date === today || t.status !== "COMPLETED");
  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-4">
        <Link href="/profile" aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <h1 className="flex-1 text-base font-semibold text-gray-900">My activity</h1>
        <Link href="/settings/activity" aria-label="Activity settings">
          <Settings className="h-5 w-5 text-gray-500" />
        </Link>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-5 py-5">
        {!connected ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
            <ActivityIcon className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <h2 className="text-sm font-semibold text-gray-900">Activity tracking not connected</h2>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-gray-500">
              Your phone already counts your steps in the background. Connect it once and physical
              quests verify themselves — no photos, no keeping the app open.
            </p>
            <Link
              href="/settings/activity"
              className="mt-4 inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"
            >
              Connect activity
            </Link>
          </div>
        ) : (
          dashboard && <DailyStepsCard data={dashboard} />
        )}

        {activeTasks.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Physical quests</h2>
            <div className="space-y-2.5">
              {activeTasks.slice(0, 10).map((t) => (
                <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {t.task_title ?? "Activity task"}
                    </p>
                    {t.quest_title && (
                      <Link
                        href={`/quests/${t.quest_id}/tasks`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {t.quest_title}
                      </Link>
                    )}
                  </div>
                  <ActivityProgressCard
                    current={Number(t.current_value)}
                    target={Number(t.target_value)}
                    unit={t.unit}
                    compact
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {completedCount > 0 && (
          <p className="text-center text-xs text-gray-500">
            🔥 {completedCount} physical task{completedCount === 1 ? "" : "s"} completed
          </p>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">History</h2>
          <ActivityHistory records={history} />
        </section>
      </main>
    </div>
  );
}
