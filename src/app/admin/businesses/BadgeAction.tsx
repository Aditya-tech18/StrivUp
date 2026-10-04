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

  if (status !== "verified" && status !== "suspended") return <span className="text-xs text-gray-600">Via review queue</span>;
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
        className={`h-8 rounded-lg border px-2.5 text-xs font-bold ${to === "suspended" ? "border-red-300 text-red-800 hover:bg-red-50" : "border-green-300 text-green-900 hover:bg-green-50"}`}>
        {to === "suspended" ? "Suspend badge" : "Restore badge"}
      </button>
    );
  }
  return (
    <div className="flex w-56 flex-col gap-2 rounded-xl border border-gray-300 bg-gray-50 p-2">
      <p className="text-xs font-bold text-gray-900">{to === "suspended" ? `Remove ${name}'s blue tick?` : `Restore ${name}'s blue tick?`}</p>
      <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} aria-label="Reason" placeholder="Reason (logged)"
        className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-blue-600 focus:outline-none" />
      {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setOpen(false)} className="h-8 flex-1 rounded-lg border border-gray-300 bg-white text-xs font-semibold">Cancel</button>
        <button type="button" onClick={confirm} disabled={busy || !reason.trim()}
          className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-[#0d1c32] text-xs font-bold text-white disabled:opacity-50">
          {busy && <Loader2 size={12} className="animate-spin" />} Confirm
        </button>
      </div>
    </div>
  );
}
