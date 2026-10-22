"use client";

/**
 * QuestsClient — quest discovery.
 *
 *  - Hot quests rail (horizontal, snap-scrolled)
 *  - Filter chips: Trending (default), Near Me (geolocation), Premium, categories
 *  - Quest list: one column on phones, two from md up
 *  - Empty state when a filter matches nothing
 *
 * Layout notes: the page shell is capped at max-w-2xl on phones and widens to
 * measure-page from lg, where the list becomes a grid. Depth comes from Card's
 * elevation and `interactive`, never from ad-hoc hover:shadow-* classes, so
 * every raised surface in the app lifts by the same amount.
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { MapPin, AlertCircle, Users, ImageOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, MobileMenu } from "@/components/ui";
import type { Quest } from "@/lib/data/quests";
import { sortQuestsByDistance } from "@/lib/data/quests";
import {
  GeoError,
  clearCachedFix,
  formatDistance,
  geoErrorMessage,
  getFixCached,
} from "@/lib/location/geo";

interface QuestsClientProps {
  initialHotQuests: Quest[];
  initialTrendingQuests: Quest[];
  availableCategories: string[];
  /** Quests the viewer has joined, for the My Quest tab. */
  myQuests?: Quest[];
}

/** The two halves of this screen: everything, and yours. */
type QuestTab = "all" | "mine";

type FilterType = "trending" | "near_me" | "premium" | string;

/** A quest the Near Me sort has measured. `distance` is metres, or null when
 *  the quest carries no map pin. */
type QuestWithDistance = Quest & { distance?: number | null };

/**
 * Quest thumbnails are optional in the schema, and an <img> with src="" renders
 * the browser's broken-image glyph. This draws a neutral tile instead.
 */
