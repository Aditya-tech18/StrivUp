"use client";

import Image from "next/image";
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  MessageCircle,
  Store,
  ThumbsUp,
  Users,
  UserPlus,
  XCircle,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  related_challenge_id: string | null;
  /** Present in the live schema. Selecting it is what makes quest rows tap
   *  through to the quest instead of silently going nowhere. */
  related_quest_id: string | null;
  related_user_id: string | null;
  created_at: string;
}

/** Cover art for the thing a notification is about, keyed by its id. */
export type CoverMap = Map<string, string>;

// ── Tone ──────────────────────────────────────────────────────────────────────

interface Tone {
  icon: ComponentType<LucideProps>;
  label: string;
  category?: "proof" | "social";
  accent: string;
  iconBg: string;
  iconFg: string;
}

const FOLLOW_TONE: Tone = {
  icon: UserPlus,
  label: "Follow activity",
  category: "social",
  accent: "bg-secondary",
  iconBg: "bg-secondary/10",
  iconFg: "text-secondary",
};

const PROOF_APPROVED_TONE: Tone = {
  icon: CheckCircle2,
  label: "Proof review",
  category: "proof",
  accent: "bg-success",
  iconBg: "bg-success/10",
  iconFg: "text-success",
};

const PROOF_REJECTED_TONE: Tone = {
  icon: XCircle,
  label: "Proof review",
  category: "proof",
  accent: "bg-error",
  iconBg: "bg-error/10",
  iconFg: "text-error",
};

const TONES: Partial<Record<string, Tone>> = {
  challenge_joined: {
    icon: Users,
    label: "Challenge activity",
    accent: "bg-secondary",
    iconBg: "bg-secondary/10",
    iconFg: "text-secondary",
  },
  new_follower: FOLLOW_TONE,
  follow_request: FOLLOW_TONE,
  follow_accepted: FOLLOW_TONE,
  proof_approved: PROOF_APPROVED_TONE,
  quest_task_approved: PROOF_APPROVED_TONE,
  proof_rejected: PROOF_REJECTED_TONE,
  quest_task_rejected: PROOF_REJECTED_TONE,
  business_verification_approved: {
    icon: Store,
    label: "Business update",
    accent: "bg-success",
    iconBg: "bg-success/10",
    iconFg: "text-success",
  },
  business_verification_rejected: {
    icon: Store,
    label: "Business update",
    accent: "bg-error",
    iconBg: "bg-error/10",
    iconFg: "text-error",
  },
  proof_liked: {
    icon: ThumbsUp,
    label: "Reaction",
    category: "social",
    accent: "bg-warning",
    iconBg: "bg-warning-container",
    iconFg: "text-warning",
  },
  proof_commented: {
    icon: MessageCircle,
    label: "Comment",
    category: "social",
    accent: "bg-warning",
    iconBg: "bg-warning-container",
    iconFg: "text-warning",
  },
};

const FALLBACK_TONE: Tone = {
  icon: Bell,
  label: "Update",
  accent: "bg-outline",
  iconBg: "bg-surface-container",
  iconFg: "text-on-surface-variant",
};

export function toneFor(type: Notification["type"]): Tone {
  return TONES[type] ?? FALLBACK_TONE;
}

// ── Destination ───────────────────────────────────────────────────────────────

/**
 * Where a row goes, and what the pill says.
 *
 * Returns null when there is nothing to open, and the row then renders no
 * pill at all. A button promising "View Details" that goes nowhere is worse
 * than no button: it teaches people the page is broken.
 */
export function destinationFor(n: Notification): { href: string; label: string } | null {
  if (n.related_quest_id) {
    return { href: `/quests/${n.related_quest_id}`, label: "View Quest" };
  }
  if (n.related_challenge_id) {
    return {
      href: `/challenges/${n.related_challenge_id}`,
      label: n.type === "proof_rejected" ? "View Details" : "View Challenge",
    };
  }
  if (n.type === "business_verification_approved") {
    return { href: "/business/dashboard", label: "Go to Business" };
  }
  if (n.related_user_id) {
    // /u/[handle] accepts a UUID as well as a username, which matters here
    // because related_user_id is always a UUID.
    return { href: `/u/${n.related_user_id}`, label: "View Profile" };
  }
  return null;
}

