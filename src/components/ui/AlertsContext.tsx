"use client";

/**
 * AlertsContext — shared unread notification count.
 *
 * Fetched once on mount by AlertsProvider (rendered in the (app) layout).
 * Any component in the (app) tree can call useUnreadCount() to read the
 * count and markAllRead() to reset it to 0 after a "Mark all read" action,
 * without a full page reload.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

interface AlertsContextValue {
  unreadCount: number;
  /** Optimistically set unread count to 0. */
  markAllRead: () => void;
  /** Decrement unread count by 1 (used when a single notification is tapped). */
  markOneRead: () => void;
}

const AlertsContext = createContext<AlertsContextValue>({
  unreadCount: 0,
  markAllRead: () => {},
  markOneRead: () => {},
});

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (!cancelled) setUnreadCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, []);

  const markAllRead = useCallback(() => setUnreadCount(0), []);
  const markOneRead = useCallback(
    () => setUnreadCount((n) => Math.max(0, n - 1)),
    []
  );

  return (
    <AlertsContext.Provider value={{ unreadCount, markAllRead, markOneRead }}>
      {children}
    </AlertsContext.Provider>
  );
}

export function useUnreadCount() {
  return useContext(AlertsContext);
}
