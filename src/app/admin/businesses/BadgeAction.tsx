"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { setBusinessVerification } from "@/lib/data/admin";

/** Suspend a verified business's badge, or restore a suspended one. Logged with a reason. */
export function BadgeAction({ businessId, name, status }: { businessId: string; name: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "verified" && status !== "suspended") return <span className="text-xs text-on-surface-variant">Via review queue</span>;
  const to = status === "verified" ? "suspended" : "verified";

  const confirm = async () => {
    setBusy(true); setError(null);
    const res = await setBusinessVerification(createClient(), businessId, to, reason.trim());
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setOpen(false); setReason(""); router.refresh();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className={`h-8 rounded-lg border px-2.5 text-xs font-bold ${to === "suspended" ? "border-error-outline text-on-error-container hover:bg-error-container" : "border-success-outline text-on-success-container hover:bg-success-container"}`}>
        {to === "suspended" ? "Suspend badge" : "Restore badge"}
      </button>
    );
  }
  return (
    <div className="flex w-56 flex-col gap-2 rounded-xl border border-outline-variant bg-surface-container-low p-2">
      <p className="text-xs font-bold text-on-surface">{to === "suspended" ? `Remove ${name}'s blue tick?` : `Restore ${name}'s blue tick?`}</p>
      <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} aria-label="Reason" placeholder="Reason (logged)"
        className="rounded-lg border border-outline-variant px-2 py-1 text-sm focus:border-secondary focus:outline-none" />
      {error && <p role="alert" className="text-xs text-on-error-container">{error}</p>}
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setOpen(false)} className="h-8 flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest text-xs font-semibold">Cancel</button>
        <button type="button" onClick={confirm} disabled={busy || !reason.trim()}
          className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-admin-chrome text-xs font-bold text-white disabled:opacity-50">
          {busy && <Loader2 size={12} className="animate-spin" />} Confirm
        </button>
      </div>
    </div>
  );
}
