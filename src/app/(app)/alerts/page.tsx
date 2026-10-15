"use client";

/**
 * Alerts page — /alerts
 *
 * Rebuilt against the mockup: notifications grouped by when they happened,
 * each row carrying a coloured accent down its left edge, a tinted icon tile,
 * the cover of whatever it is about, and a pill saying where tapping goes.
 *
 * What the redesign is actually for. The old list was one flat column of
 * near-identical rows: the same grey card whether a payout-bearing quest had
 * a new participant or somebody liked a photo, and nothing on a row said
 * where it would take you. Colour by kind and an explicit destination are
 * what make a long list scannable.
 *
 * One real bug fixed along the way: notifications carry related_quest_id in
 * the live schema and this page never selected it, so a quest notification
 * marked itself read and then navigated nowhere. Quest rows now route to
 * /quests/[id].
 *
 * Still true from before: tapping a row marks it read optimistically and then
 * navigates. "Mark all as read" updates the database and the global badge.
 * Pending follow requests keep their own card at the top.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, MobileMenu } from "@/components/ui";
import { useUnreadCount } from "@/components/ui/AlertsContext";
import { FollowRequests } from "@/components/features/profile/FollowRequests";
import {
  AlertRow,
  destinationFor,
  groupFor,
  GROUPS,
  type CoverMap,
  type Group,
  type Notification,
} from "@/components/features/alerts/AlertRow";

// ── Page component ────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { markAllRead, markOneRead } = useUnreadCount();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [covers, setCovers] = useState<CoverMap>(new Map());
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from("notifications")
        .select(
          "id, type, title, message, is_read, related_challenge_id, related_quest_id, related_user_id, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (cancelled) return;
      const rows = (data ?? []) as Notification[];
      setNotifications(rows);
      setLoading(false);

      /* Cover art, two batched queries for the whole page rather than one per
         row. Decoration: a failure here leaves the icon tile showing and
         changes nothing else, so it is deliberately not awaited before the
         list is painted. */
      const challengeIds = [...new Set(rows.map((r) => r.related_challenge_id).filter(Boolean))] as string[];
      const questIds = [...new Set(rows.map((r) => r.related_quest_id).filter(Boolean))] as string[];

      const [chRes, qRes] = await Promise.all([
        challengeIds.length
          ? supabase.from("challenges").select("id, thumbnail_url").in("id", challengeIds)
          : Promise.resolve({ data: [] as { id: string; thumbnail_url: string | null }[] }),
        questIds.length
          ? supabase.from("quests").select("id, thumbnail_url, cover_url").in("id", questIds)
          : Promise.resolve({ data: [] as { id: string; thumbnail_url: string | null; cover_url: string | null }[] }),
      ]);

      if (cancelled) return;
      const map: CoverMap = new Map();
      for (const c of (chRes.data ?? []) as { id: string; thumbnail_url: string | null }[]) {
        if (c.thumbnail_url) map.set(c.id, c.thumbnail_url);
      }
      for (const q of (qRes.data ?? []) as {
        id: string;
        thumbnail_url: string | null;
        cover_url: string | null;
      }[]) {
        const url = q.thumbnail_url ?? q.cover_url;
        if (url) map.set(q.id, url);
      }
      setCovers(map);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tap handler ────────────────────────────────────────────────────────────

  const handleTap = useCallback(
    async (notif: Notification) => {
      // Optimistic update
      if (!notif.is_read) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
        markOneRead();

        await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("id", notif.id);
      }

      const dest = destinationFor(notif);
      if (dest) router.push(dest.href);
    },
    [markOneRead, router, supabase]
  );

  // ── Mark all read ──────────────────────────────────────────────────────────

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setMarkingAll(false); return; }

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    markAllRead();
    setMarkingAll(false);
  }, [markAllRead, supabase]);

  // ── Grouping ───────────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    const buckets = new Map<Group, Notification[]>();
    for (const n of notifications) {
      const g = groupFor(n.created_at);
      const list = buckets.get(g);
      if (list) list.push(n);
      else buckets.set(g, [n]);
    }
    // Fixed order, newest bucket first, skipping any that are empty.
    return GROUPS.filter((g) => buckets.has(g)).map((g) => ({
      group: g,
      items: buckets.get(g) as Notification[],
    }));
  }, [notifications]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasUnread = notifications.some((n) => !n.is_read);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-body-md text-on-surface-variant">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface px-4 py-6 pb-24">
      <div className="mx-auto max-w-xl">

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-1.5">
            <MobileMenu />
            <h1 className="text-headline-md text-on-surface">Alerts</h1>
            {hasUnread && (
              <span className="ml-1 rounded-full bg-error px-2 py-0.5 text-label-sm font-bold text-white">
                {notifications.filter((n) => !n.is_read).length}
              </span>
            )}
          </div>
          {hasUnread && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markingAll}
            >
              {markingAll ? "Marking…" : "Mark all as read"}
            </Button>
          )}
        </div>

        {/* Pending follow requests, for private accounts. Renders nothing when
            there are none, so a public account never sees an empty card. */}
        <div className="mb-5">
          <FollowRequests />
        </div>

        {/* Empty state */}
        {notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Bell size={40} className="text-on-surface-variant opacity-40" aria-hidden="true" />
            <p className="text-body-lg text-on-surface-variant">No notifications yet.</p>
          </div>
        )}

        {/* Grouped list */}
        {grouped.map(({ group, items }) => (
          <section key={group} className="mb-5" aria-labelledby={`group-${group}`}>
            <h2
              id={`group-${group}`}
              className="mb-2 px-1 text-label-md font-semibold text-on-surface-variant"
            >
              {group}
            </h2>

            <ul className="flex flex-col gap-2" role="list">
              {items.map((notif) => {
                const coverId = notif.related_quest_id ?? notif.related_challenge_id;
                return (
                  <li key={notif.id}>
                    <AlertRow
                      notif={notif}
                      cover={coverId ? covers.get(coverId) : undefined}
                      onTap={handleTap}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
