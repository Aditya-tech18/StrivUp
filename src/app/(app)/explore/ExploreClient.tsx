"use client";

/**
 * ExploreClient — discover local quests and public challenges, or browse
 * the challenges you've already joined.
 *
 * Both datasets arrive as props from the server component, so switching tabs
 * and typing in the search box are pure client work: no spinner, no refetch.
 *
 * Join flow (public challenges):
 *   idle → loading → joined (navigate to /challenges/[id])
 *   A unique-constraint error means "already a participant", so it counts as
 *   success.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Compass,
  Bell,
  Calendar,
  CheckCircle2,
  Flame,
  Loader2,
  Lock,
  MapPin,
  Search,
  Store,
  Target,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { Badge, Button, Card, MobileMenu } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { ShareButton } from "@/components/features/share/ShareButton";
import type { FeaturedChallenge, FeaturedQuest, TrendingChallenge } from "./page";

type View = "discover" | "quests" | "challenges" | "mine";

/* ── Join helper ─────────────────────────────────────────────────────────── */
/**
 * The user id comes from the locally cached session rather than getUser().
 *
 * getUser() re-validates the token against the auth server, which is a second
 * network round trip paid before the insert even starts, on the one tap the
 * whole screen exists for. It is the right call when the id is the thing
 * being trusted, and the wrong one here: the INSERT policy on
 * challenge_participants is WITH CHECK (user_id = auth.uid()), so Postgres
 * rejects a row that claims someone else's id no matter what this sends. The
 * id is a payload field, not an authorization decision.
 */
async function joinChallenge(challengeId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return { error: "not-authed" };

  const { error } = await supabase.from("challenge_participants").insert({
    challenge_id: challengeId,
    user_id: userId,
    status: "active",
  });

  if (error && !error.message.includes("duplicate") && !error.message.includes("unique")) {
    return { error: error.message };
  }
  return { error: null };
}

const PRIVATE_MSG = "Private challenges require an invitation — this isn't available yet.";

/* Shared focus ring. Every tappable thing on this screen uses it, so keyboard
   focus is visible and the 2px offset keeps it clear of the card edge. */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

