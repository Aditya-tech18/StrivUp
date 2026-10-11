/**
 * app/(app)/u/[handle]/page.tsx — public profile.
 *
 * Server component. `handle` accepts either a username or a UUID, because
 * `profiles.username` is nullable (most live accounts have none) and /alerts
 * links to people by UUID.
 *
 * Visibility rules, in order:
 *   1. Not found                  → notFound()
 *   2. Deactivated                → notFound(), never a "this account is
 *                                   deactivated" page, which would leak that it
 *                                   exists. Same posture as src/proxy.ts.
 *   3. Viewing yourself           → redirect to /profile (the owner view)
 *   4. UUID handle + has username → redirect to the username form, so each
 *                                   profile has one canonical URL
 *   5. Private + not following    → locked view: avatar, name, counts, Follow.
 *                                   The stats fetch is SKIPPED on the server, so
 *                                   private data never reaches the client bundle.
 *
 * Note profile_challenge_stats now runs with security_invoker=on, so RLS already
 * restricts stats to challenges the viewer may see. The is_private gate below is
 * a second, coarser layer — defence in depth, not the only defence.
 */

import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Flame, Lock, ShieldCheck, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getProfileByHandle,
  getFollowState,
  getFollowCounts,
  getProfileChallengeStats,
  isUuidHandle,
  type ProfileChallengeStat,
} from "@/lib/data/profiles";
import { FollowButton } from "@/components/features/profile/FollowButton";
import { ActivityHeatmap } from "@/components/ui/ActivityHeatmap";

interface PageProps {
  // Next 16: params is a Promise and must be awaited.
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const supabase = await createClient();
  const profile = await getProfileByHandle(supabase, handle);

  // Deactivated and missing profiles share one title so the metadata does not
  // reveal which is which.
  if (!profile || profile.is_deactivated) {
    return { title: "Profile not found" };
  }

  const name = profile.full_name ?? (profile.username ? `@${profile.username}` : "Profile");
  return {
    title: name,
    description: profile.is_private
      ? `${name} is on StrivUp.`
      : (profile.bio ?? `${name} is building better every day on StrivUp.`),
  };
}

function displayName(fullName: string | null, username: string | null): string {
  return fullName ?? (username ? `@${username}` : "StrivUp member");
}

/* ── Stat tile ───────────────────────────────────────────────────────────── */
function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-body-lg font-bold text-on-surface">{value}</p>
      <p className="text-body-sm text-on-surface-variant">{label}</p>
    </div>
  );
}

