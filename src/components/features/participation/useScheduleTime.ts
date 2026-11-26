"use client";

import { useEffect, useState } from "react";

export function useScheduleTime(start?: string | null, end?: string | null) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const boundaries = [Date.parse(start ?? ""), Date.parse(end ?? "")].filter(Number.isFinite);
    if (!boundaries.length) return;

    let timer: number;
    function schedule() {
      window.clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      const next = Math.min(...boundaries.filter((boundary) => boundary > current));
      if (Number.isFinite(next)) timer = window.setTimeout(schedule, Math.min(next - current, 2_147_483_647));
    }
    timer = window.setTimeout(schedule, 0);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [start, end]);

  return now;
}
