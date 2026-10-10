"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * FollowRequests — the pending requests on a private account.
 *
 * Without this there was nowhere to accept one. followers.request_status, the
 * UPDATE policy that lets the followed user change it, the BEFORE INSERT
 * trigger that sets it server-side, and the follow_accepted notification were
 * all built; the only missing piece was a screen, so a private account
 * collected requests it could never answer and the follower waited forever.
 *
 * Accepting is an UPDATE to 'accepted', which the policy scopes to
 * followed_id = auth.uid() — the database decides who may accept, not this
 * component. Rejecting deletes the row rather than writing 'rejected', so the
 * same person can ask again later; a stored rejection would silently block
 * every future attempt with no way for either side to see why.
 */

interface PendingRequest {
  followerId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export function FollowRequests() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error: loadError } = await supabase
      .from("followers")
      .select("follower_id, created_at, profiles!follower_id(full_name, username, avatar_url)")
      .eq("followed_id", user.id)
      .eq("request_status", "pending")
      .order("created_at", { ascending: false });

    if (loadError) {
      setError("Couldn't load requests.");
      setLoading(false);
      return;
    }

    setRequests(
      (data ?? []).map((row) => {
        const p = row.profiles as unknown as {
          full_name: string | null;
          username: string | null;
          avatar_url: string | null;
        } | null;
        return {
          followerId: row.follower_id as string,
          name: p?.full_name ?? "Someone",
          username: p?.username ?? null,
          avatarUrl: p?.avatar_url ?? null,
          createdAt: row.created_at as string,
        };
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(followerId: string, accept: boolean) {
    setBusyId(followerId);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error: writeError } = accept
      ? await supabase
          .from("followers")
          .update({ request_status: "accepted" })
          .eq("follower_id", followerId)
          .eq("followed_id", user.id)
      : await supabase
          .from("followers")
          .delete()
          .eq("follower_id", followerId)
          .eq("followed_id", user.id);

    if (writeError) {
      setError(accept ? "Couldn't accept that request." : "Couldn't decline that request.");
      setBusyId(null);
      return;
    }

    setRequests((prev) => prev.filter((r) => r.followerId !== followerId));
    setBusyId(null);
  }

  // Nothing to answer: render nothing rather than an empty card on a screen
  // that most accounts will never need.
  if (loading || requests.length === 0) return null;

  return (
    <section
      aria-label="Follow requests"
      className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised"
    >
      <div className="mb-3 flex items-center gap-2">
        <UserPlus size={16} className="text-secondary" aria-hidden="true" />
        <h2 className="text-body-lg font-bold text-on-surface">
          Follow requests
          <span className="ml-1.5 rounded-full bg-secondary/10 px-2 py-0.5 text-label-sm font-semibold text-secondary">
            {requests.length}
          </span>
        </h2>
      </div>

      <ul className="flex flex-col gap-2">
        {requests.map((request) => (
          <li key={request.followerId} className="flex items-center gap-3">
            <Link
              href={`/u/${request.username ?? request.followerId}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary/10">
                {request.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={request.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-label-sm font-bold text-secondary">
                    {request.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-body-md font-semibold text-on-surface">
                  {request.name}
                </span>
                <span className="block text-label-sm text-on-surface-variant">
                  wants to follow you
                </span>
              </span>
            </Link>

            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                disabled={busyId === request.followerId}
                onClick={() => respond(request.followerId, true)}
                aria-label={`Accept ${request.name}`}
                className="flex h-9 items-center gap-1 rounded-xl bg-secondary px-3 text-label-sm font-semibold text-on-secondary transition-opacity disabled:opacity-50 tap-target"
              >
                {busyId === request.followerId ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Check size={13} aria-hidden="true" />
                )}
                Accept
              </button>
              <button
                type="button"
                disabled={busyId === request.followerId}
                onClick={() => respond(request.followerId, false)}
                aria-label={`Decline ${request.name}`}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant transition-colors hover:text-error disabled:opacity-50 tap-target"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="mt-2 text-label-sm text-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
