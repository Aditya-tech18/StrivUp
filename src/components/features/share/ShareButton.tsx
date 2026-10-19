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

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Link2, Share2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ensureInviteCode, inviteUrl } from "@/lib/data/invites";

type Kind = "challenge" | "quest";

/**
 * Where a desktop share goes.
 *
 * navigator.share is a phone API: it is absent in desktop Chrome and
 * Firefox, so on a laptop the button used to silently copy to the clipboard
 * and nothing else. These are the documented web intents for each platform,
 * which open that platform's own composer with the link already in it.
 *
 * Instagram is deliberately not in this list. It publishes no web share
 * intent at all: there is no URL that opens an Instagram composer with a
 * link, and anything claiming to is a redirect to the app's home. Copy link
 * is the honest answer there, and it is the last row of the sheet.
 */
const INTENTS: { id: string; label: string; href: (url: string, text: string) => string }[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    href: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    href: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: "x",
    label: "X",
    href: (url, text) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: "facebook",
    label: "Facebook",
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: (url) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
];


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
  /* The desktop sheet. Holds the resolved URL rather than re-resolving per
     row: a private challenge's invite code costs a round trip. */
  const [sheet, setSheet] = useState<{ url: string; text: string } | null>(null);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

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

      // The phone's own app picker, which is what people expect from a share
      // arrow and what puts WhatsApp, Instagram and the rest in one sheet.
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title, text, url });
          return;
        } catch (err) {
          // A deliberate dismissal is not a failure, so it must not fall
          // through to copying something the person chose not to send.
          if (err instanceof DOMException && err.name === "AbortError") return;
          // Anything else (no permission, insecure origin) falls through.
        }
      }

      // CHANGED: desktop used to copy silently here, with no sign anything
      // had happened and no way to reach a platform. navigator.share does not
      // exist in desktop Chrome or Firefox, so that was most laptop shares.
      setSheet({ url, text });
    } catch {
      // Both paths unavailable (no clipboard permission, insecure origin).
      // Nothing useful to say beyond leaving the button as it was.
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!sheet) return;
    try {
      await navigator.clipboard.writeText(`${sheet.text}\n${sheet.url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setSheet(null);
    } catch {
      // Clipboard blocked. The URL is on screen and selectable, so the
      // person still has a way to take it.
    }
  }

  return (
    <>
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      aria-label={copied ? "Link copied" : `Share ${title}`}
      /* pop-press is always applied, whatever the caller passes: the tactile
         press is part of what this control is, not a per-site decoration. */
      className={`pop-press share-pulse ${
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

    {/* CHANGED: the desktop share sheet. Portalled to <body> because the
        sticky headers these buttons sit in carry backdrop-blur, which makes
        the header the containing block for position:fixed and would clip the
        sheet to the height of the bar. */}
    {sheet && typeof document !== "undefined" && createPortal(
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${title}`}
      >
        <button
          type="button"
          aria-label="Close share menu"
          onClick={() => setSheet(null)}
          className="absolute inset-0 h-full w-full bg-primary/50 backdrop-blur-sm"
        />

        <div className="relative w-full max-w-sm rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 elev-5">
          <div className="mb-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-body-lg font-bold text-on-surface">Share this {kind}</p>
              <p className="truncate text-body-sm text-on-surface-variant">{title}</p>
            </div>
            <button
              type="button"
              onClick={() => setSheet(null)}
              aria-label="Close"
              className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <ul className="mt-3 flex flex-col gap-1.5" role="list">
            {INTENTS.map((i) => (
              <li key={i.id}>
                <a
                  href={i.href(sheet.url, sheet.text)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setSheet(null)}
                  className="flex h-12 items-center gap-3 rounded-xl px-3 text-body-md font-semibold text-on-surface transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                >
                  <Link2 size={18} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
                  {i.label}
                </a>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={copyLink}
                className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-body-md font-semibold text-on-surface transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                {copied
                  ? <Check size={18} className="shrink-0 text-success" aria-hidden="true" />
                  : <Copy size={18} className="shrink-0 text-on-surface-variant" aria-hidden="true" />}
                {copied ? "Copied" : "Copy link"}
              </button>
            </li>
          </ul>

          {/* Instagram has no web share intent, so saying "paste it" is the
              only truthful instruction we can give for it. */}
          <p className="mt-3 border-t border-outline-variant pt-3 text-label-md leading-relaxed text-on-surface-variant">
            For Instagram, copy the link and paste it into a story or a DM.
            Instagram does not accept shared links from the web.
          </p>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
