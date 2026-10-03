"use client";

/**
 * ExploreClient.tsx — client component for the Explore page.
 *
 * Receives server-fetched data as props and owns all client-side state
 * (search query, filter chips, join state per challenge).
 *
 * Join flow (public challenges):
 *   idle → loading → joined (navigate to /challenges/[id])
 *   If unique-constraint error (already a participant) → treat as joined.
 *
 * Private challenges: show an inline toast on Request click.
 *
 * Type scale: section headings are headline-md (20px), card titles
 * headline-sm (16px) or body-md, metadata body-sm (12px). Nothing here sets
 * an arbitrary pixel size, so a change to the scale moves the whole page.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  Flame,
  Loader2,
  Lock,
  Search,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { FeaturedChallenge, TrendingChallenge } from "./page";

/* ── Filter chips ────────────────────────────────────────────────────────── */
const FILTER_CHIPS = [
  "Trending", "Premium", "Near Me", "My College", "Coding", "AI", "Fitness",
] as const;
type FilterChip = (typeof FILTER_CHIPS)[number];

/* ── Join helper ─────────────────────────────────────────────────────────── */
async function joinChallenge(challengeId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "not-authed" };

  const { error } = await supabase.from("challenge_participants").insert({
    challenge_id: challengeId,
    user_id: user.id,
    status: "active",
  });

  // Unique constraint violation = already a participant → treat as success
  if (error && !error.message.includes("duplicate") && !error.message.includes("unique")) {
    return { error: error.message };
  }
  return { error: null };
}

/* ── Private toast ───────────────────────────────────────────────────────── */
const PRIVATE_MSG = "Private challenges require an invitation — this isn't available yet.";

/* ── Focus ring, shared by every chip, rail card and row link ───────────── */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

