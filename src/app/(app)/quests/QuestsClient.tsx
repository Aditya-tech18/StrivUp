"use client";

/**
 * QuestsClient — quest discovery.
 *
 *  - Hot quests rail (horizontal, snap-scrolled)
 *  - Filter chips: Trending (default), Near Me (geolocation), Premium, categories
 *  - Quest list: one column on phones, two from md up
 *  - Empty state when a filter matches nothing
 *
 * Hot quests are spotlighted above the compact, filterable discovery list.
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Compass, Flame, MapPin, Store, Trophy, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MobileMenu } from "@/components/ui";
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
        aria-hidden="true"
      >
        <MapPin size={iconSize} className="text-secondary" aria-hidden="true" />
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

  const [hotQuest, ...moreHotQuests] = initialHotQuests;
  const spotlight = tab === "all"
    ? hotQuest ?? (activeFilter === "trending" ? initialTrendingQuests[0] : undefined)
    : undefined;

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface/95 pt-safe backdrop-blur-sm">
        <div className="mx-auto flex h-14 measure-page items-center gap-2 px-gutter md:px-gutter-md">
          <MobileMenu />
          <h1 className="text-lg font-extrabold tracking-tight text-on-surface">Local Quests</h1>
        </div>
      </header>
      <div className="mx-auto flex measure-page flex-col gap-5 px-gutter pb-24 pt-5 md:px-gutter-md sm:gap-6">
        <div role="group" aria-label="Quest lists" className="flex flex-wrap gap-2">
          {([
            ["all", "Explore Quests", initialTrendingQuests.length],
            ["mine", "My Quests", myQuests.length],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={[
                "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
                tab === value
                  ? "border-streak bg-streak text-on-streak"
                  : "border-outline-variant bg-surface-container-high text-on-surface-variant hover:text-on-surface",
              ].join(" ")}
            >
              {label}
              <span className="tabular-nums">{count}</span>
            </button>
          ))}
        </div>

        {tab === "all" && (
          <div role="group" aria-label="Filter quests" className="-mx-1 flex gap-2 overflow-x-auto p-1 no-scrollbar">
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
                    "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-bold transition-colors disabled:opacity-60",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
                    active
                      ? "border-secondary bg-secondary/10 text-secondary"
                      : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:text-on-surface",
                  ].join(" ")}
                >
                  {chip.id === "near_me" && <MapPin size={14} aria-hidden="true" />}
                  {busy ? "Loading…" : chip.label}
                </button>
              );
            })}
          </div>
        )}

        {spotlight && (
          <section aria-labelledby="hot-quests-heading" className="space-y-3">
            <h2 id="hot-quests-heading" className="flex items-center gap-2 text-lg font-bold text-on-surface">
              <Flame size={18} className="text-streak-ink" aria-hidden="true" />
              {hotQuest ? "Hot Right Now" : "Local Quest Spotlight"}
            </h2>
            <Link
              href={`/quests/${spotlight.id}`}
              className="group block overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              <div className="relative isolate aspect-[2/1] max-h-72 overflow-hidden">
                <Thumb src={spotlight.thumbnail_url} alt="" className="h-full w-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-105" iconSize={48} />
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/25" />
                <div className="absolute inset-x-3 top-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-streak px-2.5 py-1 text-xs font-bold text-on-streak">
                    <MapPin size={13} aria-hidden="true" /> Local quest
                  </span>
                  {spotlight.category && (
                    <span className="rounded-full bg-[#0B1220]/90 px-2.5 py-1 text-xs font-semibold text-white">{spotlight.category}</span>
                  )}
                </div>
              </div>
              <div className="space-y-2 p-4 sm:p-5">
                <h3 className="text-xl font-bold leading-tight text-on-surface sm:text-2xl">{spotlight.title}</h3>
                {spotlight.business_name && (
                  <p className="flex items-center gap-1.5 text-sm text-on-surface-variant">
                    <Store size={14} className="shrink-0" aria-hidden="true" /> {spotlight.business_name}
                  </p>
                )}
                {spotlight.location_name && (
                  <p className="flex items-center gap-1.5 text-sm text-on-surface-variant">
                    <MapPin size={14} className="shrink-0" aria-hidden="true" /> {spotlight.location_name}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container-high p-2.5">
                  {spotlight.reward_description ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-coin-ink">
                      <Trophy size={15} className="shrink-0" aria-hidden="true" />
                      <span className="line-clamp-2">{spotlight.reward_description}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
                      <Users size={15} aria-hidden="true" /> {spotlight.participant_count} joined
                    </span>
                  )}
                  <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-streak px-3 text-xs font-bold text-on-streak">
                    View quest <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </div>
            </Link>
            {moreHotQuests.length > 0 && (
              <ul className="-mx-1 flex list-none snap-x snap-mandatory gap-3 overflow-x-auto p-1 no-scrollbar" aria-label="More hot quests">
                {moreHotQuests.map((quest) => (
                  <li key={quest.id} className="w-44 shrink-0 snap-start">
                    <Link
                      href={`/quests/${quest.id}`}
                      className="block h-full overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                    >
                      <Thumb src={quest.thumbnail_url} alt="" className="h-24 w-full" />
                      <div className="space-y-1 px-3 py-2.5">
                        <h3 className="line-clamp-2 text-sm font-bold text-on-surface">{quest.title}</h3>
                        {quest.location_name && (
                          <p className="flex items-center gap-1 text-xs text-on-surface-variant">
                            <MapPin size={13} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">{quest.location_name}</span>
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {geolocationError && (
          <div role="status" className="flex gap-2 rounded-xl border border-error/30 bg-error/10 px-4 py-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p className="text-body-md text-error">{geolocationError}</p>
          </div>
        )}

        {!geolocationError && unpinnedNotice && (
          <div role="status" className="flex gap-2 rounded-xl border border-outline-variant bg-surface-container px-4 py-3">
            <MapPin size={18} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
            <p className="text-body-md text-on-surface-variant">
              None of the live quests have a map pin yet, so they’re listed in trending order.
            </p>
          </div>
        )}

        <section aria-labelledby="quest-results-heading" className="space-y-3">
          <h2 id="quest-results-heading" className="flex items-center gap-2 text-lg font-bold text-on-surface">
            <Compass size={18} className="text-secondary" aria-hidden="true" />
            {tab === "mine" ? "Joined Quests" : "Discover Quests"}
          </h2>
          {visibleQuests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest px-5 py-10 text-center">
              <MapPin size={32} className="text-on-surface-variant" aria-hidden="true" />
              <p className="text-sm text-on-surface-variant">
                {tab === "mine" ? "You have not joined a quest yet." : "No quests match this filter."}
              </p>
            </div>
          ) : (
            <ul className="grid list-none grid-cols-1 gap-3 lg:grid-cols-2">
              {visibleQuests.map((quest) => (
                <li key={quest.id}>
                  <Link
                    href={`/quests/${quest.id}`}
                    className="group flex h-full min-w-0 items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 transition-colors hover:border-secondary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                  >
                    <Thumb src={quest.thumbnail_url} alt="" className="h-16 w-16 shrink-0 overflow-hidden rounded-lg sm:h-20 sm:w-20" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="line-clamp-2 text-sm font-bold text-on-surface">{quest.title}</h3>
                      {quest.business_name && <p className="truncate text-xs text-on-surface-variant">{quest.business_name}</p>}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
                        {quest.location_name && (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <MapPin size={13} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">{quest.location_name}</span>
                          </span>
                        )}
                        {typeof quest.distance === "number" && (
                          <span className="font-semibold text-secondary">{formatDistance(quest.distance)}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {quest.category && (
                          <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-semibold text-on-surface-variant">{quest.category}</span>
                        )}
                        {quest.participant_count > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
                            <Users size={13} aria-hidden="true" /> {quest.participant_count} joined
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight size={16} className="mt-0.5 shrink-0 text-on-surface-variant group-hover:text-secondary" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
