/**
 * AlertRow — one notification, and the rules that decide how it looks.
 *
 * Lifted out of app/(app)/alerts/page.tsx so the dev harness can render every
 * kind at once: the page needs a session and real rows, so the colours, the
 * destination pills and the grouping could not otherwise be looked at.
 * Behaviour is unchanged by the move.
 */

"use client";

import Image from "next/image";
import {
  Bell,
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

export type NotificationType =
  | "new_follower"
  | "proof_approved"
  | "proof_rejected"
  | "challenge_joined"
  | "business_verification_approved"
  | "proof_liked"
  | "proof_commented"
  | string;

export interface Notification {
  id: string;
  type: NotificationType;
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

/**
 * Colour, icon and wording per kind.
 *
 * Every tone is an existing brand token. Colour is never the only signal:
 * each row still carries its own icon and its own words, so the kind is
 * legible without relying on hue. WCAG 1.4.1.
 */
interface Tone {
  icon: ComponentType<LucideProps>;
  /** The bar down the left edge. */
  accent: string;
  /** The card wash. Kept very light so body text keeps its contrast. */
  tint: string;
  /** The icon tile. */
  iconBg: string;
  iconFg: string;
}

const TONES: Record<string, Tone> = {
  challenge_joined: {
    icon: Users,
    accent: "bg-secondary",
    tint: "bg-secondary/5",
    iconBg: "bg-secondary/10",
    iconFg: "text-secondary",
  },
  new_follower: {
    icon: UserPlus,
    accent: "bg-secondary",
    tint: "bg-secondary/5",
    iconBg: "bg-secondary/10",
    iconFg: "text-secondary",
  },
  follow_request: {
    icon: UserPlus,
    accent: "bg-secondary",
    tint: "bg-secondary/5",
    iconBg: "bg-secondary/10",
    iconFg: "text-secondary",
  },
  follow_accepted: {
    icon: UserPlus,
    accent: "bg-secondary",
    tint: "bg-secondary/5",
    iconBg: "bg-secondary/10",
    iconFg: "text-secondary",
  },
  proof_approved: {
    icon: CheckCircle2,
    accent: "bg-success",
    tint: "bg-success/5",
    iconBg: "bg-success/10",
    iconFg: "text-success",
  },
  business_verification_approved: {
    icon: Store,
    accent: "bg-success",
    tint: "bg-success/5",
    iconBg: "bg-success/10",
    iconFg: "text-success",
  },
  proof_rejected: {
    icon: XCircle,
    accent: "bg-error",
    tint: "bg-error/5",
    iconBg: "bg-error/10",
    iconFg: "text-error",
  },
  proof_liked: {
    icon: ThumbsUp,
    accent: "bg-warning",
    tint: "bg-warning/5",
    iconBg: "bg-warning-container",
    iconFg: "text-warning",
  },
  proof_commented: {
    icon: MessageCircle,
    accent: "bg-warning",
    tint: "bg-warning/5",
    iconBg: "bg-warning-container",
    iconFg: "text-warning",
  },
};

const FALLBACK_TONE: Tone = {
  icon: Bell,
  accent: "bg-outline",
  tint: "bg-surface-container-low",
  iconBg: "bg-surface-container",
  iconFg: "text-on-surface-variant",
};

export function toneFor(type: NotificationType): Tone {
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
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
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

  return (
    /* One tap target for the whole row. The pill on the right is a span, not
       a nested button: a button inside a button is invalid markup and gives a
       keyboard two stops for one action. */
    <button
      type="button"
      onClick={onTap ? () => onTap(notif) : undefined}
      aria-label={dest ? `${notif.title}. ${dest.label}.` : notif.title}
      className={[
        "relative flex w-full items-center gap-3 overflow-hidden rounded-2xl",
        "border border-outline-variant py-3.5 pl-5 pr-3 text-left",
        "transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
        notif.is_read
          ? "bg-surface-container-lowest hover:bg-surface-container"
          : `${tone.tint} hover:brightness-[0.98]`,
      ].join(" ")}
    >
      {/* Accent down the left edge, carrying the kind. */}
      <span
        className={`absolute inset-y-0 left-0 w-1.5 ${tone.accent} ${
          notif.is_read ? "opacity-40" : ""
        }`}
        aria-hidden="true"
      />

      {/* Unread dot, so read and unread differ by more than a background
          wash. */}
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true">
        {!notif.is_read && <span className={`block h-2 w-2 rounded-full ${tone.accent}`} />}
      </span>

      <span
        className={`ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.iconBg}`}
      >
        <Icon size={20} className={tone.iconFg} aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={[
            "block truncate text-body-md",
            notif.is_read ? "text-on-surface" : "font-bold text-on-surface",
          ].join(" ")}
        >
          {notif.title}
        </span>
        {notif.message && (
          <span className="mt-0.5 line-clamp-2 block text-body-sm text-on-surface-variant">
            {notif.message}
          </span>
        )}
        <span className="mt-1 block text-label-sm text-on-surface-variant">
          {relativeTime(notif.created_at)}
        </span>
      </span>

      {/* Cover of whatever this is about. Dropped on the narrowest phones,
          where the destination matters more than the picture. */}
      {cover && (
        <span className="relative hidden h-11 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-container sm:block">
          <Image src={cover} alt="" fill sizes="56px" className="object-cover" />
        </span>
      )}

      {/* The destination, named. It stays on at phone width, because "where
          does this go" is the whole point of the pill and a bare chevron
          does not answer it. The cover above is what gives way instead. */}
      {dest && (
        <span
          className={[
            "inline-flex shrink-0 items-center gap-0.5 rounded-full",
            "px-2.5 py-1.5 text-label-md font-semibold sm:px-3",
            notif.is_read
              ? "bg-surface-container text-on-surface-variant"
              : `${tone.iconBg} ${tone.iconFg}`,
          ].join(" ")}
        >
          {dest.label}
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      )}
    </button>
  );
}
