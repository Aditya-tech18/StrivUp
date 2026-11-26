"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LeaveParticipationButton({ kind, id, onLeft }: {
  kind: "quest" | "challenge";
  id: string;
  onLeft: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    if (pending || !window.confirm(`Leave this ${kind}? This removes it from your joined list.`)) return;
    setError(null);
    setPending(true);
    const { data, error } = await createClient().rpc("leave_participation", { p_kind: kind, p_id: id });
    setPending(false);

    if (error || data !== "left") {
      setError(data === "has_progress"
        ? `This ${kind} already has recorded progress. Your membership was kept with that history.`
        : `Could not leave this ${kind}. Please try again.`);
      return;
    }
    onLeft();
  }

  return (
    <div>
      <button type="button" onClick={leave} disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-error hover:bg-error/10 disabled:opacity-50">
        <LogOut size={16} aria-hidden="true" /> {pending ? "Leaving…" : `Leave ${kind}`}
      </button>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </div>
  );
}
