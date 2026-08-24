"use client";

/**
 * Alerts page — /alerts
 *
 * Lists the current user's notifications newest-first. Each row shows:
 *  - Icon based on type (UserPlus, CheckCircle2, XCircle, Users, Bell)
 *  - title + message
 *  - relative timestamp ("2h ago")
 *  - visual distinction between read/unread (dot + tinted background)
 *
 * Tapping a row marks it read (is_read = true) then navigates:
 *  - related_challenge_id → /challenges/[id]
 *  - related_user_id (no challenge) → /profile/[id]
 *  - neither → no navigation, just mark read
 *
 * "Mark all as read" button updates both the DB and the global unread badge.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  Users,
  UserPlus,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";
import { useUnreadCount } from "@/components/ui/AlertsContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type NotificationType =
  | "new_follower"
  | "proof_approved"
  | "proof_rejected"
  | "challenge_joined"
  | string;

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  is_read: boolean;
  related_challenge_id: string | null;
  related_user_id: string | null;
  created_at: string;
}

// ── Icon map ──────────────────────────────────────────────────────────────────

function NotifIcon({ type }: { type: NotificationType }) {
  const cls = "shrink-0 mt-0.5";
  switch (type) {
    case "new_follower":
      return <UserPlus size={20} className={`${cls} text-secondary`} aria-hidden="true" />;
    case "proof_approved":
      return <CheckCircle2 size={20} className={`${cls} text-success`} aria-hidden="true" />;
    case "proof_rejected":
      return <XCircle size={20} className={`${cls} text-error`} aria-hidden="true" />;
    case "challenge_joined":
      return <Users size={20} className={`${cls} text-primary`} aria-hidden="true" />;
    default:
      return <Bell size={20} className={`${cls} text-on-surface-variant`} aria-hidden="true" />;
  }
}

// ── Relative timestamp ────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(isoString).toLocaleDateString();
}

// ── Page component ────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { markAllRead, markOneRead } = useUnreadCount();

  const [notifications, setNotifications] = useState<Notification[]>([]);
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
          "id, type, title, message, is_read, related_challenge_id, related_user_id, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!cancelled) {
        setNotifications((data ?? []) as Notification[]);
        setLoading(false);
      }
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

      // Navigate
      if (notif.related_challenge_id) {
        router.push(`/challenges/${notif.related_challenge_id}`);
      } else if (notif.related_user_id) {
        router.push(`/profile/${notif.related_user_id}`);
      }
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasUnread = notifications.some((n) => !n.is_read);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="type-body-md text-on-surface-variant">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface px-4 py-6 pb-24">
      <div className="mx-auto max-w-xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="type-headline-sm text-on-surface">Alerts</h1>
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

        {/* Empty state */}
        {notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Bell size={40} className="text-on-surface-variant opacity-40" aria-hidden="true" />
            <p className="type-body-lg text-on-surface-variant">No notifications yet.</p>
          </div>
        )}

        {/* Notification list */}
        <ul className="flex flex-col gap-2" role="list">
          {notifications.map((notif) => (
            <li key={notif.id}>
              <button
                type="button"
                onClick={() => handleTap(notif)}
                className={[
                  "w-full text-left rounded-xl px-4 py-3.5 flex items-start gap-3",
                  "transition-colors duration-150 border",
                  notif.is_read
                    ? "bg-surface-container-low border-outline-variant hover:bg-surface-container"
                    : "bg-secondary/5 border-secondary/20 hover:bg-secondary/10",
                ].join(" ")}
                aria-label={notif.title}
              >
                {/* Unread dot */}
                <span className="shrink-0 mt-1.5">
                  {!notif.is_read ? (
                    <span className="block w-2 h-2 rounded-full bg-secondary" aria-hidden="true" />
                  ) : (
                    <span className="block w-2 h-2" aria-hidden="true" />
                  )}
                </span>

                <NotifIcon type={notif.type} />

                <div className="flex-1 min-w-0">
                  <p
                    className={[
                      "type-body-md truncate",
                      notif.is_read ? "text-on-surface" : "font-semibold text-on-surface",
                    ].join(" ")}
                  >
                    {notif.title}
                  </p>
                  {notif.message && (
                    <p className="type-body-md text-on-surface-variant line-clamp-2 mt-0.5">
                      {notif.message}
                    </p>
                  )}
                  <p className="type-body-md text-on-surface-variant/60 mt-1 text-xs">
                    {relativeTime(notif.created_at)}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
