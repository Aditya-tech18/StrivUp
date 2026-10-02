"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui";
import type { ActivityConnection } from "@/lib/activity/types";

/**
 * ActivityProviderCard — one connectable provider in Settings (spec §23).
 *
 * "Disconnect" here genuinely deletes the stored tokens server-side, so it
 * revokes our ability to read rather than just hiding the row.
 */
export function ActivityProviderCard({
  id,
  label,
  description,
  configured,
  connection,
}: {
  id: string;
  label: string;
  description: string;
  configured: boolean;
  connection: ActivityConnection | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = connection?.status === "connected";

  async function disconnect() {
    if (!confirm(`Disconnect ${label}? Your quest progress so far is kept, but no new activity will be read.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/activity/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not disconnect");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{label}</h3>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                <Check className="h-3 w-3" /> Connected
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>

          {connected && connection?.last_synced_at && (
            <p className="mt-1 text-[11px] text-gray-400">
              Last synced{" "}
              {new Date(connection.last_synced_at).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
          {connection?.status === "expired" && (
            <p className="mt-1 text-[11px] text-amber-700">
              Access expired — reconnect to resume tracking.
            </p>
          )}
          {connection?.last_sync_error && connected && (
            <p className="mt-1 text-[11px] text-red-600">Last sync failed: {connection.last_sync_error}</p>
          )}
        </div>

        {!configured ? (
          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-500">
            Not available
          </span>
        ) : connected ? (
          <Button variant="outline" size="sm" onClick={disconnect} disabled={busy}>
            <Unlink className="h-3.5 w-3.5" />
            {busy ? "…" : "Disconnect"}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              window.location.href = `/api/activity/connect/${id}`;
            }}
          >
            <Link2 className="h-3.5 w-3.5" /> Connect
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
