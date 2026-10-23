/**
 * DiscoverList — the home screen for somebody who has joined nothing yet.
 *
 * Deliberately plain: a vertical list of rows in the same card style the rest
 * of the app uses, busiest first, with the participant count as the only
 * number on each row. No rail, no carousel, no illustration. Someone who has
 * joined nothing needs to see what is worth joining, not a layout.
 *
 * The "newest" link at the foot is the small, unobtrusive way out for a
 * person who does not want the popular ones. A row and a link, nothing that
 * interrupts: a pop-up on an empty home screen would be the second thing a
 * brand new account sees, and the first thing it dismisses.
 */

import Link from "next/link";
import { ArrowRight, Target, Trophy, Users } from "lucide-react";
import type { DiscoverItem } from "@/lib/data/discover";

function Row({ item }: { item: DiscoverItem }) {
  const isQuest = item.kind === "quest";

  return (
    <Link
      href={`/${isQuest ? "quests" : "challenges"}/${item.id}`}
      className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 elev-1 surface-raised transition-colors hover:bg-surface-container-low"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-container">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-container-high">
            {isQuest
              ? <Trophy size={20} className="text-on-surface-variant opacity-50" aria-hidden="true" />
              : <Target size={20} className="text-on-surface-variant opacity-50" aria-hidden="true" />}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-body-md font-bold text-on-surface">{item.title}</p>
        {item.subtitle && (
          <p className="mt-0.5 truncate text-body-sm text-on-surface-variant">{item.subtitle}</p>
        )}
        <span className="mt-1 inline-flex items-center gap-1 text-label-sm font-semibold text-on-surface-variant">
          <Users size={11} aria-hidden="true" />
          {item.participants} {item.participants === 1 ? "person" : "people"}
          <span className="ml-1 rounded-full bg-surface-container px-1.5 py-0.5">
            {isQuest ? "Quest" : "Challenge"}
          </span>
        </span>
      </div>
    </Link>
  );
}

export function DiscoverList({ items }: { items: DiscoverItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-space-sm" aria-label="Popular right now">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-headline-sm text-on-surface">Popular right now</h3>
        <Link
          href="/explore"
          className="shrink-0 text-label-md font-medium text-secondary hover:underline"
        >
          See all
        </Link>
      </div>

      <p className="text-body-sm text-on-surface-variant">
        You have not joined anything yet. These are the busiest ones running.
      </p>

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <Row key={`${item.kind}-${item.id}`} item={item} />
        ))}
      </div>

      {/* The small way out, for someone who wants the new ones instead of the
          busy ones. A link, not a dialog. */}
      <Link
        href="/quests"
        className="inline-flex items-center gap-1.5 self-start rounded-xl border border-outline-variant px-3.5 py-2 text-label-md font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low tap-target"
      >
        Browse new quests and challenges
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
