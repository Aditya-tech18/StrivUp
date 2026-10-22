/**
 * src/lib/strivy/knowledge.ts
 *
 * What STRIVY knows about STRIVUP and about itself. Curated by hand from the
 * Help FAQ, the About page, the README, the app's routes and the live schema.
 * It is a few kilobytes, so plain keyword lookup is enough; no retrieval
 * system or embeddings are needed.
 *
 * Every entry carries a status so STRIVY never presents a planned feature as
 * something the person can use today:
 *   available — shipped and usable now
 *   planned   — mentioned in the product but not usable yet
 *   not_built — does not exist in STRIVUP
 *
 * When a feature ships or changes, update the entry here. Don't add entries
 * for features that aren't in the codebase.
 */
import type { KnowledgeSnippet, StrivyIntent } from "./types";

export type FeatureStatus = KnowledgeSnippet["status"];

export interface KnowledgeEntry extends KnowledgeSnippet {
  /** about: Strivy itself · concept: what something is · howto: steps */
  kind: "about" | "concept" | "howto";
  /** Lower-case keywords (or short phrases) that point at this entry. */
  keywords: string[];
}

export const KNOWLEDGE: KnowledgeEntry[] = [
  /* ── Strivy itself ─────────────────────────────────────────────────── */
  {
    id: "strivy",
    kind: "about",
    title: "What Strivy is",
    status: "available",
    keywords: ["strivy", "who are you", "what are you", "ai", "bot", "chatgpt", "purpose"],
    body: "I'm Strivy, STRIVUP's accountability companion. My job is to help you keep showing up: I check what's due today, how your streaks and week look, whether your proof got verified, and how your quests and rewards are going. I only use your real STRIVUP data, and if I don't have something, I'll say so instead of guessing. Right now my answers come straight from your data, not from an AI model.",
  },
  {
    id: "strivy_usage",
    kind: "about",
    title: "How to use Strivy",
    status: "available",
    keywords: ["what can you do", "how do i use", "what can i ask", "how can you help"],
    body: 'Tap the blue sparkle button and ask me things like "What\'s due today?", "How\'s my streak?", "Did my proof get verified?", "How am I doing this week?", "What\'s my active quest?" or "What should I focus on today?". I can also explain how challenges, quests, proof and streaks work. Our chat lasts for this visit; I don\'t keep it after you leave.',
  },

  /* ── The company ──────────────────────────────────────────────────── */
  {
    id: "company",
    kind: "about",
    title: "About STRIVUP",
    status: "available",
    keywords: ["founder", "founders", "cofounder", "team", "ceo", "company", "about strivup"],
    body: "STRIVUP is India's platform for growth: challenges, quests, streaks and community, built to help people keep showing up. Contact: strivup.officialteam@gmail.com.",
    link: { label: "About STRIVUP", href: "/settings/about" },
  },

  /* ── Core concepts ──────────────────────────────────────────────────── */
  {
    id: "overview",
    kind: "concept",
    title: "How STRIVUP works",
    status: "available",
    keywords: ["strivup", "work", "app", "platform", "loop"],
    body: "STRIVUP runs on one loop: pick a challenge or quest, do the thing, upload proof, get it verified, and keep showing up. Verified proof builds your streak and your consistency, and your home screen shows what you still owe today.",
  },
  {
    id: "challenge_vs_quest",
    kind: "concept",
    title: "Challenges vs quests",
    status: "available",
    keywords: ["difference", "vs", "versus", "compare"],
    body: "A challenge is a daily habit over a set number of days, like 30 days of running: you upload proof every day and build a streak. A quest is a separate, one-off activity, usually at a place and often set by a business or creator: you complete its tasks, submit proof for each, and some quests come with a reward.",
  },
  {
    id: "challenges",
    kind: "concept",
    title: "Challenges",
    status: "available",
    keywords: ["challenge", "challenges", "daily", "habit"],
    body: "A challenge is a daily habit with a set length. Join one from Explore, then upload proof each day. Some challenges have several tasks per day. Challenges can be public, or private and joined through an invite link.",
    link: { label: "Explore challenges", href: "/explore" },
  },
  {
    id: "quests",
    kind: "concept",
    title: "Quests",
    status: "available",
    keywords: ["quest", "quests", "location", "visit", "place"],
    body: "A quest is separate from a challenge: a one-off, usually location-based activity, often set by a business or creator. You join it, complete its tasks, submit proof for each, and some quests come with a reward.",
    link: { label: "Browse quests", href: "/quests" },
  },
  {
    id: "proof",
    kind: "concept",
    title: "Proof and verification",
    status: "available",
    keywords: [
      "proof",
      "evidence",
      "verify",
      "verification",
      "verified",
      "approved",
      "rejected",
      "review",
    ],
    body: "Proof is how you show you did it: a photo, video or text update, depending on the challenge. Each proof gets an automatic check first, and if that isn't clear, a person reviews it. It shows as Pending until there's a decision. A rejected proof shows the reason so you can fix it and resubmit. Only approved proof counts toward streaks.",
  },
  {
    id: "streaks",
    kind: "concept",
    title: "Streaks",
    status: "available",
    keywords: ["streak", "streaks", "row"],
    body: "Your streak counts consecutive days with approved proof, per challenge. Miss a day and that challenge's streak starts again. Your longest streak is kept.",
  },
  {
    id: "progress",
    kind: "concept",
    title: "Progress and consistency",
    status: "available",
    keywords: ["progress", "consistency", "consistent", "percentage", "score", "stats", "heatmap"],
    body: "Consistency is approved proofs divided by days elapsed in a challenge, shown as a percentage. Your home screen shows today's tasks with a meter that fills as you finish, and your profile shows your challenge stats and an activity heatmap. A challenge counts as completed when its days are up and you had at least one approved proof.",
  },
  {
    id: "rewards",
    kind: "concept",
    title: "Rewards",
    status: "available",
    keywords: ["reward", "rewards", "prize", "earn", "win", "voucher", "coupon"],
    body: "Rewards come from quests: a quest can offer things like vouchers, discounts or certificates, and you earn them by completing it. Some challenges also describe a reward, set by whoever created the challenge.",
  },
  {
    id: "community",
    kind: "concept",
    title: "Community and accountability",
    status: "available",
    keywords: [
      "community",
      "feed",
      "follow",
      "followers",
      "social",
      "friends",
      "accountability",
      "leaderboard",
    ],
    body: "The home feed shows live proof from people doing challenges, so you can see who's showing up. You can follow people, and each challenge has a leaderboard. Inviting friends into the same challenge is the best way to keep each other honest.",
  },
  {
    id: "alerts",
    kind: "concept",
    title: "Alerts",
    status: "available",
    keywords: ["alert", "alerts", "notification", "notifications"],
    body: "Alerts tell you when a proof is approved or rejected, when someone follows you, when you join or complete something, and about quest updates.",
    link: { label: "Open alerts", href: "/alerts" },
  },

  /* ── How-to ─────────────────────────────────────────────────────────── */
  {
    id: "howto_join",
    kind: "howto",
    title: "Joining a challenge",
    status: "available",
    keywords: ["join", "joining", "find", "explore"],
    body: "Go to Explore, find a challenge you like and tap Join. You can upload your first proof right after joining. For a private challenge, open the invite link someone shared with you.",
    link: { label: "Explore challenges", href: "/explore" },
  },
  {
    id: "howto_proof",
    kind: "howto",
    title: "Uploading proof",
    status: "available",
    keywords: ["upload", "submit", "proof", "post"],
    body: "Open your challenge from the Home screen, then tap Upload Proof and add a photo, video or text update for the day. If it gets rejected, the reason is shown on the challenge so you can fix it and resubmit.",
  },
  {
    id: "howto_invite",
    kind: "howto",
    title: "Inviting friends",
    status: "available",
    keywords: ["invite", "share", "friend", "friends", "link"],
    body: "Open the challenge and use its invite option to share a link. Friends who open it can sign in and join straight away.",
  },
  {
    id: "howto_create",
    kind: "howto",
    title: "Creating a challenge",
    status: "available",
    keywords: ["create", "make", "start", "new", "host"],
    body: "Tap Create in the bottom bar. Give your challenge a title, a length in days, the kind of proof you want, and choose public or private. You can add daily tasks after. As the creator, you review your participants' proof from My Challenges.",
    link: { label: "Create a challenge", href: "/challenges/new" },
  },
  {
    id: "howto_create_quest",
    kind: "howto",
    title: "Creating a quest",
    status: "planned",
    keywords: [],
    body: "Quests are set up by businesses and creators, and that side of STRIVUP isn't open to everyone yet, so you can't create a quest yourself right now. You can create a challenge, though.",
    link: { label: "Create a challenge", href: "/challenges/new" },
  },
  {
    id: "howto_profile",
    kind: "howto",
    title: "Profile and privacy",
    status: "available",
    keywords: ["username", "profile", "private", "privacy", "pin", "bio", "edit"],
    body: "Change your name, username or bio in Settings → Edit Profile. Make your account private in Settings → Account Privacy, so only approved followers see your content. You can pin up to 3 challenges to your profile.",
    link: { label: "Open settings", href: "/settings" },
  },
  {
    id: "howto_account",
    kind: "howto",
    title: "Deactivating or deleting your account",
    status: "available",
    keywords: ["delete", "deactivate", "account", "remove"],
    body: "Settings → Deactivate Account hides your account and keeps your data; sign back in any time to reactivate. Settings → Delete Account removes it permanently after you type DELETE to confirm.",
    link: { label: "Open settings", href: "/settings" },
  },

  /* ── Planned, not live ──────────────────────────────────────────────── */
  {
    id: "creator_pro",
    kind: "concept",
    title: "Creator Pro",
    status: "planned",
    keywords: [
      "creator",
      "pro",
      "subscription",
      "subscriptions",
      "subscribe",
      "premium",
      "plan",
      "pricing",
      "paid",
    ],
    body: "Creator Pro plans are planned but not live yet: there's no way to subscribe or pay in STRIVUP today.",
  },
  {
    id: "business",
    kind: "concept",
    title: "Business challenges",
    status: "planned",
    keywords: ["business", "gym", "gyms", "brand", "brands"],
    body: "Challenges and quests run by gyms and other businesses are being prepared but aren't open to everyone yet.",
  },

  /* ── Not in STRIVUP ─────────────────────────────────────────────────── */
  {
    id: "points",
    kind: "concept",
    title: "Points, XP and badges",
    status: "not_built",
    keywords: ["points", "point", "xp", "coins", "coin", "badges", "badge", "level", "levels"],
    body: "STRIVUP doesn't have points, XP or badges. Progress is measured by streaks, consistency and completed challenges.",
  },
  {
    id: "crews",
    kind: "concept",
    title: "Crews and accountability partners",
    status: "not_built",
    keywords: ["crew", "crews", "partner", "partners", "buddy", "buddies"],
    body: "STRIVUP doesn't have crews or accountability partners yet. The closest thing today is inviting friends into the same challenge.",
  },
  {
    id: "marketplace",
    kind: "concept",
    title: "Marketplace",
    status: "not_built",
    keywords: ["marketplace", "shop", "store"],
    body: "STRIVUP doesn't have a marketplace.",
  },
];

