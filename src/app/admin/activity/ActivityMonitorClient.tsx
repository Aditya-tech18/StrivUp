"use client";

import { useEffect, useState } from "react";
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
  // Created once; as a plain call in the render body it was a new client on
  // every render.
  const [supabase] = useState(() => createClient());

  const [tab, setTab] = useState<"flagged" | "events">("flagged");
  const [flagged, setFlagged] = useState<(ActivityRecord & { user_id: string })[]>([]);
  const [events, setEvents] = useState<
    { id: string; user_id: string | null; quest_id: string | null; event_type: string; metadata: Record<string, unknown> | null; created_at: string }[]
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `loading` is derived from whether a fetch has landed yet, rather than its
  // own state that the effect sets true in its first synchronous line, which
  // is what react-hooks/set-state-in-effect flags. `refreshKey` re-runs the
  // effect after a review without blanking the list.
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const loading = !loaded;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [f, e] = await Promise.all([
        getFlaggedActivity(supabase, 50),
        getActivityEvents(supabase, 80),
      ]);
      if (cancelled) return;
      setFlagged(f);
      setEvents(e);
      setLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [supabase, refreshKey]);

  async function review(id: string, action: "approve" | "reject" | "review") {
    setBusyId(id);
    setError(null);
    const { error: err } = await reviewActivityRecord(supabase, id, action);
    if (err) setError(err);
    else setRefreshKey(k => k + 1);
    setBusyId(null);
  }

  return (
    <div className="min-h-screen bg-surface pb-20">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-5 py-4">
        <Link href="/admin/moderation" aria-label="Back to moderation">
          <ArrowLeft className="h-5 w-5 text-on-surface-variant" />
        </Link>
        <h1 className="flex-1 text-base font-semibold text-on-surface">Activity monitoring</h1>
        <span className="rounded-full bg-surface-container-low px-2 py-0.5 text-label-sm text-on-surface-variant">
          {moderatorRole}
        </span>
      </header>

      <div className="flex gap-2 border-b border-outline-variant bg-surface-container-lowest px-5">
        {(["flagged", "events"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t
                ? "border-secondary text-secondary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t === "flagged" ? `Suspicious (${flagged.length})` : "Audit log"}
          </button>
        ))}
      </div>

      <main className="mx-auto measure-console space-y-3 px-5 py-5">
        {error && <p className="rounded-lg bg-error-container p-3 text-sm text-on-error-container">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
          </div>
        ) : tab === "flagged" ? (
          flagged.length === 0 ? (
            <div className="rounded-xl border border-dashed border-outline-variant p-8 text-center">
              <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-on-admin-chrome-variant" />
              <p className="text-sm text-on-surface-variant">Nothing flagged. All activity looks normal.</p>
            </div>
          ) : (
            flagged.map((r) => (
              <div key={r.id} className="rounded-xl border border-warning-outline bg-surface-container-lowest p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums text-on-surface">
                      {r.steps.toLocaleString("en-IN")} steps
                      {r.duration_s > 0 && (
                        <span className="ml-1.5 font-normal text-on-surface-variant">
                          in {Math.round(r.duration_s / 60)} min
                        </span>
                      )}
                    </p>
                    <p className="text-label-sm text-on-surface-variant">
                      {r.local_date} · user {r.user_id.slice(0, 8)}…
                    </p>
                    {r.flagged_reason && (
                      <p className="mt-1 text-xs font-medium text-on-warning-container">
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
                  <p className="text-label-sm text-on-surface-variant">
                    Read-only — an is_admin profile is required to action this.
                  </p>
                )}
              </div>
            ))
          )
        ) : (
          <ul className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 p-3">
                <span className="w-56 shrink-0 truncate font-mono text-label-sm text-on-surface">
                  {e.event_type}
                </span>
                <span className="min-w-0 flex-1 truncate text-label-sm text-on-surface-variant">
                  {e.metadata ? JSON.stringify(e.metadata) : "—"}
                </span>
                <span className="shrink-0 text-label-sm text-on-surface-variant">
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
              <li className="p-6 text-center text-sm text-on-surface-variant">No activity events yet.</li>
            )}
          </ul>
        )}
      </main>
    </div>
  );
}