/* ── Quest card ──────────────────────────────────────────────────────────── */
function QuestCard({ quest, spotlight = false }: { quest: FeaturedQuest; spotlight?: boolean }) {
  const art = quest.cover_url ?? quest.thumbnail_url ?? null;
  const hasReward = Boolean(quest.rewards?.length);
  return (
    <article className="flex h-full flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest">
      <Link href={`/quests/${quest.id}`} className={`group block rounded-t-2xl ${FOCUS_RING}`}>
        <div className={`relative isolate w-full overflow-hidden rounded-t-2xl bg-surface-variant ${spotlight ? "aspect-[2/1] max-h-72" : "aspect-video"}`}>
          {art ? (
            <Image
              src={art}
              alt=""
              fill
              sizes={spotlight ? "(min-width: 1024px) 960px, 100vw" : "(min-width: 1024px) 480px, 100vw"}
              className="object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-surface-container-high via-secondary/20 to-surface-container">
              <MapPin size={48} strokeWidth={1.25} className="text-secondary" aria-hidden="true" />
            </div>
          )}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/25" />
          <div className="absolute inset-x-3 top-3 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-streak px-2.5 py-1 text-xs font-bold text-on-streak">
              <MapPin size={13} aria-hidden="true" />
              Local quest
            </span>
            {quest.category && (
              <span className="rounded-full bg-[#0B1220]/90 px-2.5 py-1 text-xs font-semibold text-white">{quest.category}</span>
            )}
          </div>
        </div>
        <div className="space-y-2 p-4 sm:p-5">
          <h3 className={`line-clamp-2 font-bold leading-tight text-on-surface ${spotlight ? "text-xl sm:text-2xl" : "text-lg"}`}>
            {quest.title}
          </h3>
          {quest.business_name && (
            <p className="flex items-center gap-1.5 truncate text-body-sm text-on-surface-variant">
              <Store size={13} className="shrink-0" aria-hidden="true" />
              {quest.business_name}
            </p>
          )}
          {quest.location_name && (
            <p className="flex items-center gap-1.5 truncate text-body-sm text-on-surface-variant">
              <MapPin size={13} className="shrink-0" aria-hidden="true" />
              {quest.location_name}
            </p>
          )}
        </div>
      </Link>
      <div className="mx-3 mb-3 mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-surface-container-high px-2.5 py-1.5 sm:mx-4 sm:mb-4 sm:px-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          {hasReward && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-coin-ink">
              <Trophy size={14} aria-hidden="true" />
              Reward
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-on-surface-variant">
            <Users size={13} aria-hidden="true" />
            {quest.participant_count} joined
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ShareButton
            kind="quest"
            id={quest.id}
            title={quest.title}
            label="Share"
            className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-secondary ${FOCUS_RING}`}
          />
          <Link
            href={`/quests/${quest.id}`}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-streak px-3 text-xs font-bold text-on-streak transition-opacity hover:opacity-90 ${FOCUS_RING}`}
            aria-label={`View quest: ${quest.title}`}
          >
            View quest <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ── FeaturedCard ────────────────────────────────────────────────────────── */
function FeaturedCard({ challenge }: { challenge: FeaturedChallenge }) {
  return (
    <Link href={`/challenges/${challenge.id}`} className={`block h-full rounded-xl ${FOCUS_RING}`}>
      <Card padding="none" bordered elevation={2} interactive className="h-full overflow-hidden">
        <div className="relative aspect-video w-full bg-surface-variant">
          <Image
            src={challenge.coverImageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="280px"
          />
          <div className="absolute left-2 top-2">
            <Badge variant="secondary" className="elev-1">Featured</Badge>
          </div>
          {challenge.verified && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest/85 px-2 py-0.5 backdrop-blur-sm">
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

  // Not `interactive`: the row holds its own Join button, so the card is not a
  // single link target and must not behave like one.
  return (
    <Card bordered padding="sm" className="flex items-center gap-2.5 sm:gap-3">
      <Link
        href={`/challenges/${challenge.id}`}
        className="shrink-0 rounded-lg"
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-surface-variant sm:h-14 sm:w-14">
          <Image src={challenge.thumbnailUrl} alt="" fill className="object-cover" sizes="56px" />
        </div>
      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="line-clamp-1 text-body-md font-semibold leading-tight text-on-surface">
          <Link href={`/challenges/${challenge.id}`} className={`rounded ${FOCUS_RING}`}>
            {challenge.title}
          </Link>
        </h3>
        <p className="truncate text-body-sm text-on-surface-variant">{challenge.creatorName}</p>
        <div className="flex items-center gap-3 text-body-sm text-on-surface-variant">
          <span className="flex items-center gap-0.5">
            <Flame size={11} className="text-streak-ink" aria-hidden="true" />
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
            className="h-full rounded-full bg-streak motion-safe:transition-all motion-safe:duration-500"
            style={{ width: `${challenge.progressPercent}%` }}
          />
        </div>
      </div>
      {/* Action column: the primary button, with Share directly beneath it.
          Stacked rather than placed in the row because the row is already
          full at 56px of art plus the title block, and a third item there
          pushes the progress bar into the title on a narrow phone. */}
      <div className="flex shrink-0 flex-col items-stretch gap-1">
        {challenge.isParticipant ? (
          <Link
            href={`/challenges/${challenge.id}`}
            className={[
              "inline-flex h-11 items-center rounded-xl px-4",
              "bg-secondary-fixed text-body-sm font-semibold text-on-secondary-fixed-variant",
              "pressable transition-colors hover:bg-secondary-fixed-dim",
              FOCUS_RING,
            ].join(" ")}
          >
            View
          </Link>
        ) : joinState === "joined" ? (
          <div className="flex h-11 items-center gap-1 px-2 text-body-sm font-semibold text-on-tertiary-fixed-variant">
            <CheckCircle2 size={14} aria-hidden="true" />
            Joined
          </div>
        ) : (
          <Button
            id={`join-${challenge.id}`}
            variant={isPublic ? "secondary" : "outline"}
            size="md"
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
        <ShareButton
          kind="challenge"
          id={challenge.id}
          title={challenge.title}
          isPrivate={!isPublic}
          label="Share"
          className="flex h-8 items-center justify-center gap-1 rounded-lg text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-secondary"
        />
      </div>
    </Card>
  );
}

/* ── ExploreClient ───────────────────────────────────────────────────────── */
export interface ExploreClientProps {
  featured: FeaturedChallenge[];
  trending: TrendingChallenge[];
  quests?: FeaturedQuest[];
  /** The viewer's own challenges, for the My Challenges tab. */
  mine?: TrendingChallenge[];
  /** The Challenges route always opens on its challenge list. */
  initialView?: View;
}

export function ExploreClient({
  featured,
  trending,
  quests = [],
  mine = [],
  initialView = "discover",
}: ExploreClientProps) {
  const [view, setView] = useState<View>(initialView);
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

  /* Search filters whichever list is on screen. It deliberately does not hit
     the network: both lists are server-rendered up front, so a substring match
     is instant and complete for what is visible. A page of rows each, so there
     is nothing to memoise. */
  const q = query.trim().toLowerCase();
  const matches = (...fields: (string | null | undefined)[]) =>
    !q || fields.some((f) => f?.toLowerCase().includes(q));

  const shownQuests = quests.filter((p) =>
    matches(p.title, p.business_name, p.category, p.location_name)
  );
  const shownFeatured = featured.filter((c) => matches(c.title, c.creatorName));
  const shownTrending = trending.filter((c) => matches(c.title, c.creatorName));

  const shownMine = mine.filter((c) => matches(c.title, c.creatorName));
  const categories = Array.from(new Set(
    quests.map((quest) => quest.category).filter((category): category is string => Boolean(category?.trim()))
  ));

  const isExplore = initialView === "discover";
  const onDiscover = view === "discover";
  const onQuests = view === "quests";
  const onMine = view === "mine";
  const emptyChallenges = shownFeatured.length === 0 && shownTrending.length === 0;
  const showChallenges = !onQuests && !onMine && (!onDiscover || !emptyChallenges);
  const showQuests = onQuests || (onDiscover && shownQuests.length > 0);
  const spotlight = onDiscover && !q;
  const searchLabel = onDiscover
    ? "Search challenges, local quests, and places"
    : onQuests
      ? "Search quests or businesses"
      : "Search challenges or creators";
  const tabs: { value: View; label: string; count?: number }[] = [];
  if (isExplore) tabs.push({ value: "discover", label: "All" });
  if (isExplore || initialView === "quests") tabs.push({ value: "quests", label: "Local Quests" });
  tabs.push(
    { value: "challenges", label: "Challenges", count: shownFeatured.length + shownTrending.length },
    { value: "mine", label: "My Challenges", count: shownMine.length }
  );

  const renderTab = ({ value, label, count }: (typeof tabs)[number], index: number) => {
    const active = view === value;
    return (
      <button
        key={value}
        type="button"
        role="tab"
        aria-selected={active}
        aria-controls="explore-panel"
        id={`${value}-tab`}
        tabIndex={active ? 0 : -1}
        onClick={() => setView(value)}
        onKeyDown={(event) => {
          const length = tabs.length;
          const next = event.key === "Home" ? 0
            : event.key === "End" ? length - 1
            : event.key === "ArrowLeft" ? (index + length - 1) % length
            : event.key === "ArrowRight" ? (index + 1) % length
            : null;
          if (next === null) return;
          event.preventDefault();
          setView(tabs[next].value);
          document.getElementById(`${tabs[next].value}-tab`)?.focus();
        }}
        className={[
          "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 sm:px-4",
          "whitespace-nowrap border text-xs font-bold transition-colors",
          FOCUS_RING,
          active
            ? "border-streak bg-streak text-on-streak"
            : "border-outline-variant bg-surface-container-high text-on-surface-variant hover:text-on-surface",
        ].join(" ")}
      >
        {label}
        {!isExplore && count !== undefined && (
          <span
            className={[
              "rounded-full px-1.5 py-0.5 text-label-sm font-bold tabular-nums",
              active ? "bg-black/10 text-on-streak" : "bg-surface-container-highest text-on-surface-variant",
            ].join(" ")}
          >
            {count}
          </span>
        )}
      </button>
    );
  };

  const featuredRail = shownFeatured.length > 0 && (
    <div key="featured">
      <h2 className="mb-3 text-lg font-bold text-on-surface">Featured Premium Challenges</h2>
      <ul className="-mx-gutter flex list-none gap-3 overflow-x-auto px-gutter pb-3 no-scrollbar lg:-mx-gutter-md lg:px-gutter-md">
        {shownFeatured.map((challenge) => (
          <li key={challenge.id} className="w-[min(78vw,280px)] shrink-0">
            <FeaturedCard challenge={challenge} />
          </li>
        ))}
      </ul>
    </div>
  );

  const trendingList = shownTrending.length > 0 && (
    <div key="trending">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-on-surface">
        <Flame size={18} className="text-streak-ink" aria-hidden="true" />
        Trending Challenges
      </h2>
      <ul className="grid list-none grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        {shownTrending.map((challenge) => (
          <li key={challenge.id}>
            <TrendingRow challenge={challenge} onPrivateClick={showPrivateToast} />
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface/95 pt-safe backdrop-blur-sm">
        <div className="mx-auto measure-page px-gutter lg:px-gutter-md">
          <div className="flex h-14 items-center justify-between">
            <div className="flex min-w-0 items-center gap-1">
              <MobileMenu />
              <h1 className="truncate text-lg font-extrabold tracking-tight text-on-surface">
                {isExplore ? "Explore" : "Challenges"}
              </h1>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href="/alerts"
                aria-label="Alerts"
                className={`flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition-colors duration-150 hover:bg-surface-variant ${FOCUS_RING}`}
              >
                <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
              </Link>
              <Link
                href="/profile"
                aria-label="Your profile"
                className={`flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition-colors duration-150 hover:bg-surface-variant ${FOCUS_RING}`}
              >
                <User size={20} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto measure-page space-y-6 px-gutter py-5 lg:px-gutter-md">
        {/* ── Private challenge toast ─────────────────────────────────── */}
        {privateToast && (
          <div
            role="status"
            aria-live="polite"
            className={[
              "fixed left-1/2 top-24 z-50 -translate-x-1/2",
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

        {/* ── Search ────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="relative flex items-center">
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-4 text-on-surface-variant" />
            <input
              id="explore-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={onDiscover ? "Search challenges & quests" : `${searchLabel}…`}
              className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-lowest pl-11 pr-4 text-base text-on-surface transition-colors placeholder:text-on-surface-variant focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30"
              aria-label={searchLabel}
            />
          </div>
          <div
            role="tablist"
            aria-label={isExplore ? "Explore filters" : "All challenges or your own"}
            className="-mx-1 flex items-center gap-2 overflow-x-auto p-1 no-scrollbar"
          >
            {tabs.map(renderTab)}
          </div>
        </div>

        <div
          id="explore-panel"
          role="tabpanel"
          aria-labelledby={`${view}-tab`}
          tabIndex={-1}
          className="space-y-7"
        >
          {/* ── My Challenges ─────────────────────────────────────────────
              Everything the viewer joined or created. Unlike the discovery
              lists above this one is uncapped: a complete list of someone's own
              work is the whole point, and a limit would silently hide it. */}
          {onMine && (
            <section aria-label="My challenges">
              {shownMine.length > 0 ? (
                <div className="space-y-3">
                  {shownMine.map((c) => (
                    <TrendingRow key={c.id} challenge={c} onPrivateClick={showPrivateToast} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-outline bg-surface-container-lowest p-6 text-center text-body-sm text-on-surface-variant">
                  {q
                    ? "No challenges of yours match that search."
                    : "You have not joined or created a challenge yet."}
                </p>
              )}
            </section>
          )}

          {/* ── Quests ────────────────────────────────────────────────────── */}
          {showQuests && (
            <section aria-labelledby="explore-quests-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="explore-quests-heading" className="flex items-center gap-2 text-lg font-bold text-on-surface">
                  <MapPin size={18} className="text-streak-ink" aria-hidden="true" />
                  {spotlight ? "Local Quest Spotlight" : "Local Quests"}
                </h2>
                <Link href="/quests" className={`inline-flex min-h-11 items-center gap-1 rounded-lg text-xs font-bold text-secondary ${FOCUS_RING}`}>
                  Browse Quests <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
              {shownQuests.length > 0 ? (
                spotlight ? (
                  <QuestCard quest={shownQuests[0]} spotlight />
                ) : (
                  <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2">
                    {shownQuests.map((quest) => (
                      <li key={quest.id}>
                        <QuestCard quest={quest} />
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <EmptyState
                  icon={<Target size={36} aria-hidden="true" />}
                  title={q ? `No quests match “${query.trim()}”` : "No quests running right now"}
                  body={
                    q
                      ? "Try a business name, a place, or clear the search."
                      : "Local businesses post quests you can complete for rewards. Check back soon."
                  }
                />
              )}
            </section>
          )}

          {/* ── Challenges ────────────────────────────────────────────────── */}
          {showChallenges && (
            <section aria-label="Discover challenges" className="flex flex-col gap-7">
              {emptyChallenges ? (
                <EmptyState
                  icon={<Flame size={36} aria-hidden="true" />}
                  title={q ? `No challenges match “${query.trim()}”` : "No challenges yet"}
                  body={
                    q
                      ? "Try a creator's name, or clear the search."
                      : "Be the first to create one and invite your community."
                  }
                />
              ) : onDiscover ? [trendingList, featuredRail] : [featuredRail, trendingList]}
            </section>
          )}

          {onDiscover && !showQuests && !showChallenges && (
            <EmptyState
              icon={<Compass size={36} aria-hidden="true" />}
              title={q ? `No results for “${query.trim()}”` : "Nothing to explore yet"}
              body={q ? "Try a different name or place." : "Check back for new quests and challenges."}
            />
          )}

          {spotlight && categories.length > 0 && (
            <section aria-labelledby="explore-categories-heading">
              <h2 id="explore-categories-heading" className="mb-3 text-lg font-bold text-on-surface">Browse by Category</h2>
              <ul className="grid list-none grid-cols-2 gap-2.5 sm:grid-cols-4">
                {categories.map((category) => {
                  const quest = quests.find((item) => item.category === category && (item.cover_url || item.thumbnail_url));
                  const art = quest?.cover_url ?? quest?.thumbnail_url;
                  return (
                    <li key={category}>
                      <button
                        type="button"
                        onClick={() => {
                          setQuery(category);
                          setView("quests");
                          document.getElementById("quests-tab")?.focus();
                        }}
                        className={`relative isolate flex min-h-24 w-full items-end overflow-hidden rounded-xl border border-outline-variant bg-surface-container-high p-3 text-left text-sm font-bold text-on-surface ${FOCUS_RING}`}
                      >
                        {art && (
                          <>
                            <Image src={art} alt="" fill sizes="(min-width: 640px) 240px, 50vw" className="-z-20 object-cover" />
                            <span aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0B1220] to-[#0B1220]/20" />
                          </>
                        )}
                        <span className={`break-words ${art ? "text-white" : ""}`}>{category}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-gutter py-16 text-center">
      <span className="text-on-surface-variant opacity-40">{icon}</span>
      <p className="text-headline-sm text-on-surface">{title}</p>
      <p className="max-w-xs text-body-md text-on-surface-variant">{body}</p>
    </div>
  );
}
