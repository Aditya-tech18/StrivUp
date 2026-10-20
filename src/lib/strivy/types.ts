/**
 * src/lib/strivy/types.ts
 *
 * Shared types for STRIVY, StrivUp's accountability companion.
 *
 * The core rule the types encode: every user-specific claim STRIVY makes comes
 * from a `StrivyFacts` object built from the database. Anything the database
 * could not answer is listed in `unavailable` so a reply can say so plainly
 * instead of guessing.
 */
import type { StrivyLang } from "./language";

export type StrivyIntent =
  | "greeting"
  | "thanks"
  | "today"
  | "focus"
  | "streak"
  | "proof_status"
  | "progress"
  | "challenges"
  | "quests"
  | "rewards"
  | "how_it_works"
  | "company_info"
  | "help"
  | "strivy_info"
  | "capabilities"
  | "general_chat"
  | "general_question"
  | "banter"
  | "action_request"
  | "motivation"
  | "create"
  | "not_built"
  | "off_topic"
  | "crisis"
  | "unknown";

/** Result of intent detection, with the evidence that produced it. */
export interface IntentResult {
  intent: StrivyIntent;
  /** high: clear match; medium: weaker match; low: guess or follow-up. */
  confidence: "high" | "medium" | "low";
  /** Names of the rules that matched, for debugging and tests. */
  matched: string[];
  /**
   * The thing asked about when the message names one (or a follow-up
   * inherits it): "my quest progress" is about the quest, never challenges.
   */
  topic?: StrivyTopic;
  /**
   * What about it: how far along ("kitna hua?"), how long is left, what's
   * still to do ("kitne task bache?") or since when ("kab se?").
   */
  detail?: StrivyDetail;
}

export type StrivyTopic = "quest" | "challenge";
export type StrivyDetail = "progress" | "deadline" | "remaining" | "since" | "complete";

/** One turn of the conversation, as the client sends it back. */
export interface ChatTurn {
  role: "user" | "strivy";
  text: string;
  /** On Strivy turns: the intent that reply answered, for follow-ups. */
  intent?: StrivyIntent;
}

/* ── Facts: what the database actually said ─────────────────────────────── */

export type TaskState = "done" | "pending" | "rejected" | "todo";

export interface ChallengeTaskFact {
  challengeId: string;
  challengeTitle: string;
  title: string;
  dayLabel: string;
  state: TaskState;
}

export interface ChallengeFact {
  challengeId: string;
  title: string;
  status: "active" | "completed" | "dropped";
  currentDay: number | null;
  durationDays: number | null;
  currentStreak: number;
  longestStreak: number;
  consistencyPct: number | null;
}

export interface QuestFact {
  questId: string;
  title: string;
  businessName: string | null;
  locationName: string | null;
  /** The participant's own completion status for this quest. */
  verificationStatus: "pending" | "approved" | "rejected";
  completed: boolean;
  endsAt: string | null;
  tasksTotal: number;
  tasksApproved: number;
  tasksPending: number;
  tasksNeedAction: number;
}

export interface ProofFact {
  kind: "challenge" | "quest";
  /** Challenge or quest id — used for the link. */
  parentId: string;
  parentTitle: string;
  /** Quest task title, or "Day N" for a challenge proof. */
  label: string;
  status: "pending" | "approved" | "rejected" | "resubmission_required" | "removed";
  rejectionReason: string | null;
  submittedAt: string;
}

/** A reward the person has a claim on (earned or in progress). */
export interface RewardFact {
  questId: string;
  questTitle: string;
  rewardTitle: string;
  status: string;
}

/** A reward offered by a quest or challenge the person has joined. */
export interface AvailableRewardFact {
  kind: "quest" | "challenge";
  parentId: string;
  parentTitle: string;
  /** Reward title for quests; the creator's own description for challenges. */
  description: string;
}

export interface WeekFact {
  /** Distinct days in the last 7 (including today) with an approved proof. */
  activeDays: number;
  approvedProofs: number;
}

export interface StrivyFacts {
  firstName: string | null;
  today?: {
    tasks: ChallengeTaskFact[];
    completed: number;
    total: number;
    bestStreak: number;
  };
  challenges?: ChallengeFact[];
  quests?: QuestFact[];
  proofs?: ProofFact[];
  rewards?: RewardFact[];
  availableRewards?: AvailableRewardFact[];
  week?: WeekFact;
  /** Human-readable names of things we tried to look up and could not. */
  unavailable: string[];
}

/* ── Reply ──────────────────────────────────────────────────────────────── */

export type ChipTone = "neutral" | "streak" | "success" | "pending" | "error";

export interface StrivyChip {
  label: string;
  tone: ChipTone;
}

export interface StrivyLink {
  label: string;
  href: string;
}

export interface StrivyReply {
  intent: StrivyIntent;
  text: string;
  chips: StrivyChip[];
  links: StrivyLink[];
  /** Follow-up prompts to offer under the reply. */
  suggestions: string[];
}

/* ── Context: everything one reply may draw on ──────────────────────────── */

export interface KnowledgeSnippet {
  id: string;
  title: string;
  status: "available" | "planned" | "not_built";
  body: string;
  link?: StrivyLink;
}

export interface StrivyContext {
  intent: IntentResult;
  /** Only the facts this intent needs. */
  facts: StrivyFacts;
  /** Only the product knowledge this message needs. */
  knowledge: KnowledgeSnippet[];
  /** The language to reply in (see language.ts). English when absent. */
  lang?: StrivyLang;
  /** Bhojpuri typed in Roman letters: small-talk templates answer in kind. */
  dialect?: "bhojpuri-roman";
}

/**
 * The minimal, id-free view of a context that a future model may see. Built by
 * toModelContext(); nothing outside it is ever sent to a model.
 */
export interface StrivyModelContext {
  intent: StrivyIntent;
  /** Reply in this language style. */
  language: StrivyLang;
  /**
   * Bhojpuri typed in Roman letters ("ka haal ba"). The templates answer it
   * in Hinglish (Roman); a model may answer in Roman Bhojpuri.
   */
  dialect?: "bhojpuri-roman";
  firstName: string | null;
  /**
   * Small talk only: "support" for a low or stressed moment (warm, no
   * teasing), "answer" for a general question (answer it first, neutrally).
   */
  chatTone?: "support" | "answer";
  facts: Record<string, unknown>;
  knowledge: { title: string; status: string; body: string }[];
  unavailable: string[];
}
