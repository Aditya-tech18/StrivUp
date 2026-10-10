"use client";

/**
 * UserAvatar — a person's picture, or the grey circle when there isn't one.
 *
 * Every avatar in the app goes through this, because there are three ways to
 * have no picture and only one of them is "the column is null":
 *
 *   null / empty string   never uploaded, or cleared to ""
 *   a host next/image is not configured for   renders the broken-image glyph
 *   a URL that 404s       Google rotates account picture URLs, and an old
 *                         one in the database outlives the image
 *
 * The first two were showing a torn-page icon on the suggestions rail. Only
 * the last needs runtime handling, so `failed` flips on the image's error
 * event and the placeholder takes over from then on.
 *
 * The placeholder is a neutral circle with a person glyph rather than
 * initials: initials on a 28px facepile avatar are unreadable, and a wall of
 * coloured letter-circles reads as noise next to real photographs.
 */

import { useState } from "react";
import Image from "next/image";
import { User } from "lucide-react";

export function UserAvatar({
  src,
  name,
  size = 40,
  className = "",
}: {
  src: string | null | undefined;
  /** Used for the alt text only; the visual fallback is never initials. */
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  const trimmed = typeof src === "string" ? src.trim() : "";
  const usable = trimmed.length > 0 && !failed;

  const box = `shrink-0 overflow-hidden rounded-full ${className}`;
  const style = { width: size, height: size };

  if (!usable) {
    return (
      <span
        role="img"
        aria-label={name ? `${name}, no profile picture` : "No profile picture"}
        className={`${box} flex items-center justify-center bg-surface-container-high text-on-surface-variant`}
        style={style}
      >
        <User size={Math.round(size * 0.52)} strokeWidth={1.75} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className={box} style={style}>
      <Image
        src={trimmed}
        alt={name ? `${name}'s profile picture` : ""}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
        // Avatars are small and numerous; an unoptimized 96px Google image is
        // cheaper than a round trip through the optimizer for each one.
        unoptimized
      />
    </span>
  );
}
