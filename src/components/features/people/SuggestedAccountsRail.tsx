"use client";

/**
 * SuggestedAccountsRail — "people worth following", across the top of home.
 *
 * A horizontal rail rather than a list because it is a side offer, not the
 * reason anyone opened the app: it should be glanceable and skippable, and
 * it must not push Today's Tasks below the fold.
 *
 * Each card has to answer "why should I tap this stranger?" in one line, so
 * it leads with what they have finished (or, on a new account, what they are
 * in right now) rather than a follower count nobody can interpret yet. See
 * suggestionBlurb in src/lib/data/social.ts.
 *
 * Dismissing a card hides it for the session only. These are suggestions,
 * and a suggestion that cannot be waved away becomes an advert.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, User, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  displayName, followUser, profileHref, suggestionBlurb, suggestionReason,
  unfollowUser, type SuggestedProfile,
} from "@/lib/data/social";

function Card({
  person,
  viewerId,
  onDismiss,
}: {
  person: SuggestedProfile;
  viewerId: string;
  onDismiss: (id: string) => void;
}) {
  const [supabase] = useState(() => createClient());
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = useCallback(async () => {
    if (busy) return;
    const was = following;
    setBusy(true);
    setFollowing(!was);
    const err = was
      ? await unfollowUser(supabase, viewerId, person.id)
      : await followUser(supabase, viewerId, person.id);
    if (err) setFollowing(was);
    setBusy(false);
  }, [busy, following, person.id, supabase, viewerId]);

  const name = displayName(person);
  const reason = suggestionReason(person);

  return (
    <li className="relative w-40 shrink-0 snap-start">
      <div className="flex h-full flex-col items-center gap-1.5 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 text-center elev-1 surface-raised">
        <button
          type="button"
          onClick={() => onDismiss(person.id)}
          aria-label={`Dismiss ${name}`}
          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
        >
          <X size={14} aria-hidden="true" />
        </button>

        <Link
          href={profileHref(person)}
          className="flex flex-col items-center gap-1.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          {person.avatarUrl ? (
            <Image
              src={person.avatarUrl}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant"
            >
              <User size={26} />
            </span>
          )}

          <span className="line-clamp-1 text-body-sm font-bold text-on-surface">{name}</span>

          {person.bio && (
            <span className="line-clamp-2 text-xs leading-snug text-on-surface-variant">
              {person.bio}
            </span>
          )}

          <span className="line-clamp-2 text-xs font-semibold leading-snug text-secondary">
            {suggestionBlurb(person)}
          </span>

          {reason && (
            <span className="line-clamp-1 text-xs text-on-surface-variant">{reason}</span>
          )}
        </Link>

        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={[
            "mt-auto flex h-9 w-full items-center justify-center rounded-xl text-xs font-bold transition-colors disabled:opacity-60",
            following
              ? "border border-outline-variant text-on-surface-variant hover:bg-surface-container"
              : "bg-secondary text-on-secondary hover:bg-secondary-container",
          ].join(" ")}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : following ? (
            "Following"
          ) : (
            "Follow"
          )}
        </button>
      </div>
    </li>
  );
}

export function SuggestedAccountsRail({
  people,
  viewerId,
}: {
  people: SuggestedProfile[];
  viewerId: string;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = people.filter((p) => !dismissed.has(p.id));

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  if (visible.length === 0) return null;

  return (
    <section className="flex flex-col gap-space-sm" aria-labelledby="suggested-accounts-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="suggested-accounts-heading" className="text-headline-sm text-on-surface">
          People to follow
        </h2>
        <Link href="/search" className="text-label-md font-medium text-secondary hover:underline">
          See all
        </Link>
      </div>

      <ul className="no-scrollbar -mx-gutter flex snap-x snap-mandatory list-none gap-3 overflow-x-auto px-gutter pb-1">
        {visible.map((p) => (
          <Card key={p.id} person={p} viewerId={viewerId} onDismiss={dismiss} />
        ))}
      </ul>
    </section>
  );
}