function Thumb({
  src,
  alt,
  className,
  iconSize = 20,
}: {
  src: string | null;
  alt: string;
  className: string;
  iconSize?: number;
}) {
  if (!src) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-surface-container-high`}
        role="img"
        aria-label={`${alt} (no image)`}
      >
        <ImageOff size={iconSize} className="text-on-surface-variant opacity-50" aria-hidden="true" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`${className} object-cover`}
    />
  );
}

export default function QuestsClient({
  initialHotQuests,
  initialTrendingQuests,
  availableCategories,
  myQuests = [],
}: QuestsClientProps) {
  const [supabase] = useState(() => createClient());

  /* CHANGED: a Quest / My Quest pair above the filters, matching the
     Challenges / My Challenges pair on the challenges page so the two halves
     of the product behave the same way. The filter chips below belong to the
     Quest tab: Trending, Near Me and Premium are ways of sorting discovery,
     and none of them mean anything applied to a list of five quests you have
     already joined. */
  const [tab, setTab] = useState<QuestTab>("all");
  const [activeFilter, setActiveFilter] = useState<FilterType>("trending");
  /* Distance is attached only by the Near Me sort, so it is optional here
     rather than a second parallel list the render would have to reconcile. */
  const [questList, setQuestList] = useState<QuestWithDistance[]>(initialTrendingQuests);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const [loadingNearMe, setLoadingNearMe] = useState(false);
  /* Set when Near Me ran but no quest in the list carries coordinates, so the
     order is still the Trending order. Saying so beats a list that silently
     ignores the filter. */
  const [unpinnedNotice, setUnpinnedNotice] = useState(false);

  /* One list, two sources. The My Quest tab reuses the same row markup as
     discovery rather than a second copy of it, so a change to how a quest
     reads happens once. */
  const visibleQuests: QuestWithDistance[] = tab === "mine" ? myQuests : questList;

  const filterChips: { id: FilterType; label: string }[] = [
    { id: "trending", label: "Trending" },
    { id: "near_me", label: "Near Me" },
    { id: "premium", label: "Premium" },
    ...availableCategories.map((cat) => ({ id: cat, label: cat })),
  ];

  const handleFilterChange = useCallback(
    (filterId: FilterType) => {
      setActiveFilter(filterId);
      setGeolocationError(null);
      setUnpinnedNotice(false);

      if (filterId === "trending") {
        setQuestList(initialTrendingQuests);
      } else if (filterId === "near_me") {
        setLoadingNearMe(true);
        /* One async path for every outcome, replacing the nested success and
           error callbacks. getFixCached also means tapping away and back does
           not re-prompt or re-spin the radio within the cache window — the fix
           lives in sessionStorage and never reaches the server. */
        void (async () => {
          try {
            const fix = await getFixCached();
            /* Reorders the same list Trending shows rather than running a
               second, narrower query, so Near Me can never surface a
               different set of quests. */
            const nearbyQuests = await sortQuestsByDistance(
              supabase,
              initialTrendingQuests,
              fix.latitude,
              fix.longitude
            );
            setQuestList(nearbyQuests);
            setUnpinnedNotice(
              nearbyQuests.length > 0 && nearbyQuests.every((q) => q.distance === null)
            );
          } catch (err) {
            if (err instanceof GeoError) {
              if (err.kind === "denied") clearCachedFix();
              setGeolocationError(geoErrorMessage(err));
            } else {
              console.error("Error fetching nearby quests:", err);
              setGeolocationError("Failed to load nearby quests.");
            }
            setQuestList(initialTrendingQuests);
            setActiveFilter("trending");
          } finally {
            setLoadingNearMe(false);
          }
        })();
      } else if (filterId === "premium") {
        setQuestList(initialTrendingQuests);
      } else {
        setQuestList(initialTrendingQuests.filter((q) => q.category === filterId));
      }
    },
    [initialTrendingQuests, supabase]
  );

  return (
    <div className="min-h-screen bg-surface px-gutter py-6 pb-24 md:px-gutter-md">
      <div className="mx-auto flex measure-page flex-col gap-8">
        <header>
          <div className="flex items-center gap-1.5">
            <MobileMenu />
            <h1 className="text-headline-lg-mobile text-on-surface lg:text-headline-lg">
              Quests
            </h1>
          </div>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Discover local opportunities and earn rewards
          </p>
        </header>

        {/* ── Quest / My Quest ──────────────────────────────────────── */}
        <div
          role="tablist"
          aria-label="All quests or your own"
          className="mb-4 flex h-12 items-center gap-1 rounded-xl bg-surface-container p-1"
        >
          {([
            ["all", "Quest", initialTrendingQuests.length],
            ["mine", "My Quest", myQuests.length],
          ] as const).map(([value, label, count]) => {
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(value)}
                className={[
                  "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg",
                  "text-label-lg font-semibold transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
                  active
                    ? "bg-surface-container-lowest text-on-surface elev-1"
                    : "text-on-surface-variant hover:text-on-surface",
                ].join(" ")}
              >
                {label}
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-label-sm font-bold tabular-nums",
                    active ? "bg-secondary text-white" : "bg-surface-container-high",
                  ].join(" ")}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Hot quests rail */}
        {tab === "all" && initialHotQuests.length > 0 && (
          <section aria-labelledby="hot-quests-heading">
            <h2
              id="hot-quests-heading"
              className="mb-3 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant"
            >
              Hot Right Now
            </h2>
            <ul className="-mx-gutter flex snap-x snap-mandatory list-none gap-3 overflow-x-auto px-gutter pb-3 no-scrollbar md:-mx-gutter-md md:px-gutter-md">
              {initialHotQuests.map((quest) => (
                <li key={quest.id} className="w-48 shrink-0 snap-start">
                  <Link
                    href={`/quests/${quest.id}`}
                    className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                  >
                    <Card
                      bordered
                      padding="none"
                      elevation={2}
                      interactive
                      className="h-full overflow-hidden"
                    >
                      <div className="relative h-28 w-full overflow-hidden bg-surface-container">
                        <Thumb
                          src={quest.thumbnail_url}
                          alt={quest.title}
                          className="h-full w-full"
                          iconSize={24}
                        />
                        {/* Scrim: keeps the title legible if the art is pale. */}
                        <div
                          className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="p-3">
                        <h3 className="line-clamp-2 text-body-md font-semibold text-on-surface">
                          {quest.title}
                        </h3>
                        <p className="mt-1 truncate text-body-sm text-on-surface-variant">
                          {quest.business_name}
                        </p>
                        <p className="mt-2 flex items-center gap-1 text-body-sm text-on-surface-variant">
                          <MapPin size={14} className="shrink-0" aria-hidden="true" />
                          <span className="truncate">{quest.location_name}</span>
                        </p>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Filters. Quest tab only: Trending, Near Me and Premium are ways of
            sorting discovery, and none of them mean anything applied to the
            handful of quests you have already joined. */}
        {tab === "all" && (
        <div
          role="group"
          aria-label="Filter quests"
          className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-2 no-scrollbar md:-mx-gutter-md md:px-gutter-md"
        >
          {filterChips.map((chip) => {
            const active = activeFilter === chip.id;
            const busy = loadingNearMe && chip.id === "near_me";
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleFilterChange(chip.id)}
                disabled={busy}
                aria-pressed={active}
                className={[
                  "whitespace-nowrap rounded-full border px-4 py-2 text-body-sm font-medium",
                  "transition-colors duration-150 disabled:opacity-60",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
                  active
                    ? "border-secondary bg-secondary text-on-secondary elev-1"
                    : "border-outline-variant bg-surface-container text-on-surface-variant hover:border-outline",
                ].join(" ")}
              >
                {busy ? "Loading…" : chip.label}
              </button>
            );
          })}
        </div>
        )}

        {geolocationError && (
          <div
            role="status"
            className="flex gap-2 rounded-xl border border-error/30 bg-error/10 px-4 py-3"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p className="text-body-md text-error">{geolocationError}</p>
          </div>
        )}

        {!geolocationError && unpinnedNotice && (
          <div
            role="status"
            className="flex gap-2 rounded-xl border border-outline-variant bg-surface-container px-4 py-3"
          >
            <MapPin size={18} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
            <p className="text-body-md text-on-surface-variant">
              None of the live quests have a map pin yet, so these are ordered
              the way Trending orders them.
            </p>
          </div>
        )}

        {/* Quest list */}
        {visibleQuests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <MapPin size={40} className="text-on-surface-variant opacity-40" aria-hidden="true" />
            <p className="text-body-lg text-on-surface-variant">
              {tab === "mine"
                ? "You have not joined a quest yet."
                : "No quests yet — check back soon."}
            </p>
          </div>
        ) : (
          <ul className="grid list-none grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
            {visibleQuests.map((quest) => (
              <li key={quest.id}>
                <Link
                  href={`/quests/${quest.id}`}
                  className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                >
                  <Card bordered padding="md" interactive className="h-full">
                    <div className="flex gap-3">
                      <Thumb
                        src={quest.thumbnail_url}
                        alt={quest.title}
                        className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-container"
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-body-md font-semibold text-on-surface">
                          {quest.title}
                        </h3>
                        <p className="mt-0.5 truncate text-body-sm text-on-surface-variant">
                          {quest.business_name}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-body-sm text-on-surface-variant">
                          <MapPin size={14} className="shrink-0" aria-hidden="true" />
                          <span className="truncate">{quest.location_name}</span>
                        </p>
                        {/* The sort already computed this and used to throw it
                            away, leaving Near Me reordering the list with no
                            visible reason. */}
                        {typeof quest.distance === "number" && (
                          <p className="mt-0.5 text-body-sm font-medium text-secondary">
                            {formatDistance(quest.distance)}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{quest.category}</Badge>
                          {quest.participant_count > 0 && (
                            <span className="flex items-center gap-1 text-body-sm text-on-surface-variant">
                              <Users size={13} aria-hidden="true" />
                              {quest.participant_count} joined
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
