"use client";

/**
 * QuestsClient — interactive quests discovery UI
 *
 * Features:
 *  - Hot quests carousel (horizontal scroll)
 *  - Filter chips: Trending (default), Near Me (with geolocation), Premium, + categories
 *  - Vertical scrolling list of all active quests
 *  - Empty state: "No quests yet — check back soon."
 */

import { useEffect, useState, useCallback, useTransition } from "react";
import Link from "next/link";
import { MapPin, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, Badge } from "@/components/ui";
import type { Quest } from "@/lib/data/quests";
import { getQuestsByDistance } from "@/lib/data/quests";

interface QuestsClientProps {
  initialHotQuests: Quest[];
  initialTrendingQuests: Quest[];
  availableCategories: string[];
}

type FilterType = "trending" | "near_me" | "premium" | string;

export default function QuestsClient({
  initialHotQuests,
  initialTrendingQuests,
  availableCategories,
}: QuestsClientProps) {
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // State
  const [activeFilter, setActiveFilter] = useState<FilterType>("trending");
  const [questList, setQuestList] = useState<Quest[]>(initialTrendingQuests);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const [loadingNearMe, setLoadingNearMe] = useState(false);

  // Filter chips definition
  const filterChips: { id: FilterType; label: string }[] = [
    { id: "trending", label: "Trending" },
    { id: "near_me", label: "Near Me" },
    { id: "premium", label: "Premium" },
    ...availableCategories.map((cat) => ({ id: cat, label: cat })),
  ];

  // Handle filter changes
  const handleFilterChange = useCallback(
    (filterId: FilterType) => {
      setActiveFilter(filterId);
      setGeolocationError(null);

      if (filterId === "trending") {
        setQuestList(initialTrendingQuests);
      } else if (filterId === "near_me") {
        // Request geolocation
        setLoadingNearMe(true);
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const { latitude, longitude } = position.coords;
              try {
                const nearbyQuests = await getQuestsByDistance(
                  supabase,
                  latitude,
                  longitude
                );
                setQuestList(nearbyQuests);
              } catch (err) {
                console.error("Error fetching nearby quests:", err);
                setGeolocationError("Failed to load nearby quests.");
              } finally {
                setLoadingNearMe(false);
              }
            },
            (error) => {
              setLoadingNearMe(false);
              if (error.code === error.PERMISSION_DENIED) {
                setGeolocationError(
                  "Location permission denied. Enable location to see nearby quests."
                );
              } else if (error.code === error.POSITION_UNAVAILABLE) {
                setGeolocationError(
                  "Your location is unavailable. Please check your device settings."
                );
              } else {
                setGeolocationError(
                  "Unable to retrieve your location. Please try again."
                );
              }
              // Fallback to trending
              setQuestList(initialTrendingQuests);
              setActiveFilter("trending");
            }
          );
        } else {
          setGeolocationError(
            "Geolocation is not supported on your device."
          );
          setLoadingNearMe(false);
          setQuestList(initialTrendingQuests);
          setActiveFilter("trending");
        }
      } else if (filterId === "premium") {
        // Premium filter (placeholder for future)
        setQuestList(initialTrendingQuests);
      } else {
        // Category filter
        const filtered = initialTrendingQuests.filter(
          (q) => q.category === filterId
        );
        setQuestList(filtered);
      }
    },
    [initialTrendingQuests, supabase]
  );

  return (
    <div className="min-h-screen bg-surface px-4 py-6 pb-24">
      <div className="mx-auto max-w-2xl flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="type-headline-sm text-on-surface mb-1">Quests</h1>
          <p className="type-body-md text-on-surface-variant">
            Discover local opportunities and earn rewards
          </p>
        </div>

        {/* Hot Quests Carousel */}
        {initialHotQuests.length > 0 && (
          <div>
            <h2 className="type-label-caps text-on-surface-variant mb-3">
              Hot Right Now
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
              {initialHotQuests.map((quest) => (
                <Link
                  key={quest.id}
                  href={`/quests/${quest.id}`}
                  className="flex-shrink-0 w-48 snap-start"
                >
                  <Card
                    bordered
                    padding="none"
                    className="overflow-hidden hover:shadow-md transition-shadow duration-200"
                  >
                    <div className="relative w-full h-28 bg-surface-container overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={quest.thumbnail_url || ""}
                        alt={quest.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    </div>
                    <div className="p-3">
                      <h3 className="type-body-md font-semibold text-on-surface line-clamp-2">
                        {quest.title}
                      </h3>
                      <p className="type-body-sm text-on-surface-variant truncate mt-1">
                        {quest.business_name}
                      </p>
                      <div className="flex items-center gap-1 mt-2 text-on-surface-variant">
                        <MapPin size={14} aria-hidden="true" />
                        <span className="type-body-sm text-xs">
                          {quest.location_name}
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Filter Chips */}
        <div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            {filterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleFilterChange(chip.id)}
                disabled={loadingNearMe && chip.id === "near_me"}
                className={[
                  "px-4 py-2 rounded-full type-body-sm font-medium whitespace-nowrap transition-colors duration-150",
                  "border",
                  activeFilter === chip.id
                    ? "bg-secondary text-on-secondary border-secondary"
                    : "bg-surface-container text-on-surface-variant border-outline-variant hover:border-outline",
                ].join(" ")}
              >
                {loadingNearMe && chip.id === "near_me"
                  ? "Loading…"
                  : chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Geolocation Error */}
        {geolocationError && (
          <div className="flex gap-2 rounded-lg bg-error/10 border border-error/30 px-4 py-3">
            <AlertCircle
              size={18}
              className="shrink-0 mt-0.5 text-error"
              aria-hidden="true"
            />
            <p className="type-body-md text-error text-sm">{geolocationError}</p>
          </div>
        )}

        {/* Quests List */}
        <div>
          {questList.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <MapPin size={40} className="text-on-surface-variant opacity-40" aria-hidden="true" />
              <p className="type-body-lg text-on-surface-variant">
                No quests yet — check back soon.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {questList.map((quest) => (
                <Link key={quest.id} href={`/quests/${quest.id}`}>
                  <Card
                    bordered
                    padding="md"
                    className="hover:bg-surface-container/50 transition-colors duration-200 cursor-pointer"
                  >
                    <div className="flex gap-3">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0 w-24 h-24 rounded-lg bg-surface-container overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={quest.thumbnail_url || ""}
                          alt={quest.title}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="type-body-md font-semibold text-on-surface line-clamp-2">
                            {quest.title}
                          </h3>
                        </div>
                        <p className="type-body-sm text-on-surface-variant truncate">
                          {quest.business_name}
                        </p>
                        <p className="type-body-sm text-on-surface-variant flex items-center gap-1 mt-1">
                          <MapPin size={14} aria-hidden="true" />
                          {quest.location_name}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {quest.category}
                          </Badge>
                          {quest.participant_count > 0 && (
                            <span className="type-body-sm text-on-surface-variant text-xs">
                              {quest.participant_count} joined
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
