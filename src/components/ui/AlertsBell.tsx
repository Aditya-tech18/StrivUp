"use client";

/**
 * AlertsBell — the notification bell, with its unread count.
 *
 * NEW: the bottom bar used to carry Alerts and its badge, and that slot went
 * to Challenges. The bell was already in the home header; this is the same
 * bell with the badge moved onto it, so the unread count is still visible
 * from the home screen without a tab of its own.
 *
 * A client component only because the count is client state from
 * AlertsContext. The pages that use it stay server components.
 */

import Link from "next/link";
import { Bell } from "lucide-react";
import { useUnreadCount } from "./AlertsContext";

export function AlertsBell({ className = "" }: { className?: string }) {
  const { unreadCount } = useUnreadCount();

  return (
    <Link
      href="/alerts"
      aria-label={
        unreadCount > 0 ? `Alerts, ${unreadCount} unread` : "Alerts"
      }
      className={[
        "relative flex h-11 w-11 items-center justify-center rounded-full",
        "text-on-surface-variant transition-colors hover:text-on-surface",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
        className,
      ].filter(Boolean).join(" ")}
    >
      <Bell size={22} strokeWidth={1.75} aria-hidden="true" />
      {unreadCount > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-error px-1 text-label-sm font-bold leading-4 text-white"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
