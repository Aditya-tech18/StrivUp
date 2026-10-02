"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ShieldAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { ActivityVerificationStatus } from "@/components/features/activity";
import {
  getActivityEvents,
  getFlaggedActivity,
  reviewActivityRecord,
} from "@/lib/data/activity";
import type { ActivityRecord } from "@/lib/activity/types";

/**
 * ActivityMonitorClient — the moderator queue for suspicious activity
 * (spec §30, §54).
 *
 * Deliberate design choice: a flagged record is *suspended*, not punished.
 * It has already stopped counting toward quest progress (the progress engine
 * only sums VALID rows), so the damage is contained while a human decides —
 * nobody is banned off one weird reading (spec §29).
 *
 * Approving or rejecting triggers a progress recalculation server-side, so a
 * wrongly-flagged walk retroactively completes the task it should have.
 */
export default function ActivityMonitorClient({
  moderatorRole,
  canReview,
}: {
  moderatorRole: string;
  canReview: boolean;
}) {
  const supabase = createClient();

  const [tab, setTab] = useState<"flagged" | "events">("flagged");
  const [flagged, setFlagged] = useState<(ActivityRecord & { user_id: string })[]>([]);
  const [events, setEvents] = useState<
    { id: string; user_id: string | null; quest_id: string | null; event_type: string; metadata: Record<string, unknown> | null; created_at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [f, e] = await Promise.all([
      getFlaggedActivity(supabase, 50),
      getActivityEvents(supabase, 80),
    ]);
    setFlagged(f);
    setEvents(e);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: "approve" | "reject" | "review") {
    setBusyId(id);
    setError(null);
    const { error: err } = await reviewActivityRecord(supabase, id, action);
    if (err) setError(err);
    else await load();
    setBusyId(null);
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-20">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-4">
        <Link href="/admin/moderation" aria-label="Back to moderation">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <h1 className="flex-1 text-base font-semibold text-gray-900">Activity monitoring</h1>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
          {moderatorRole}
        </span>
      </header>

      <div className="flex gap-2 border-b border-gray-100 bg-white px-5">
        {(["flagged", "events"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "flagged" ? `Suspicious (${flagged.length})` : "Audit log"}
          </button>
        ))}
      </div>

      <main className="mx-auto max-w-3xl space-y-3 px-5 py-5">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : tab === "flagged" ? (
          flagged.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
              <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">Nothing flagged. All activity looks normal.</p>
            </div>
          ) : (
            flagged.map((r) => (
              <div key={r.id} className="rounded-xl border border-amber-200 bg-white p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums text-gray-900">
                      {r.steps.toLocaleString("en-IN")} steps
                      {r.duration_s > 0 && (
                        <span className="ml-1.5 font-normal text-gray-500">
                          in {Math.round(r.duration_s / 60)} min
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {r.local_date} · user {r.user_id.slice(0, 8)}…
                    </p>
                    {r.flagged_reason && (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        Flags: {r.flagged_reason}
                      </p>
                    )}
                  </div>
                  <ActivityVerificationStatus
                    source={r.source}
                    verification={r.verification_status}
                    activityStatus={r.activity_status}
                  />
                </div>

                {canReview ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => review(r.id, "approve")}
                      disabled={busyId === r.id}
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => review(r.id, "reject")}
                      disabled={busyId === r.id}
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => review(r.id, "review")}
                      disabled={busyId === r.id}
                    >
                      Hold for review
                    </Button>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400">
                    Read-only — an is_admin profile is required to action this.
                  </p>
                )}
              </div>
            ))
          )
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 p-3">
                <span className="w-56 shrink-0 truncate font-mono text-[11px] text-gray-700">
                  {e.event_type}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-gray-400">
                  {e.metadata ? JSON.stringify(e.metadata) : "—"}
                </span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {new Date(e.created_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
            {events.length === 0 && (
              <li className="p-6 text-center text-sm text-gray-500">No activity events yet.</li>
            )}
          </ul>
        )}
      </main>
    </div>
  );
}
