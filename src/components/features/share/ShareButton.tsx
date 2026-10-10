"use client";

/**
 * ShareButton — one tap to the phone's own app picker.
 *
 * Sharing used to live inside InviteSheet, which is creator-only, so everyone
 * else on a challenge had no way to pass it on. This is the button for them:
 * it goes on every challenge and quest, for every viewer.
 *
 * What it shares depends on what will actually produce a preview for the
 * person receiving it:
 *
 *   public challenge / quest   the page URL, which carries its own og: tags
 *   private challenge          the invite link, since the page URL would show
 *                              a stranger nothing they are allowed to open
 *
 * The invite code is fetched lazily, on the first tap, and only for private
 * challenges. ensure_challenge_invite_code is creator-only in the database,
 * so for a non-creator the call simply fails and the button falls back to
 * copying the page URL rather than pretending it worked.
 *
 * navigator.share needs a user gesture and a secure origin, and it is absent
 * on most desktop browsers, so the clipboard is the fallback everywhere.
 */

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ensureInviteCode, inviteUrl } from "@/lib/data/invites";

type Kind = "challenge" | "quest";

export function ShareButton({
  kind,
  id,
  title,
  isPrivate = false,
  className,
  label,
}: {
  kind: Kind;
  id: string;
  title: string;
  /** Private challenges share their invite link instead of the page URL. */
  isPrivate?: boolean;
  className?: string;
  /** Visible text. Omit for an icon-only button in a toolbar. */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function resolveUrl(): Promise<string> {
    const origin = window.location.origin;
    const pageUrl = `${origin}/${kind === "challenge" ? "challenges" : "quests"}/${id}`;

    if (kind !== "challenge" || !isPrivate) return pageUrl;

    const { code } = await ensureInviteCode(createClient(), id);
    return code ? inviteUrl(code, origin) : pageUrl;
  }

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    try {
      const url = await resolveUrl();
      const text =
        kind === "challenge"
          ? `Join me on "${title}" on StrivUp.`
          : `Take on "${title}" on StrivUp.`;

      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title, text, url });
          return;
        } catch {
          // Dismissed, or the browser refused. Fall through to the clipboard
          // rather than leaving the tap with no result at all.
        }
      }

      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Both paths unavailable (no clipboard permission, insecure origin).
      // Nothing useful to say beyond leaving the button as it was.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      aria-label={copied ? "Link copied" : `Share ${title}`}
      /* pop-press is always applied, whatever the caller passes: the tactile
         press is part of what this control is, not a per-site decoration. */
      className={`pop-press ${
        className ??
        "flex h-9 items-center justify-center gap-1.5 rounded-full bg-surface-container-lowest px-3 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-60 tap-target"
      }`}
    >
      {copied ? (
        <Check size={17} aria-hidden="true" />
      ) : (
        <Share2 size={17} aria-hidden="true" />
      )}
      {label && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}
