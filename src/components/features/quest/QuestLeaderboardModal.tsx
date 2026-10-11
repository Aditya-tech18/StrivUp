"use client";

/**
 * QuestLeaderboardModal — the full quest ranking, in a sheet.
 *
 * Replaces a "View Full Leaderboard" link that pointed at
 * /quests/[id]/leaderboard, a route that does not exist, so the only way to
 * see past the top three was a 404.
 *
 * It asks for 20 rows and renders whatever comes back: a quest that awards
 * ranks 1-20 shows all twenty, a quest with six verified participants shows
 * six. `quest_leaderboard` is SECURITY DEFINER and ranks on approved task
 * submissions only, so an unverified claim never moves anyone up.
 *
 * Every row is a link to that person's public profile, which is where the
 * follow button lives.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Trophy, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getQuestLeaderboard,
  type LeaderboardRow,
} from "@/lib/data/questOrderVerification";

/** Play awards the top 20, so that is what the sheet asks for. */
export const LEADERBOARD_LIMIT = 20;

const MEDALS = ["🥇", "🥈", "🥉"];

export function QuestLeaderboardModal({
  open,
  onClose,
  supabase,
  questId,
  totalTasks,
  /** Highlights the viewer's own row so they can find themselves in a list of 20. */
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  supabase: SupabaseClient;
  questId: string;
  totalTasks: number;
  currentUserId: string | null;
}) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  /* Fetched when the sheet opens rather than with the page: the ranking is
     live, and the numbers behind a closed sheet are stale by the time anyone
     looks at them. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      const data = await getQuestLeaderboard(supabase, questId, LEADERBOARD_LIMIT);
      if (!cancelled) setRows(data);
    })();

    return () => { cancelled = true; };
  }, [open, supabase, questId]);

  /* A sheet on a phone behaves like one: Escape dismisses it, and the page
     behind it does not scroll, or a flick on the sheet's padding scrolls the
     quest page underneath while the sheet stays put. */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);

    const { overflow, paddingRight } = document.body.style;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-primary/60 px-0 backdrop-blur-sm sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-leaderboard-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* dvh so the sheet fits the visible viewport on a phone rather than the
          full screen height vh reports. pb-safe clears the home indicator. */}
      <div className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-outline-variant bg-surface-container-lowest pb-safe elev-5 sm:max-h-[80dvh] sm:max-w-md sm:rounded-2xl sm:pb-0">

        <div aria-hidden="true" className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-outline-variant" />
        </div>

        <header className="flex items-center gap-3 border-b border-outline-variant px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning-container">
            <Trophy size={18} className="text-on-warning-container" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="quest-leaderboard-title" className="text-body-lg font-bold text-on-surface">
              Leaderboard
            </h2>
            <p className="text-body-sm text-on-surface-variant">
              Top {LEADERBOARD_LIMIT} by verified tasks
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close leaderboard"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {rows === null ? (
            <div className="flex items-center justify-center gap-2 py-14 text-body-md text-on-surface-variant">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Loading ranking…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Trophy size={32} className="text-on-surface-variant opacity-40" aria-hidden="true" />
              <p className="text-headline-sm text-on-surface">Nobody has ranked yet</p>
              <p className="max-w-xs text-body-md text-on-surface-variant">
                The board fills in as participants get their tasks verified. Be
                the first.
              </p>
            </div>
          ) : (
            <ol className="flex list-none flex-col">
              {rows.map((r) => {
                const name = r.full_name ?? r.username ?? "Participant";
                const isMe = currentUserId != null && r.user_id === currentUserId;
                return (
                  <li key={r.user_id}>
                    <Link
                      href={`/u/${r.username ?? r.user_id}`}
                      onClick={onClose}
                      className={[
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
                        isMe ? "bg-secondary-fixed" : "hover:bg-surface-container-low",
                      ].join(" ")}
                    >
                      <span
                        className="w-7 shrink-0 text-center text-body-md font-bold tabular-nums text-on-surface-variant"
                        aria-hidden="true"
                      >
                        {MEDALS[r.rank - 1] ?? r.rank}
                      </span>

                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary-fixed">
                        {r.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-body-md font-bold text-secondary">
                            {name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-body-md font-semibold text-on-surface">
                            {name}
                          </span>
                          {isMe && (
                            <span className="shrink-0 rounded-full bg-secondary px-1.5 text-label-sm font-bold text-on-secondary">
                              You
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-body-sm text-on-surface-variant">
                          {r.tasks_completed}/{totalTasks} tasks verified
                        </span>
                      </span>

                      <span className="shrink-0 text-body-md font-bold tabular-nums text-on-surface">
                        {r.points}
                        <span className="ml-1 text-body-sm font-medium text-on-surface-variant">pts</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {rows !== null && rows.length > 0 && (
          <p className="border-t border-outline-variant px-5 py-3 text-center text-body-sm text-on-surface-variant">
            {rows.length === LEADERBOARD_LIMIT
              ? `Showing the top ${LEADERBOARD_LIMIT}`
              : `${rows.length} ${rows.length === 1 ? "participant has" : "participants have"} ranked so far`}
          </p>
        )}
      </div>
    </div>
  );
}
