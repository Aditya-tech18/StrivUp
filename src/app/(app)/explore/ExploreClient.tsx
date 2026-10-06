"use client";

/**
 * ExploreClient — the Explore screen: header, Quests/Challenges toggle, search
 * and both lists.
 *
 * Quests is the default view. It is the half of the product a new user is most
 * likely to act on (a local business offering something today), and it is what
 * the brief asks to land on.
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
import { Badge, Button, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { FeaturedChallenge, FeaturedQuest, TrendingChallenge } from "./page";

type View = "quests" | "challenges";

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
function QuestCard({ quest }: { quest: FeaturedQuest }) {
  const art = quest.cover_url ?? quest.thumbnail_url ?? null;
  return (
    <Link href={`/quests/${quest.id}`} className={`block h-full rounded-xl ${FOCUS_RING}`}>
      <Card bordered padding="none" elevation={2} interactive className="h-full overflow-hidden">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-variant">
          {art ? (
            <Image src={art} alt="" fill sizes="(min-width: 1024px) 480px, 100vw" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface-container-high">
              <Target size={28} className="text-on-surface-variant opacity-50" aria-hidden="true" />
            </div>
          )}
          {quest.rewards && quest.rewards.length > 0 && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-body-sm font-bold text-on-surface elev-1">
              <Trophy size={11} aria-hidden="true" />
              Reward
            </span>
          )}
        </div>
        <div className="space-y-1.5 p-4">
          <h3 className="line-clamp-2 text-headline-sm leading-snug text-on-surface">
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
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {quest.category && <Badge variant="secondary">{quest.category}</Badge>}
            <span className="flex items-center gap-1 text-body-sm text-on-surface-variant">
              <Users size={13} aria-hidden="true" />
              {quest.participant_count} joined
            </span>
          </div>
        </div>
      </Card>
    </Link>
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
    <Card bordered padding="sm" className="flex items-center gap-3">
      <Link
        href={`/challenges/${challenge.id}`}
        className="shrink-0 rounded-lg"
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className="relative h-14 w-14 overflow-hidden rounded-lg bg-surface-variant">
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
            variant={isPublic ? "primary" : "outline"}
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
      </div>
    </Card>
  );
}

/* ── ExploreClient ───────────────────────────────────────────────────────── */
export interface ExploreClientProps {
  featured: FeaturedChallenge[];
  trending: TrendingChallenge[];
  quests?: FeaturedQuest[];
}

export function ExploreClient({ featured, trending, quests = [] }: ExploreClientProps) {
  const [view, setView] = useState<View>("quests");
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

  const onQuests = view === "quests";
  const empty = onQuests
    ? shownQuests.length === 0
    : shownFeatured.length === 0 && shownTrending.length === 0;

  const tab = (value: View, label: string, count: number) => {
    const active = view === value;
    return (
      <button
        key={value}
        type="button"
        role="tab"
        aria-selected={active}
        aria-controls={`${value}-panel`}
        id={`${value}-tab`}
        onClick={() => setView(value)}
        className={[
          // h-10 inside an h-12 track: the whole track is a 48px touch target
          // even though the active pill is visually smaller.
          "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3",
          "text-body-md font-semibold transition-colors duration-150",
          FOCUS_RING,
          active
            ? "bg-surface-container-lowest text-on-surface elev-1"
            : "text-on-surface-variant hover:text-on-surface",
        ].join(" ")}
      >
        {label}
        <span
          className={[
            "rounded-full px-1.5 py-0.5 text-label-sm font-bold tabular-nums",
            active ? "bg-secondary text-on-secondary" : "bg-surface-container-highest text-on-surface-variant",
          ].join(" ")}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* ── Sticky header: brand, actions, then the toggle ─────────────── */}
      <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface/95 pt-safe backdrop-blur-sm">
        <div className="mx-auto measure-page px-gutter lg:px-gutter-md">
          <div className="flex h-14 items-center justify-between">
            <Link href="/explore" className={`flex items-center rounded-lg ${FOCUS_RING}`}>
              <Image
                src="/brand/wordmark.png"
                alt="StrivUp"
                width={104}
                height={29}
                priority
                className="h-[22px] w-auto"
              />
            </Link>
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

          {/* Segmented toggle. Quests first and selected by default. */}
          <div
            role="tablist"
            aria-label="Explore quests or challenges"
            className="mb-3 flex h-12 items-center gap-1 rounded-xl bg-surface-container p-1"
          >
            {tab("quests", "Quests", shownQuests.length)}
            {tab("challenges", "Challenges", shownFeatured.length + shownTrending.length)}
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
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-4 z-10 flex items-center text-on-surface-variant">
            <Search size={17} aria-hidden="true" />
          </span>
          <input
            id="explore-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={onQuests ? "Search quests or businesses…" : "Search challenges or creators…"}
            className={[
              "h-12 w-full rounded-xl border border-outline-variant pl-10 pr-4",
              "bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant",
              "text-[length:var(--text-body-lg)] transition-colors duration-150",
              "focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30",
            ].join(" ")}
            aria-label={onQuests ? "Search quests or businesses" : "Search challenges or creators"}
          />
        </div>

        {/* ── Quests ────────────────────────────────────────────────────── */}
        {onQuests && (
          <section id="quests-panel" role="tabpanel" aria-labelledby="quests-tab" tabIndex={-1}>
            {shownQuests.length > 0 ? (
              <ul className="grid list-none grid-cols-1 gap-4 lg:grid-cols-2">
                {shownQuests.map((p) => (
                  <li key={p.id}>
                    <QuestCard quest={p} />
                  </li>
                ))}
              </ul>
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
        {!onQuests && (
          <section
            id="challenges-panel"
            role="tabpanel"
            aria-labelledby="challenges-tab"
            tabIndex={-1}
            className="space-y-8"
          >
            {empty ? (
              <EmptyState
                icon={<Flame size={36} aria-hidden="true" />}
                title={q ? `No challenges match “${query.trim()}”` : "No challenges yet"}
                body={
                  q
                    ? "Try a creator's name, or clear the search."
                    : "Be the first to create one and invite your community."
                }
              />
            ) : (
              <>
                {shownFeatured.length > 0 && (
                  <div>
                    <h2 className="mb-3 text-headline-md text-on-surface">
                      Featured Premium Challenges
                    </h2>
                    <ul className="-mx-gutter flex list-none gap-3 overflow-x-auto px-gutter pb-3 no-scrollbar lg:-mx-gutter-md lg:px-gutter-md">
                      {shownFeatured.map((c) => (
                        <li key={c.id} className="w-[min(78vw,280px)] shrink-0">
                          <FeaturedCard challenge={c} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {shownTrending.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-headline-md text-on-surface">Trending Challenges</h2>
                      <p className="text-overline text-on-surface-variant">Active now</p>
                    </div>
                    <ul className="grid list-none grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
                      {shownTrending.map((c) => (
                        <li key={c.id}>
                          <TrendingRow challenge={c} onPrivateClick={showPrivateToast} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        )}
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
