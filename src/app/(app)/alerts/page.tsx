"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, MobileMenu } from "@/components/ui";
import { useUnreadCount } from "@/components/ui/AlertsContext";
import { FollowRequests } from "@/components/features/profile/FollowRequests";
import {
  AlertRow,
  destinationFor,
  groupFor,
  GROUPS,
  toneFor,
  type CoverMap,
  type Group,
  type Notification,
} from "@/components/features/alerts/AlertRow";

const FILTERS = ["All", "Unread", "Proof", "Social"] as const;

export default function AlertsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { markAllRead, markOneRead } = useUnreadCount();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [covers, setCovers] = useState<CoverMap>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [markingAll, setMarkingAll] = useState(false);
  const markingIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setLoadError(true);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, type, title, message, is_read, related_challenge_id, related_quest_id, related_user_id, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(true);
        return;
      }
      const rows = (data ?? []) as Notification[];
      setNotifications(rows);

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
  }, [loadAttempt, supabase]);

  function retryLoad() {
    setLoadError(false);
    setLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function handleTap(notif: Notification) {
    if (!notif.is_read) {
      if (markingIds.current.has(notif.id)) return;
      markingIds.current.add(notif.id);
      setActionError(null);

      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notif.id)
        .eq("is_read", false);

      markingIds.current.delete(notif.id);
      if (error) {
        setActionError("Couldn't mark this alert as read. Try again.");
        return;
      }

      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      markOneRead();
    }
    const dest = destinationFor(notif);
    if (dest) router.push(dest.href);
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    setActionError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const result = user
      ? await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", user.id)
          .eq("is_read", false)
      : null;

    setMarkingAll(false);
    if (!result || result.error) {
      setActionError("Couldn't mark alerts as read. Try again.");
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    markAllRead();
  }

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const visibleNotifications = notifications.filter((notification) => {
    switch (filter) {
      case "Unread": return !notification.is_read;
      case "Proof": return toneFor(notification.type).category === "proof";
      case "Social": return toneFor(notification.type).category === "social";
      default: return true;
    }
  });
  const grouped = new Map<Group, Notification[]>();
  for (const notification of visibleNotifications) {
    const group = groupFor(notification.created_at);
    const items = grouped.get(group);
    if (items) items.push(notification);
    else grouped.set(group, [notification]);
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 border-b border-outline-variant/70 bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4 sm:px-6">
          <div className="-ml-2 md:hidden">
            <MobileMenu />
          </div>
          <h1 className="font-display text-lg font-extrabold text-on-surface">Alerts</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-4 pb-10 sm:px-6 sm:pt-6">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-extrabold tracking-tight text-on-surface sm:text-2xl">
              Inbox activity
            </h2>
            <span
              role="status"
              className={unreadCount > 0 ? "rounded-full bg-streak/20 px-2 py-1 text-xs font-bold whitespace-nowrap text-streak-ink" : "sr-only"}
            >
              {unreadCount > 0 ? `${unreadCount} unread` : ""}
            </span>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold whitespace-nowrap text-secondary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-50"
            >
              <CheckCheck size={17} aria-hidden="true" />
              {markingAll ? "Marking…" : "Mark all read"}
            </button>
          )}
        </div>

        <div className="mt-3 mb-5 flex flex-wrap gap-2.5" role="group" aria-label="Filter alerts">
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className="min-h-10 rounded-full border border-outline-variant bg-surface-container-low px-3.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary aria-pressed:border-secondary aria-pressed:bg-secondary aria-pressed:text-on-secondary sm:px-4"
            >
              {option}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-5">
          <FollowRequests />

          {actionError && (
            <p role="alert" className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
              {actionError}
            </p>
          )}

          {loading ? (
            <p role="status" className="rounded-2xl border border-outline-variant bg-surface-container-low p-8 text-center text-sm text-on-surface-variant">
              Loading alerts…
            </p>
          ) : loadError ? (
            <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-low p-8 text-center">
              <p role="alert" className="text-sm text-on-surface">Couldn&apos;t load alerts.</p>
              <Button variant="secondary" onClick={retryLoad}>Try again</Button>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-low px-6 py-10 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-secondary/10 text-secondary">
                <Bell size={22} aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-on-surface">
                {filter === "Unread" ? "You're all caught up." : filter === "All" ? "No alerts yet." : `No ${filter.toLowerCase()} alerts yet.`}
              </p>
            </div>
          ) : GROUPS.map((group, index) => {
            const items = grouped.get(group);
            if (!items) return null;

            const headingId = `alerts-group-${index}`;
            return (
              <section key={group} aria-labelledby={headingId}>
                <h3 id={headingId} className="mb-2.5 flex items-center gap-3 text-xs font-bold tracking-wider text-on-surface-variant uppercase after:h-px after:flex-1 after:bg-outline-variant/80">
                  {group}
                </h3>
                <ul className="flex flex-col gap-2.5" role="list">
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
