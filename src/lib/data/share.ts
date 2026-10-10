/**
 * src/lib/data/share.ts — what a shared StrivUp link shows before you open it.
 *
 * One shape, SharePreview, backs three things that must never disagree: the
 * Open Graph tags in the page head, the card image WhatsApp renders from
 * them, and the landing view a signed-out visitor sees when they tap through.
 * Building all three from one query is what keeps the preview honest.
 *
 * Everything here reads through createAnonClient(), so RLS decides what is
 * public. A private challenge is not filtered out by code below; it simply
 * never comes back from the database. See src/lib/supabase/anon.ts.
 */

import { createAnonClient } from "@/lib/supabase/anon";

export interface SharePreview {
  kind: "challenge" | "quest";
  id: string;
  title: string;
  /** Creator-uploaded cover. Null when they never set one. */
  imageUrl: string | null;
  description: string | null;
  organizerName: string | null;
  /** Avatar or business logo. Null when there is none to show. */
  organizerImageUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Shown under the dates, e.g. "128 joined". Zero means it is left off. */
  participantCount: number;
}

/* ── Dates ───────────────────────────────────────────────────────────────── */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parts(iso: string): { day: number; month: string; year: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear() };
}

/**
 * "7 Oct – 20 Oct 2026", dropping the year from the start when both fall in
 * the same one, which is how a date range reads naturally.
 *
 * Formatted here rather than with toLocaleDateString because this string is
 * baked into a cached image: Intl would resolve against the server's locale,
 * so the same card could come out differently depending on which region's
 * function rendered it.
 */
export function formatTenure(startIso: string | null, endIso: string | null): string | null {
  const start = startIso ? parts(startIso) : null;
  const end = endIso ? parts(endIso) : null;

  if (start && end) {
    const left =
      start.year === end.year
        ? `${start.day} ${start.month}`
        : `${start.day} ${start.month} ${start.year}`;
    return `${left} – ${end.day} ${end.month} ${end.year}`;
  }
  if (start) return `Starts ${start.day} ${start.month} ${start.year}`;
  if (end) return `Ends ${end.day} ${end.month} ${end.year}`;
  return null;
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

/* ── Challenge ───────────────────────────────────────────────────────────── */

export async function getChallengeSharePreview(id: string): Promise<SharePreview | null> {
  const supabase = createAnonClient();

  // No visibility filter: the SELECT policy already restricts the anonymous
  // role to public challenges, so a private one returns no row here.
  const { data } = await supabase
    .from("challenges")
    .select(
      `
      id, title, description, thumbnail_url, created_at, duration_days,
      profiles!creator_id ( full_name, username, avatar_url )
      `
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const creator = data.profiles as unknown as {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;

  // challenges has no start/end pair. The tenure is the window participants
  // actually run: it opens when the challenge was created and closes
  // duration_days later. An open-ended challenge has no end, and formatTenure
  // renders that as a start alone rather than inventing a date.
  const startDate = data.created_at as string;
  const durationDays = data.duration_days as number | null;

  const { count } = await supabase
    .from("challenge_participants")
    .select("id", { count: "exact", head: true })
    .eq("challenge_id", id);

  return {
    kind: "challenge",
    id: data.id as string,
    title: data.title as string,
    imageUrl: (data.thumbnail_url as string | null) ?? null,
    description: (data.description as string | null) ?? null,
    organizerName:
      creator?.full_name ?? (creator?.username ? `@${creator.username}` : null),
    organizerImageUrl: creator?.avatar_url ?? null,
    startDate,
    endDate: durationDays ? addDays(startDate, durationDays) : null,
    participantCount: count ?? 0,
  };
}

/* ── Quest ───────────────────────────────────────────────────────────────── */

export async function getQuestSharePreview(id: string): Promise<SharePreview | null> {
  const supabase = createAnonClient();

  // Unlike challenges, the quests SELECT policy keys on status alone, so a
  // quest marked private can still be read anonymously. The visibility filter
  // below is therefore load-bearing: without it a private quest's title and
  // cover would end up in a public preview card.
  const { data } = await supabase
    .from("quests")
    .select(
      `
      id, title, description, thumbnail_url, cover_url, start_date, end_date,
      business_name, participant_count, visibility, business_id, creator_id
      `
    )
    .eq("id", id)
    .eq("visibility", "public")
    .maybeSingle();

  if (!data) return null;

  // Organizer, best source first: the verified business profile carries a
  // logo, the denormalised business_name on the quest does not, and a quest
  // created by a person has neither.
  let organizerName: string | null = (data.business_name as string | null) ?? null;
  let organizerImageUrl: string | null = null;

  if (data.business_id) {
    const { data: business } = await supabase
      .from("business_profiles")
      .select("business_name, logo_url")
      .eq("id", data.business_id as string)
      .maybeSingle();
    if (business) {
      organizerName = (business.business_name as string | null) ?? organizerName;
      organizerImageUrl = (business.logo_url as string | null) ?? null;
    }
  }

  if (!organizerName && data.creator_id) {
    const { data: creator } = await supabase
      .from("profiles")
      .select("full_name, username, avatar_url")
      .eq("id", data.creator_id as string)
      .maybeSingle();
    if (creator) {
      organizerName =
        (creator.full_name as string | null) ??
        (creator.username ? `@${creator.username}` : null);
      organizerImageUrl = (creator.avatar_url as string | null) ?? null;
    }
  }

  return {
    kind: "quest",
    id: data.id as string,
    title: data.title as string,
    imageUrl:
      (data.cover_url as string | null) ?? (data.thumbnail_url as string | null) ?? null,
    description: (data.description as string | null) ?? null,
    organizerName,
    organizerImageUrl,
    startDate: (data.start_date as string | null) ?? null,
    endDate: (data.end_date as string | null) ?? null,
    participantCount: (data.participant_count as number | null) ?? 0,
  };
}

/* ── Shared formatting ───────────────────────────────────────────────────── */

/**
 * The og:description line. Platforms truncate around 160 characters and
 * WhatsApp shows roughly two lines, so the organizer and tenure go first:
 * they are the two things a recipient uses to decide whether to tap.
 */
export function buildShareDescription(preview: SharePreview): string {
  const bits: string[] = [];
  if (preview.organizerName) bits.push(`by ${preview.organizerName}`);

  const tenure = formatTenure(preview.startDate, preview.endDate);
  if (tenure) bits.push(tenure);

  if (preview.participantCount > 0) {
    bits.push(
      preview.participantCount === 1 ? "1 joined" : `${preview.participantCount} joined`
    );
  }

  const lead = bits.join(" · ");
  const tail =
    preview.description?.replace(/\s+/g, " ").trim() ??
    (preview.kind === "challenge"
      ? "Join the challenge on StrivUp."
      : "Take on this quest on StrivUp.");

  const full = lead ? `${lead}. ${tail}` : tail;
  return full.length > 180 ? `${full.slice(0, 177).trimEnd()}…` : full;
}
