"use client";

/**
 * Facepile — overlapping avatars and "Liked by anna and 85 others".
 *
 * The pattern Instagram uses, and it is worth copying for the reason it
 * works: a bare number is an abstraction, while three faces and one name is
 * evidence that real people are in here. On a young platform that difference
 * decides whether a challenge looks alive or abandoned.
 *
 * Naming one person and counting the rest, rather than listing several
 * names, keeps the line one line at any count and any name length.
 *
 * The whole line is one button opening the full list, so the tap target is
 * the sentence and not just the faces.
 */

import { UserAvatar } from "@/components/ui";
import { displayName, type PersonCard } from "@/lib/data/social";

/** A face in the pile is just a person card; aliased for readability at the
 *  call sites, which pass participants, likers and followers alike. */
export type FacepilePerson = PersonCard;

/** Short handle for the sentence: the @username if there is one. */
function shortName(p: PersonCard): string {
  return p.username ? p.username : displayName(p);
}

export function Facepile({
  people,
  total,
  verb = "Liked by",
  /** What the count is counting, when nobody can be named. */
  noun = "like",
  size = 22,
  onOpen,
  className = "",
}: {
  /** A handful of people to show as faces. Three is plenty at this size. */
  people: FacepilePerson[];
  /** The real total, which is usually larger than `people.length`. */
  total: number;
  verb?: string;
  noun?: string;
  size?: number;
  onOpen?: () => void;
  className?: string;
}) {
  if (total <= 0) return null;

  const faces = people.slice(0, 3);
  const named = faces[0];
  const others = Math.max(0, total - (named ? 1 : 0));

  const label = named
    ? others > 0
      ? `${verb} ${shortName(named)} and ${others.toLocaleString("en-IN")} ${
          others === 1 ? "other" : "others"
        }`
      : `${verb} ${shortName(named)}`
    : // Nobody resolvable (deactivated, blocked, or simply not fetched):
      // fall back to the plain count rather than an empty sentence.
      `${total.toLocaleString("en-IN")} ${total === 1 ? noun : `${noun}s`}`;

  const content = (
    <>
      {faces.length > 0 && (
        <span className="flex shrink-0 items-center" aria-hidden="true">
          {faces.map((p, i) => (
            <span
              key={p.id}
              className="rounded-full ring-2 ring-surface-container-lowest"
              style={{ marginLeft: i === 0 ? 0 : -size / 3 , zIndex: faces.length - i }}
            >
              <UserAvatar src={p.avatarUrl} name={displayName(p)} size={size} />
            </span>
          ))}
        </span>
      )}
      <span className="truncate text-body-sm font-semibold text-on-surface">{label}</span>
    </>
  );

  const base = `flex min-w-0 items-center gap-2 ${className}`;

  if (!onOpen) {
    return <div className={base}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}. See the full list.`}
      className={`${base} rounded-lg text-left transition-colors hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary`}
    >
      {content}
    </button>
  );
}