// ── Time ──────────────────────────────────────────────────────────────────────

export function relativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(isoString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export const GROUPS = ["Today", "Yesterday", "Earlier this week", "Last week", "Earlier"] as const;
export type Group = (typeof GROUPS)[number];

/** Which heading a notification sits under. Measured in whole local days, so
 *  something from 11pm last night reads as Yesterday rather than "20h ago". */
export function groupFor(isoString: string): Group {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor(
    (startOfToday.getTime() - new Date(isoString).setHours(0, 0, 0, 0)) / 86_400_000
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Earlier this week";
  if (days < 14) return "Last week";
  return "Earlier";
}


// ── Row ───────────────────────────────────────────────────────────────────────

export function AlertRow({
  notif,
  cover,
  onTap,
}: {
  notif: Notification;
  cover?: string;
  /** Optional so a server-rendered preview can mount the row without handing
   *  a function across the server/client boundary, which React rejects. */
  onTap?: (n: Notification) => void;
}) {
  const tone = toneFor(notif.type);
  const Icon = tone.icon;
  const dest = destinationFor(notif);
  const ActionIcon = dest ? ChevronRight : Check;
  const actionLabel = dest?.label ?? (!notif.is_read && onTap ? "Mark as read" : null);
  const cardClass = [
    "relative flex w-full items-start gap-3 rounded-2xl border border-outline-variant/85 py-3.5 pr-3.5 pl-4 text-left sm:p-4 sm:pl-5",
    notif.is_read ? "bg-surface-container-lowest" : "bg-surface-container",
  ].join(" ");

  const content = (
    <>
      <span
        className={`absolute inset-y-3 left-0 w-0.75 rounded-r-full ${tone.accent} ${notif.is_read ? "opacity-40" : ""}`}
        aria-hidden="true"
      />
      <span
        className={`relative grid size-10 shrink-0 place-items-center rounded-xl ${tone.iconBg}`}
        aria-hidden="true"
      >
        <Icon size={19} className={tone.iconFg} />
        {!notif.is_read && (
          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface-container bg-secondary" />
        )}
      </span>
      <span className="min-w-0 flex-1 wrap-anywhere">
        <span className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <span className={`text-[11px] font-bold tracking-wide uppercase ${tone.iconFg}`}>
            {!notif.is_read && <span className="sr-only">Unread. </span>}
            {tone.label}
          </span>
          <time dateTime={notif.created_at} className="text-xs leading-4 whitespace-nowrap text-on-surface-variant">
            {relativeTime(notif.created_at)}
          </time>
        </span>
        <span className="block font-display text-sm leading-5 font-bold text-on-surface sm:text-base">
          {notif.title}
        </span>
        {notif.message && (
          <span className="mt-1 block text-sm leading-5 text-on-surface-variant">
            {notif.message}
          </span>
        )}
        {actionLabel && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-lg bg-secondary/10 px-2.5 py-1 text-xs font-semibold text-secondary">
            {actionLabel}
            <ActionIcon size={13} aria-hidden="true" />
          </span>
        )}
      </span>
      {cover && (
        <span className="relative hidden h-12 w-16 shrink-0 self-center overflow-hidden rounded-lg bg-surface-container sm:block">
          <Image src={cover} alt="" fill sizes="64px" className="object-cover" />
        </span>
      )}
    </>
  );

  if (!onTap || !actionLabel) return <div className={cardClass}>{content}</div>;

  return (
    <button
      type="button"
      onClick={() => onTap(notif)}
      className={`${cardClass} transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary`}
    >
      {content}
    </button>
  );
}
