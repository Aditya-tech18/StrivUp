"use client";

/**
 * PeopleList and PeopleListSheet — every list of people in the app.
 *
 * Followers, following, who liked a post, who joined a challenge or a quest
 * are all the same list with a different source, so they are one component.
 * The follow button keeps its own optimistic state and the "..." menu opens
 * PersonActionsSheet, which means unfollowing behaves identically wherever
 * you do it.
 *
 * Rows removed by an action (unfollow in the following list, remove in the
 * follower list, block anywhere) disappear through `onRemoved` rather than a
 * refetch, so the list does not jump while someone is working through it.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MoreHorizontal, X } from "lucide-react";
import { UserAvatar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  displayName, followUser, profileHref, unfollowUser, type PersonRow,
} from "@/lib/data/social";
import { PersonActionsSheet, type PersonAction } from "./PersonActionsSheet";

function PersonItem({
  person,
  viewerId,
  canRemoveFollower,
  onRemoved,
  onLinkClick,
}: {
  person: PersonRow;
  viewerId: string | null;
  canRemoveFollower: boolean;
  onRemoved: (id: string) => void;
  onLinkClick?: () => void;
}) {
  const [supabase] = useState(() => createClient());
  const [following, setFollowing] = useState(person.isFollowing);
  const [requested, setRequested] = useState(person.isRequested);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleFollow = useCallback(async () => {
    if (!viewerId || busy) return;
    const wasFollowing = following;
    const wasRequested = requested;

    // Optimistic: the button is the whole interaction, so it has to answer
    // immediately. Reverted below if the write fails.
    setBusy(true);
    if (wasFollowing || wasRequested) {
      setFollowing(false);
      setRequested(false);
    } else {
      setFollowing(true);
    }

    const err =
      wasFollowing || wasRequested
        ? await unfollowUser(supabase, viewerId, person.id)
        : await followUser(supabase, viewerId, person.id);

    if (err) {
      setFollowing(wasFollowing);
      setRequested(wasRequested);
    }
    setBusy(false);
  }, [busy, following, requested, person.id, supabase, viewerId]);

  const handleDone = useCallback(
    (action: PersonAction) => {
      setMenuOpen(false);
      if (action === "unfollowed") {
        setFollowing(false);
        setRequested(false);
        return;
      }
      // Removed or blocked: the row no longer belongs in this list. A report
      // leaves the row alone, since reporting is not a relationship change.
      if (action === "removed" || action === "blocked") onRemoved(person.id);
    },
    [onRemoved, person.id]
  );

  const name = displayName(person);
  const showFollow = viewerId !== null && !person.isSelf;

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Link href={profileHref(person)} onClick={onLinkClick} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
        <UserAvatar src={person.avatarUrl} name={name} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-md font-semibold text-on-surface">{name}</span>
          {person.username && person.fullName && (
            <span className="block truncate text-body-sm text-on-surface-variant">@{person.username}</span>
          )}
          {person.bio && (
            <span className="block truncate text-body-sm text-on-surface-variant">{person.bio}</span>
          )}
        </span>
      </Link>

      {showFollow && (
        <button
          type="button"
          onClick={toggleFollow}
          disabled={busy}
          className={[
            "flex h-9 shrink-0 items-center justify-center rounded-xl px-3.5 text-xs font-bold transition-colors disabled:opacity-60",
            following || requested
              ? "border border-outline-variant text-on-surface-variant hover:bg-surface-container"
              : "bg-secondary text-on-secondary hover:bg-secondary-container",
          ].join(" ")}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : requested ? (
            "Requested"
          ) : following ? (
            "Following"
          ) : (
            "Follow"
          )}
        </button>
      )}

      {showFollow && (
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={`More options for ${name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container"
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      )}

      {menuOpen && viewerId && (
        <PersonActionsSheet
          person={{ ...person, isFollowing: following, isRequested: requested }}
          viewerId={viewerId}
          canRemoveFollower={canRemoveFollower}
          onClose={() => setMenuOpen(false)}
          onDone={handleDone}
        />
      )}
    </li>
  );
}

export function PeopleList({
  people,
  viewerId,
  canRemoveFollower = false,
  emptyMessage = "Nobody here yet.",
  onLinkClick,
}: {
  people: PersonRow[];
  viewerId: string | null;
  canRemoveFollower?: boolean;
  emptyMessage?: string;
  onLinkClick?: () => void;
}) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const visible = people.filter((p) => !removed.has(p.id));

  const handleRemoved = useCallback((id: string) => {
    setRemoved((prev) => new Set(prev).add(id));
  }, []);

  if (visible.length === 0) {
    return <p className="px-4 py-10 text-center text-body-md text-on-surface-variant">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-outline-variant" role="list">
      {visible.map((p) => (
        <PersonItem
          key={p.id}
          person={p}
          viewerId={viewerId}
          canRemoveFollower={canRemoveFollower}
          onRemoved={handleRemoved}
          onLinkClick={onLinkClick}
        />
      ))}
    </ul>
  );
}

/**
 * The same list inside a bottom sheet, for a count you tapped: likes on a
 * post, members of a challenge, people on a quest.
 *
 * Loads on open rather than with the page, because most people never tap the
 * number and a list of 100 profiles is not worth fetching on the chance that
 * they might.
 */
export function PeopleListSheet({
  open,
  title,
  load,
  viewerId,
  emptyMessage,
  onClose,
}: {
  open: boolean;
  title: string;
  load: () => Promise<PersonRow[]>;
  viewerId: string | null;
  emptyMessage?: string;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<PersonRow[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const rows = await load();
      if (!cancelled) setPeople(rows);
    })();
    return () => { cancelled = true; };
    // `load` is a fresh closure each render; depending on it would refetch in
    // a loop. The sheet reloads when it reopens, which is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full bg-primary/50 backdrop-blur-sm" />

      <div className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-outline-variant bg-surface-container-lowest pb-safe elev-5 sm:max-h-[80dvh] sm:max-w-md sm:rounded-2xl sm:pb-0">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-outline-variant px-4">
          <h2 className="text-body-lg font-bold text-on-surface">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {people === null ? (
            <p className="flex items-center justify-center gap-2 py-12 text-body-md text-on-surface-variant">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Loading…
            </p>
          ) : (
            <PeopleList
              people={people}
              viewerId={viewerId}
              emptyMessage={emptyMessage}
              onLinkClick={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
