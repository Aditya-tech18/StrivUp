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
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-on-surface">{label}</h3>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-container px-2 py-0.5 text-label-sm font-medium text-on-success-container">
                <Check className="h-3 w-3" /> Connected
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-on-surface-variant">{description}</p>

          {connected && connection?.last_synced_at && (
            <p className="mt-1 text-label-sm text-on-surface-variant">
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
            <p className="mt-1 text-label-sm text-on-warning-container">
              Access expired — reconnect to resume tracking.
            </p>
          )}
          {connection?.last_sync_error && connected && (
            <p className="mt-1 text-label-sm text-on-error-container">Last sync failed: {connection.last_sync_error}</p>
          )}
        </div>

        {!configured ? (
          <span className="shrink-0 rounded-full bg-surface-container px-2.5 py-1 text-label-sm text-on-surface-variant">
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

      {error && <p className="mt-2 text-xs text-on-error-container">{error}</p>}
    </div>
  );
}
