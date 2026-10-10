"use client";

/**
 * PersonActionsSheet — the "..." menu on a person, Instagram style.
 *
 * One sheet for every list that shows people, so unfollowing from the
 * following list and unfollowing from a likes list do the same thing and
 * look the same doing it.
 *
 * Destructive actions ask for confirmation in place rather than in a second
 * dialog: blocking and removing a follower are both silent to the other
 * person and awkward to undo by hand, so the cost of a mis-tap is real.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Ban, Flag, Loader2, UserMinus, UserX, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  REPORT_REASONS, blockUser, displayName, profileHref, removeFollower,
  reportUser, unfollowUser, type PersonRow,
} from "@/lib/data/social";

export type PersonAction = "unfollowed" | "removed" | "blocked" | "reported";

type Pane = "menu" | "report";

export function PersonActionsSheet({
  person,
  viewerId,
  /** Shows "Remove follower": only meaningful in the viewer's own follower list. */
  canRemoveFollower = false,
  onClose,
  onDone,
}: {
  person: PersonRow;
  viewerId: string;
  canRemoveFollower?: boolean;
  onClose: () => void;
  onDone: (action: PersonAction) => void;
}) {
  const [supabase] = useState(() => createClient());
  const [pane, setPane] = useState<Pane>("menu");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"block" | "remove" | null>(null);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const name = displayName(person);

  async function run(key: string, fn: () => Promise<string | null>, done: PersonAction) {
    setBusy(key);
    setError(null);
    const err = await fn();
    setBusy(null);
    if (err) { setError(err); return; }
    onDone(done);
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Actions for ${name}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full bg-primary/50 backdrop-blur-sm" />

      <div className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-outline-variant bg-surface-container-lowest pb-safe elev-5 sm:max-h-[80dvh] sm:max-w-sm sm:rounded-2xl sm:pb-0">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
          <p className="truncate text-body-md font-bold text-on-surface">{name}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <p role="alert" className="border-b border-outline-variant bg-error/10 px-4 py-2 text-body-sm text-error">
            {error}
          </p>
        )}

        <div className="overflow-y-auto overscroll-contain p-2">
          {pane === "menu" ? (
            <>
              <Link href={profileHref(person)} onClick={onClose} className="flex h-12 items-center rounded-xl px-3 text-body-md font-medium text-on-surface hover:bg-surface-container">
                View profile
              </Link>

              {person.isFollowing || person.isRequested ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run("unfollow", () => unfollowUser(supabase, viewerId, person.id), "unfollowed")}
                  className="flex h-12 w-full items-center gap-2.5 rounded-xl px-3 text-left text-body-md font-medium text-on-surface hover:bg-surface-container disabled:opacity-60"
                >
                  {busy === "unfollow" ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <UserMinus size={17} aria-hidden="true" />}
                  {person.isRequested ? "Cancel request" : "Unfollow"}
                </button>
              ) : null}

              {canRemoveFollower && (
                confirming === "remove" ? (
                  <ConfirmRow
                    label={`Remove ${name} from your followers?`}
                    note="They will not be told, and they can follow you again."
                    busy={busy === "remove"}
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => run("remove", () => removeFollower(supabase, person.id), "removed")}
                  />
                ) : (
                  <button type="button" onClick={() => setConfirming("remove")} className="flex h-12 w-full items-center gap-2.5 rounded-xl px-3 text-left text-body-md font-medium text-on-surface hover:bg-surface-container">
                    <UserX size={17} aria-hidden="true" />
                    Remove follower
                  </button>
                )
              )}

              {confirming === "block" ? (
                <ConfirmRow
                  label={`Block ${name}?`}
                  note="You will not see each other's posts, and you will both be unfollowed. They are not told."
                  destructive
                  busy={busy === "block"}
                  onCancel={() => setConfirming(null)}
                  onConfirm={() => run("block", () => blockUser(supabase, viewerId, person.id), "blocked")}
                />
              ) : (
                <button type="button" onClick={() => setConfirming("block")} className="flex h-12 w-full items-center gap-2.5 rounded-xl px-3 text-left text-body-md font-medium text-error hover:bg-error/10">
                  <Ban size={17} aria-hidden="true" />
                  Block
                </button>
              )}

              <button type="button" onClick={() => setPane("report")} className="flex h-12 w-full items-center gap-2.5 rounded-xl px-3 text-left text-body-md font-medium text-error hover:bg-error/10">
                <Flag size={17} aria-hidden="true" />
                Report
              </button>
            </>
          ) : (
            <div className="space-y-3 p-2">
              <p className="text-body-sm text-on-surface-variant">
                Why are you reporting {name}? This goes to the StrivUp team and
                stays private.
              </p>

              <fieldset className="space-y-1">
                <legend className="sr-only">Reason</legend>
                {REPORT_REASONS.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2.5 text-body-md text-on-surface hover:bg-surface-container">
                    <input
                      type="radio"
                      name="report-reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      className="h-4 w-4 accent-[var(--color-secondary)]"
                    />
                    {r}
                  </label>
                ))}
              </fieldset>

              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Anything else we should know? (optional)"
                className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              />

              <div className="flex gap-2">
                <button type="button" onClick={() => setPane("menu")} className="h-11 flex-1 rounded-xl border border-outline-variant text-body-md font-semibold text-on-surface-variant hover:bg-surface-container">
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run("report", () => reportUser(supabase, viewerId, person.id, reason, details), "reported")}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-error text-body-md font-bold text-white disabled:opacity-60"
                >
                  {busy === "report" && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                  Submit report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmRow({
  label, note, busy, destructive = false, onCancel, onConfirm,
}: {
  label: string;
  note: string;
  busy: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-container p-3">
      <p className="text-body-md font-semibold text-on-surface">{label}</p>
      <p className="mt-0.5 text-body-sm text-on-surface-variant">{note}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onCancel} className="h-10 flex-1 rounded-lg border border-outline-variant text-body-sm font-semibold text-on-surface-variant">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={[
            "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-body-sm font-bold disabled:opacity-60",
            destructive ? "bg-error text-white" : "bg-primary text-on-primary",
          ].join(" ")}
        >
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          Confirm
        </button>
      </div>
    </div>
  );
}