/* ── Challenge row ───────────────────────────────────────────────────────── */
function ChallengeRow({ stat }: { stat: ProfileChallengeStat }) {
  return (
    <Link
      href={`/challenges/${stat.challenge_id}`}
      className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 transition-colors hover:bg-surface-container-low elev-1 surface-raised"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/8">
        <Flame size={18} className="text-secondary" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-md font-semibold text-on-surface">
          {stat.title ?? "Untitled challenge"}
        </p>
        <p className="text-body-sm text-on-surface-variant">
          Day {stat.current_day}
          {stat.duration_days ? ` of ${stat.duration_days}` : ""} ·{" "}
          {Math.round(Number(stat.consistency_pct))}% consistent
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-body-md font-bold text-on-surface">{stat.current_streak}</p>
        <p className="text-label-sm text-on-surface-variant">streak</p>
      </div>
    </Link>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default async function PublicProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const supabase = await createClient();

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  const profile = await getProfileByHandle(supabase, handle);

  // 1 + 2. Missing or deactivated are indistinguishable from outside.
  if (!profile || profile.is_deactivated) notFound();

  // 3. Your own profile has a richer owner view.
  if (viewer && viewer.id === profile.id) redirect("/profile");

  // 4. One canonical URL per profile.
  if (isUuidHandle(handle) && profile.username) {
    redirect(`/u/${profile.username}`);
  }

  const followState = await getFollowState(supabase, viewer?.id ?? null, profile.id);
  const counts = await getFollowCounts(supabase, profile.id);

  // 5. Private and not following: do not even fetch the stats.
  const locked = profile.is_private && followState !== "following";
  const stats = locked ? [] : await getProfileChallengeStats(supabase, profile.id);

  // The heatmap sits behind the same gate as the stats, and is likewise not
  // fetched when locked, so a private account's activity never reaches the
  // client bundle. StrivCoins are deliberately absent from this page at any
  // privacy level: a balance is the viewer's own business, not a follower's.
  const heatmap = locked
    ? []
    : ((
        await supabase
          .from("profile_activity_heatmap")
          .select("submission_date,submission_count")
          .eq("user_id", profile.id)
      ).data ?? []);

  const active = stats.filter((s) => s.status === "active");
  const completed = stats.filter((s) => s.status === "completed");
  const name = displayName(profile.full_name, profile.username);
  const isVerified = profile.verification_status === "approved";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-start gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-outline-variant bg-secondary/8">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt=""
              width={80}
              height={80}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-headline-lg font-bold text-secondary">
                {name.replace("@", "").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-headline-md font-bold text-on-surface">{name}</h1>
            {/* Identity verification only. Never render a Pro/paid badge here —
                Verified and Premium are separate systems. */}
            {isVerified ? (
              <ShieldCheck
                size={16}
                className="shrink-0 text-secondary"
                aria-label="Identity verified"
              />
            ) : null}
            {profile.is_private ? (
              <Lock
                size={14}
                className="shrink-0 text-on-surface-variant"
                aria-label="Private account"
              />
            ) : null}
          </div>

          {profile.full_name && profile.username ? (
            <p className="text-body-md text-on-surface-variant">@{profile.username}</p>
          ) : null}

          <div className="mt-3 flex items-center gap-6">
            <Stat value={counts.followers} label="followers" />
            <Stat value={counts.following} label="following" />
            {!locked ? <Stat value={completed.length} label="completed" /> : null}
          </div>
        </div>
      </header>

      {profile.bio && !locked ? (
        <p className="mt-4 text-body-md leading-relaxed text-on-surface-variant">{profile.bio}</p>
      ) : null}

      <div className="mt-5">
        {viewer ? (
          <FollowButton
            targetUserId={profile.id}
            initialState={followState === "self" ? "none" : followState}
          />
        ) : (
          <Link href={`/login?redirectTo=/u/${handle}`}>
            <span className="text-body-md font-semibold text-secondary">
              Sign in to follow
            </span>
          </Link>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {locked ? (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-outline-variant bg-surface-container-low px-6 py-10 text-center">
          <Lock size={22} className="text-on-surface-variant" aria-hidden="true" />
          <p className="mt-3 text-body-lg font-semibold text-on-surface">
            This account is private
          </p>
          <p className="mt-1 max-w-xs text-body-md text-on-surface-variant">
            Follow {name} to see their challenges, streaks, consistency and achievements.
          </p>
        </div>
      ) : (
        <section className="mt-8">
          <h2 className="mb-3 text-body-lg font-bold text-on-surface">
            Active challenges
          </h2>

          {active.length === 0 ? (
            <div className="rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-8 text-center">
              <p className="text-body-md text-on-surface-variant">
                {name} isn&apos;t in any public challenges yet.
              </p>
              <Link
                href="/explore"
                className="mt-3 inline-block text-body-md font-semibold text-secondary"
              >
                Find a challenge to join
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {active.map((s) => (
                <ChallengeRow key={s.challenge_id} stat={s} />
              ))}
            </div>
          )}

          <h2 className="mb-3 mt-8 text-body-lg font-bold text-on-surface">Consistency</h2>
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised">
            <ActivityHeatmap
              days={heatmap.map((e) => ({
                date: e.submission_date as string,
                count: e.submission_count as number,
              }))}
              label={`${name}'s activity over the last six months`}
              period="the last 6 months"
            />
          </div>

          {completed.length > 0 ? (
            <>
              <h2 className="mb-3 mt-8 text-body-lg font-bold text-on-surface">
                Achievements
              </h2>
              <div className="space-y-2">
                {completed.map((s) => (
                  <div
                    key={s.challenge_id}
                    className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 elev-1 surface-raised"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success-container">
                      <Trophy size={18} className="text-success" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-md font-semibold text-on-surface">
                        {s.title ?? "Untitled challenge"}
                      </p>
                      <p className="text-body-sm text-on-surface-variant">
                        Completed{s.duration_days ? ` · ${s.duration_days} days` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-body-md font-bold text-on-surface">
                      {s.longest_streak ?? s.current_streak}
                      <span className="ml-1 text-label-sm font-normal text-on-surface-variant">
                        best
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}
