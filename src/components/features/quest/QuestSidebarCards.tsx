"use client";
/**
 * Right-rail cards for the business Quest detail page.
 *
 * Every value here is passed in from the Quest / business / participation
 * records — nothing is hardcoded, and anything the business has not filled in
 * is omitted rather than faked.
 */

import Link from "next/link";
import {
  Globe, MapPin, Navigation, Phone, ShieldCheck, Star, Trophy, Users,
} from "lucide-react";
import type { BusinessQuestContact } from "@/lib/data/quests";
import type { LeaderboardRow } from "@/lib/data/questOrderVerification";

/* ── Quest progress ────────────────────────────────────────────────────── */

export function QuestProgressCard({
  completed, total, joined,
}: {
  completed: number;
  total: number;
  joined: boolean;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <section
      aria-labelledby="quest-progress-heading"
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5"
    >
      <h3
        id="quest-progress-heading"
        className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant"
      >
        Quest Progress
      </h3>

      <div className="flex justify-center my-4">
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r={R} fill="none" stroke="#EEF2F7" strokeWidth="10" />
            <circle
              cx="60" cy="60" r={R} fill="none"
              stroke="#2166F3" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C - (pct / 100) * C}
              className="transition-[stroke-dashoffset] duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[26px] leading-none font-bold text-on-surface">
              {completed}/{total}
            </p>
            <p className="text-[11px] text-on-surface-variant mt-1">Tasks Completed</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-on-surface-variant leading-relaxed text-center">
        {joined
          ? "Complete verified tasks to build your progress."
          : "Join the Quest and complete verified tasks to build your progress."}
      </p>
    </section>
  );
}

/* ── Reward ────────────────────────────────────────────────────────────── */

export interface RewardSummary {
  headline: string;
  subline: string | null;
  winners: number | null;
  perWinner: string | null;
  totalPool: string | null;
}