/* ── FeaturedCard ────────────────────────────────────────────────────────── */
function FeaturedCard({ challenge }: { challenge: FeaturedChallenge }) {
  return (
    <Link
      href={`/challenges/${challenge.id}`}
      className={`block h-full rounded-xl ${FOCUS_RING}`}
    >
      <Card padding="none" bordered elevation={2} interactive className="h-full overflow-hidden">
        <div className="relative aspect-video w-full bg-surface-variant">
          <Image
            src={challenge.coverImageUrl}
            alt={challenge.title}
            fill
            className="object-cover"
            sizes="280px"
          />
          <div className="absolute left-2 top-2">
            <Badge variant="secondary" className="elev-1">Featured</Badge>
          </div>
          {challenge.verified && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest/85 px-2 py-0.5 backdrop-blur-sm elev-1 surface-raised">
              <CheckCircle2 size={11} className="text-secondary" aria-hidden="true" />
              <span className="text-body-sm font-semibold leading-none text-secondary">
                Verified
              </span>
            </div>
          )}
        </div>
        <div className="space-y-1.5 p-3">
          <h3 className="line-clamp-2 text-headline-sm leading-snug text-on-surface">
            {challenge.title}
          </h3>
          <p className="text-body-sm text-on-surface-variant">by {challenge.creatorName}</p>
          <div className="flex items-center gap-3 pt-0.5 text-body-sm text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Users size={12} aria-hidden="true" />
              {challenge.memberCount.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={12} aria-hidden="true" />
              {challenge.durationLabel}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/* ── TrendingRow ─────────────────────────────────────────────────────────── */
function TrendingRow({
  challenge,
  onPrivateClick,
}: {
  challenge: TrendingChallenge;
  onPrivateClick: () => void;
}) {
  const router = useRouter();
  const [joinState, setJoinState] = useState<"idle" | "loading" | "joined">("idle");
  const [isPending, startTransition] = useTransition();
  const isPublic = challenge.visibility === "public";

  const handleJoin = () => {
    if (!isPublic) { onPrivateClick(); return; }
    if (joinState === "joined" || joinState === "loading") return;

    setJoinState("loading");
    startTransition(async () => {
      const { error } = await joinChallenge(challenge.id);
      if (error === "not-authed") {
        router.push(`/login?next=/challenges/${challenge.id}`);
        return;
      }
      if (error) {
        setJoinState("idle");
        return;
      }
      setJoinState("joined");
      router.push(`/challenges/${challenge.id}`);
    });
  };

  // Not `interactive`: the row holds its own Join button, so the card itself
  // is not a single link target and must not behave like one.
  return (
    <Card bordered padding="sm" className="flex items-center gap-3">
      <Link
        href={`/challenges/${challenge.id}`}
        className={`shrink-0 rounded-lg ${FOCUS_RING}`}
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className="relative h-14 w-14 overflow-hidden rounded-lg bg-surface-variant">
          <Image
            src={challenge.thumbnailUrl}
            alt=""
            fill
            className="object-cover"
            sizes="56px"
          />
        </div>
      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="line-clamp-1 text-body-md font-semibold leading-tight text-on-surface">
          <Link href={`/challenges/${challenge.id}`} className={`rounded-xl ${FOCUS_RING}`}>
            {challenge.title}
          </Link>
        </h3>
        <p className="text-body-sm text-on-surface-variant">{challenge.creatorName}</p>
        <div className="flex items-center gap-3 text-body-sm text-on-surface-variant">
          <span className="flex items-center gap-0.5">
            <Flame size={11} className="text-secondary" aria-hidden="true" />
            Day {challenge.currentDay}/{challenge.totalDays}
          </span>
          <span className="flex items-center gap-1">
            <Users size={11} aria-hidden="true" />
            {challenge.memberCount.toLocaleString()}
          </span>
        </div>
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest"
          role="progressbar"
          aria-valuenow={challenge.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${challenge.title}: ${challenge.progressPercent}% complete`}
        >
          <div
            className="h-full rounded-full bg-secondary transition-all duration-500"
            style={{ width: `${challenge.progressPercent}%` }}
          />
        </div>
      </div>
      <div className="shrink-0">
        {challenge.isParticipant ? (
          <Link
            href={`/challenges/${challenge.id}`}
            className={[
              "inline-flex h-8 items-center rounded-lg px-3",
              "bg-secondary-fixed text-body-sm font-semibold text-on-secondary-fixed-variant",
              "pressable transition-colors hover:bg-secondary-fixed-dim",
              FOCUS_RING,
            ].join(" ")}
          >
            View
          </Link>
        ) : joinState === "joined" ? (
          <div className="flex items-center gap-1 text-body-sm font-semibold text-on-tertiary-fixed-variant">
            <CheckCircle2 size={14} aria-hidden="true" />
            Joined
          </div>
        ) : (
          <Button
            id={`join-${challenge.id}`}
            variant={isPublic ? "primary" : "outline"}
            size="sm"
            onClick={handleJoin}
            disabled={joinState === "loading" || isPending}
            aria-label={isPublic ? `Join ${challenge.title}` : `Request to join ${challenge.title}`}
          >
            {joinState === "loading" || isPending ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : isPublic ? (
              "Join"
            ) : (
              <span className="flex items-center gap-1">
                <Lock size={11} aria-hidden="true" />
                Request
              </span>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ── ExploreClient ───────────────────────────────────────────────────────── */
export interface ExploreClientProps {
  featured: FeaturedChallenge[];
  trending: TrendingChallenge[];
  quests?: import("./page").FeaturedQuest[];
}

export function ExploreClient({ featured, trending, quests = [] }: ExploreClientProps) {
  const [activeChip, setActiveChip] = useState<FilterChip>("Trending");
  const [query, setQuery] = useState("");
  const [privateToast, setPrivateToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const showPrivateToast = () => {
    setPrivateToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setPrivateToast(false), 3500);
  };

  /* Search filters the lists already on the page. It deliberately does not
     hit the network: everything shown here is server-rendered up front, so a
     substring match is both instant and complete for what is visible. The
     lists are a page of ten or so rows each, so there is nothing to memoise. */
  const q = query.trim().toLowerCase();
  const matches = (...fields: (string | null | undefined)[]) =>
    !q || fields.some((f) => f?.toLowerCase().includes(q));

  const shownFeatured = featured.filter((c) => matches(c.title, c.creatorName));
  const shownTrending = trending.filter((c) => matches(c.title, c.creatorName));
  const shownQuests = quests.filter((p) => matches(p.title, p.business_name));

  const nothingMatches =
    q !== "" && !shownFeatured.length && !shownTrending.length && !shownQuests.length;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-gutter py-6 lg:max-w-5xl lg:px-gutter-md">

      {/* ── Private challenge toast ─────────────────────────────────── */}
      {privateToast && (
        <div
          role="status"
          aria-live="polite"
          className={[
            "fixed left-1/2 top-16 z-50 -translate-x-1/2",
            "flex items-center gap-2 rounded-xl px-4 py-3 elev-5",
            "bg-inverse-surface text-body-md font-medium text-inverse-on-surface",
            "animate-in fade-in slide-in-from-top-2 duration-200",
            "w-[calc(100%-2rem)] max-w-sm",
          ].join(" ")}
        >
          <Lock size={14} aria-hidden="true" className="shrink-0" />
          {PRIVATE_MSG}
        </div>
      )}

      {/* ── Headline ─────────────────────────────────────────────────── */}
      <header className="space-y-1">
        <h1 className="text-headline-lg-mobile text-on-surface lg:text-headline-lg">
          Challenges
        </h1>
        <p className="text-body-md text-on-surface-variant">
          Discover communities that help you stay consistent.
        </p>
      </header>

      {/* ── Search ────────────────────────────────────────────────────── */}
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-4 z-10 flex items-center text-on-surface-variant">
          <Search size={17} aria-hidden="true" />
        </span>
        <input
          id="explore-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search challenges, quests or creators…"
          className={[
            "h-11 w-full rounded-full border border-outline-variant pl-10 pr-4",
            "bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant",
            "text-[length:var(--text-body-lg)] elev-1 transition-colors duration-150",
            "focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30",
          ].join(" ")}
          aria-label="Search challenges, quests or creators"
        />
      </div>

      {/* ── Filter chips ──────────────────────────────────────────────── */}
      <div
        className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1 no-scrollbar lg:-mx-gutter-md lg:px-gutter-md"
        role="group"
        aria-label="Filter challenges"
      >
        {FILTER_CHIPS.map((chip) => {
          const isActive = activeChip === chip;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => setActiveChip(chip)}
              aria-pressed={isActive}
              className={[
                "h-8 shrink-0 rounded-full border px-4 text-body-md font-medium",
                "transition-colors duration-150",
                FOCUS_RING,
                isActive
                  ? "border-secondary bg-secondary text-on-secondary elev-1"
                  : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
              ].join(" ")}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {nothingMatches && (
        <p role="status" className="py-8 text-center text-body-lg text-on-surface-variant">
          Nothing matches “{query.trim()}”.
        </p>
      )}

      {/* ── Featured Premium Challenges ─────────────────────────────── */}
      {!nothingMatches && (
        <section aria-labelledby="featured-heading">
          <h2 id="featured-heading" className="mb-3 text-headline-md text-on-surface">
            Featured Premium Challenges
          </h2>
          {shownFeatured.length > 0 ? (
            <ul className="-mx-gutter flex list-none gap-3 overflow-x-auto px-gutter pb-3 no-scrollbar lg:-mx-gutter-md lg:px-gutter-md">
              {shownFeatured.map((c) => (
                <li key={c.id} className="w-[280px] shrink-0">
                  <FeaturedCard challenge={c} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-md text-on-surface-variant">
              No featured challenges yet. Create one to get started.
            </p>
          )}
        </section>
      )}

      {/* ── Trending Challenges ─────────────────────────────────────── */}
      {!nothingMatches && (
        <section aria-labelledby="trending-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="trending-heading" className="text-headline-md text-on-surface">
              Trending Challenges
            </h2>
            <p className="text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
              Active now
            </p>
          </div>
          {shownTrending.length > 0 ? (
            <ul className="grid list-none grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
              {shownTrending.map((c) => (
                <li key={c.id}>
                  <TrendingRow challenge={c} onPrivateClick={showPrivateToast} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-md text-on-surface-variant">
              No challenges found. Be the first to create one.
            </p>
          )}
        </section>
      )}

      {/* ── Active Business Quests ────────────────────────────────── */}
      {!nothingMatches && shownQuests.length > 0 && (
        <section aria-labelledby="quests-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="quests-heading" className="text-headline-md text-on-surface">
              Business Quests
            </h2>
            <Link
              href="/quests"
              className={`rounded-lg text-body-sm font-semibold text-secondary hover:underline ${FOCUS_RING}`}
            >
              View all
            </Link>
          </div>
          <ul className="-mx-gutter flex list-none gap-3 overflow-x-auto px-gutter pb-3 no-scrollbar lg:-mx-gutter-md lg:px-gutter-md">
            {shownQuests.map((p) => (
              <li key={p.id} className="w-[200px] shrink-0">
                <Link
                  href={`/quests/${p.id}`}
                  className={`block h-full rounded-xl ${FOCUS_RING}`}
                >
                  <Card bordered padding="none" elevation={2} interactive className="h-full overflow-hidden">
                    <div className="relative h-28 w-full overflow-hidden bg-surface-variant">
                      {(p.cover_url || p.thumbnail_url) ? (
                        <Image
                          src={p.cover_url ?? p.thumbnail_url ?? ""}
                          alt={p.title}
                          fill
                          className="object-cover"
                          sizes="200px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-surface-container-high">
                          <Target
                            size={28}
                            className="text-on-surface-variant opacity-50"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                      {p.rewards && (
                        /* amber-400 rather than amber-500: on-surface ink needs a
                           light enough field to clear 4.5:1, which 500 does not. */
                        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-body-sm font-bold text-on-surface elev-1">
                          <Trophy size={11} aria-hidden="true" />
                          Reward
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="line-clamp-2 text-body-md font-bold leading-tight text-on-surface">
                        {p.title}
                      </p>
                      {p.business_name && (
                        <p className="text-body-sm text-on-surface-variant">by {p.business_name}</p>
                      )}
                      <p className="flex items-center gap-1 text-body-sm text-on-surface-variant">
                        <Users size={11} aria-hidden="true" />
                        {p.participant_count} joined
                      </p>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
