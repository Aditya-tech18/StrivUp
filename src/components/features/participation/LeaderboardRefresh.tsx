"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function LeaderboardRefresh({ auto = false }: { auto?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!auto) return;
    function refresh() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(interval);
    };
  }, [auto, router]);

  return (
    <button type="button" aria-label="Refresh leaderboard" title="Refresh leaderboard" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="grid size-11 shrink-0 place-items-center rounded-full text-secondary hover:bg-surface-container-high disabled:opacity-50">
      <RefreshCw size={17} aria-hidden="true" className={pending ? "motion-safe:animate-spin" : undefined} />
    </button>
  );
}