/**
 * Who founded and runs STRIVUP, as published by STRIVUP itself. Only add a
 * person here once their name and role appear in STRIVUP's own About page or
 * official content: STRIVY answers founder and team questions from this list
 * and never from a model, so an empty list means "I don't know", never a
 * guess. The facts below are copied from src/app/(app)/settings/about.
 */
export interface TeamMember {
  name: string;
  role: string;
}
export const STRIVUP_TEAM: readonly TeamMember[] = [];

export const STRIVUP_COMPANY = {
  name: "STRIVUP",
  tagline: "India's Platform for Growth",
  country: "India",
  contactEmail: "strivup.officialteam@gmail.com",
  aboutHref: "/settings/about",
} as const;

const BY_ID = new Map(KNOWLEDGE.map((k) => [k.id, k]));

export function knowledgeById(id: string): KnowledgeEntry | undefined {
  return BY_ID.get(id);
}

/**
 * The best-matching entries for a message, scored by keyword hits (phrases
 * score double). `kinds` narrows the search, e.g. to how-to entries for a
 * "how do I…" question. Returns at most `limit` entries, and none when nothing
 * matches.
 */
export function findKnowledge(
  message: string,
  limit = 2,
  kinds?: KnowledgeEntry["kind"][]
): KnowledgeEntry[] {
  const lower = message.toLowerCase();
  const words = new Set(lower.match(/[a-z]+/g) ?? []);
  return KNOWLEDGE.filter((e) => !kinds || kinds.includes(e.kind))
    .map((entry) => ({
      entry,
      score: entry.keywords.reduce(
        (n, k) => n + (k.includes(" ") ? (lower.includes(k) ? 2 : 0) : words.has(k) ? 1 : 0),
        0
      ),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

/** Strip a knowledge entry down to what a reply or model may use. */
export function toSnippet(entry: KnowledgeEntry): KnowledgeSnippet {
  return {
    id: entry.id,
    title: entry.title,
    status: entry.status,
    body: entry.body,
    ...(entry.link ? { link: entry.link } : {}),
  };
}

/** The product knowledge a message needs, if any. */
export function selectKnowledge(intent: StrivyIntent, message: string): KnowledgeSnippet[] {
  const byId = (...ids: string[]) =>
    ids.map((id) => knowledgeById(id)).filter((e): e is KnowledgeEntry => Boolean(e));
  let entries: KnowledgeEntry[] = [];

  switch (intent) {
    case "strivy_info":
      entries = /\b(what can|how can you|how do i use|what do you do|ask)\b/i.test(message)
        ? byId("strivy_usage", "strivy")
        : byId("strivy");
      break;
    case "how_it_works": {
      if (/\b(difference|vs\.?|versus)\b/i.test(message)) {
        entries = byId("challenge_vs_quest");
        break;
      }
      const matches = findKnowledge(message, 2, ["concept"]);
      entries = matches.length > 0 ? matches : byId("overview");
      break;
    }
    case "help": {
      const howto = findKnowledge(message, 1, ["howto"]);
      const any = howto.length > 0 ? howto : findKnowledge(message, 1, ["concept", "about"]);
      entries = any.length > 0 ? any : byId("strivy_usage");
      break;
    }
    case "create":
      entries = /\bquests?\b/i.test(message) ? byId("howto_create_quest") : byId("howto_create");
      break;
    case "company_info":
      entries = byId("company");
      break;
    case "not_built":
      entries = findKnowledge(message, 1).filter((e) => e.status !== "available");
      break;
    default:
      entries = [];
  }

  return entries.map(toSnippet);
}