export function RewardCard({
  reward, joined, onJoin, joining, ended,
}: {
  reward: RewardSummary | null;
  joined: boolean;
  onJoin: () => void;
  joining: boolean;
  ended: boolean;
}) {
  if (!reward) return null;

  const stats = [
    reward.winners != null ? { k: `${reward.winners}`, v: "Winners" } : null,
    reward.perWinner ? { k: reward.perWinner, v: "Each" } : null,
    reward.totalPool ? { k: reward.totalPool, v: "Total Pool" } : null,
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <section
      aria-labelledby="quest-reward-heading"
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden"
    >
      <div className="px-5 pt-5 pb-4">
        <h3 id="quest-reward-heading" className="sr-only">Reward</h3>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning-container border border-warning-outline flex items-center justify-center shrink-0">
            <Trophy size={19} className="text-warning" />
          </div>
          <div className="min-w-0">
            <p className="text-[19px] font-bold text-on-surface leading-tight">
              {reward.headline}
            </p>
            {reward.subline && (
              <p className="text-sm text-on-surface-variant mt-0.5">{reward.subline}</p>
            )}
          </div>
        </div>

        {stats.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            {stats.map((s) => (
              <div
                key={s.v}
                className="rounded-xl bg-surface-container-low border border-outline-variant px-2 py-2.5 text-center"
              >
                <p className="text-[15px] font-bold text-on-surface leading-tight truncate">{s.k}</p>
                <p className="text-[10px] text-on-surface-variant mt-0.5">{s.v}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-5">
        {ended ? (
          <button
            disabled
            className="w-full h-11 rounded-xl bg-surface-container text-on-surface-variant font-bold text-sm cursor-not-allowed"
          >
            Quest Ended
          </button>
        ) : joined ? (
          <div className="w-full h-11 rounded-xl bg-success-container border border-success-outline text-on-success-container font-bold text-sm flex items-center justify-center gap-2">
            <ShieldCheck size={16} /> You&apos;ve Joined
          </div>
        ) : (
          <button
            onClick={onJoin}
            disabled={joining}
            className="w-full h-11 rounded-xl bg-secondary hover:opacity-90 disabled:opacity-50 text-white font-bold text-sm transition-colors"
          >
            {joining ? "Joining…" : "Join Quest"}
          </button>
        )}
      </div>
    </section>
  );
}

/* ── Leaderboard ───────────────────────────────────────────────────────── */

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * Placeholder rows shown only while no participant has verified activity yet.
 * They are labelled as sample UI data in the card itself — they are not real
 * people and must never read as though they were.
 */
const PLACEHOLDER: { label: string; tasks: string; points: number }[] = [
  { label: "User 1", tasks: "3/3", points: 320 },
  { label: "User 2", tasks: "3/3", points: 310 },
  { label: "User 3", tasks: "3/3", points: 300 },
];

export function LeaderboardPreviewCard({
  rows, totalTasks, questId, enabled,
}: {
  rows: LeaderboardRow[];
  totalTasks: number;
  questId: string;
  enabled: boolean;
}) {
  if (!enabled) return null;
  const isPlaceholder = rows.length === 0;

  return (
    <section
      aria-labelledby="quest-leaderboard-heading"
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id="quest-leaderboard-heading"
          className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant"
        >
          Leaderboard Preview
        </h3>
        {isPlaceholder && (
          <span className="text-[10px] font-semibold text-on-surface-variant bg-surface-container-low border border-outline-variant px-2 py-0.5 rounded-full shrink-0">
            Sample
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-1 mt-3">
        {isPlaceholder
          ? PLACEHOLDER.map((p, i) => (
              <li key={p.label} className="flex items-center gap-3 py-2">
                <span className="text-base w-6 text-center shrink-0" aria-hidden="true">
                  {MEDALS[i]}
                </span>
                <div className="w-8 h-8 rounded-full bg-surface-container shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface-variant truncate">{p.label}</p>
                  <p className="text-[11px] text-on-surface-variant">{p.tasks}</p>
                </div>
                <span className="text-sm font-bold text-on-surface-variant shrink-0">{p.points} pts</span>
              </li>
            ))
          : rows.slice(0, 3).map((r, i) => {
              const name = r.full_name ?? r.username ?? "Participant";
              return (
                <li key={r.user_id} className="flex items-center gap-3 py-2">
                  <span className="text-base w-6 text-center shrink-0" aria-hidden="true">
                    {MEDALS[i] ?? r.rank}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-secondary-fixed overflow-hidden shrink-0 flex items-center justify-center">
                    {r.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-secondary">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{name}</p>
                    <p className="text-[11px] text-on-surface-variant">
                      {r.tasks_completed}/{totalTasks}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-on-surface shrink-0">
                    {r.points} pts
                  </span>
                </li>
              );
            })}
      </ul>

      {isPlaceholder && (
        <p className="text-[11px] text-on-surface-variant leading-relaxed mt-2">
          Sample rows — the leaderboard fills in from verified Quest activity.
        </p>
      )}

      <Link
        href={`/quests/${questId}/leaderboard`}
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-secondary hover:text-secondary"
      >
        View Full Leaderboard →
      </Link>
    </section>
  );
}

/* ── Business profile ──────────────────────────────────────────────────── */

export function formatAddress(b: BusinessQuestContact | null): string[] {
  if (!b) return [];
  const tail = [b.city, b.state].filter(Boolean).join(", ");
  const withPin = [tail, b.pincode].filter(Boolean).join(" – ");
  return [b.address, withPin].filter((l): l is string => !!l && l.trim().length > 0);
}

export function BusinessProfileCard({
  business, fallbackName, verified, questId,
}: {
  business: BusinessQuestContact | null;
  fallbackName: string;
  verified: boolean;
  questId: string;
}) {
  const name = business?.business_name ?? fallbackName;
  const address = formatAddress(business);
  const phones = [business?.business_phone, business?.business_phone_alt]
    .filter((p): p is string => !!p && p.trim().length > 0);
  const website = business?.website ?? null;

  const mapsQuery = encodeURIComponent([name, ...address].join(", "));
  const directionsUrl =
    business?.google_maps_url ??
    `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <section
      aria-labelledby="business-profile-heading"
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5"
    >
      <h3
        id="business-profile-heading"
        className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant"
      >
        Business Profile
      </h3>

      <div className="flex items-start gap-3 mt-3">
        <div className="w-12 h-12 rounded-xl bg-surface-container-low border border-outline-variant overflow-hidden shrink-0 flex items-center justify-center">
          {business?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-on-surface-variant">{name.charAt(0)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[15px] font-bold text-on-surface truncate">{name}</p>
            {/* Blue tick only when STRIVUP has actually verified the business. */}
            {verified && (
              <ShieldCheck
                size={15}
                className="text-secondary shrink-0"
                aria-label="Verified by STRIVUP"
              />
            )}
          </div>
          {business?.category && (
            <p className="text-xs text-on-surface-variant mt-0.5">{business.category}</p>
          )}
        </div>
      </div>

      <dl className="flex flex-col gap-2.5 mt-4">
        {address.length > 0 && (
          <div className="flex items-start gap-2.5">
            <dt className="shrink-0 mt-0.5"><MapPin size={15} className="text-on-surface-variant" /></dt>
            <dd className="text-sm text-on-surface-variant leading-relaxed">
              {address.map((line) => <span key={line} className="block">{line}</span>)}
            </dd>
          </div>
        )}
        {phones.length > 0 && (
          <div className="flex items-start gap-2.5">
            <dt className="shrink-0 mt-0.5"><Phone size={15} className="text-on-surface-variant" /></dt>
            <dd className="text-sm text-on-surface-variant">{phones.join(" / ")}</dd>
          </div>
        )}
        {website && (
          <div className="flex items-start gap-2.5">
            <dt className="shrink-0 mt-0.5"><Globe size={15} className="text-on-surface-variant" /></dt>
            <dd className="text-sm min-w-0">
              <a
                href={website.startsWith("http") ? website : `https://${website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-secondary hover:underline break-all"
              >
                {website.replace(/^https?:\/\//, "")}
              </a>
            </dd>
          </div>
        )}
      </dl>

      <div className="grid grid-cols-2 gap-2 mt-4">
        {business?.id && (
          <Link
            href={`/business/${business.id}`}
            className="h-9 rounded-xl border border-outline-variant hover:bg-surface-container-low text-xs font-semibold text-on-surface-variant flex items-center justify-center gap-1.5 transition-colors"
          >
            <Users size={13} /> Profile
          </Link>
        )}
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="h-9 rounded-xl border border-outline-variant hover:bg-surface-container-low text-xs font-semibold text-on-surface-variant flex items-center justify-center gap-1.5 transition-colors"
        >
          <Navigation size={13} /> Directions
        </a>
        {phones[0] && (
          <a
            href={`tel:${phones[0].replace(/\s/g, "")}`}
            className="h-9 rounded-xl border border-outline-variant hover:bg-surface-container-low text-xs font-semibold text-on-surface-variant flex items-center justify-center gap-1.5 transition-colors"
          >
            <Phone size={13} /> Call
          </a>
        )}
        {website && (
          <a
            href={website.startsWith("http") ? website : `https://${website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 rounded-xl border border-outline-variant hover:bg-surface-container-low text-xs font-semibold text-on-surface-variant flex items-center justify-center gap-1.5 transition-colors"
          >
            <Globe size={13} /> Website
          </a>
        )}
      </div>

      <Link
        href={`/quests/${questId}/tasks`}
        className="sr-only"
      >
        My task progress
      </Link>
    </section>
  );
}

/* ── Google / local business card ──────────────────────────────────────── */

/**
 * Google-style local card. The rating block renders ONLY when this exact
 * outlet's Google data has been verified and stored (google_rating +
 * google_verified_at). Otherwise it says the rating is unavailable — a chain's
 * other outlets are not this outlet, and borrowing their numbers would be a
 * fabrication.
 */
export function GoogleBusinessCard({
  business, fallbackName,
}: {
  business: BusinessQuestContact | null;
  fallbackName: string;
}) {
  const name = business?.business_name ?? fallbackName;
  const address = formatAddress(business);
  const hasVerifiedGoogle =
    business?.google_rating != null && business?.google_verified_at != null;

  const mapsQuery = encodeURIComponent([name, ...address].join(", "));
  const mapsUrl =
    business?.google_maps_url ??
    `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <section
      aria-labelledby="google-card-heading"
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden"
    >
      {/* Static map placeholder — no third-party tiles are loaded, so no key
          is needed and nothing about the viewer leaks to a maps provider. */}
      <div className="relative h-28 bg-[#E8EDF3] border-b border-outline-variant">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "linear-gradient(90deg, #dfe6ee 1px, transparent 1px), linear-gradient(#dfe6ee 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute left-[18%] top-0 bottom-0 w-6 bg-[#f2f5f9] -rotate-12"
        />
        <div
          aria-hidden="true"
          className="absolute right-[24%] top-0 bottom-0 w-4 bg-[#f2f5f9] rotate-6"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-1.5 bg-surface-container-lowest rounded-full pl-1.5 pr-3 py-1.5 border border-outline-variant shadow-sm max-w-[85%]">
            <span className="w-5 h-5 rounded-full bg-error flex items-center justify-center shrink-0">
              <MapPin size={11} className="text-white" />
            </span>
            <span className="text-[11px] font-semibold text-on-surface-variant truncate">{name}</span>
          </div>
        </div>
      </div>

      <div className="p-5">
        <p className="text-[15px] font-bold text-on-surface">{name}</p>
        {business?.category && (
          <p className="text-xs text-on-surface-variant mt-0.5">{business.category}</p>
        )}

        <div className="mt-2.5">
          {hasVerifiedGoogle ? (
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-on-surface">
                {business!.google_rating!.toFixed(1)}
              </span>
              <Star size={13} className="text-amber-400 fill-amber-400" aria-hidden="true" />
              {business!.google_review_count != null && (
                <span className="text-xs text-on-surface-variant">
                  ({business!.google_review_count.toLocaleString("en-IN")} reviews)
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant">Google rating unavailable</p>
          )}
        </div>

        {address.length > 0 && (
          <p className="text-sm text-on-surface-variant leading-relaxed mt-3">
            {address.map((line) => <span key={line} className="block">{line}</span>)}
          </p>
        )}

        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-secondary"
        >
          <Navigation size={14} /> Open in Maps
        </a>
      </div>
    </section>
  );
}
