"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, RefreshCw, Share2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { ensureInviteCode, inviteUrl } from "@/lib/data/invites";

/**
 * InviteSheet — how a creator pulls their friends into a challenge.
 *
 * This is the cold-start mechanism, so it optimises for one thing: getting a
 * link into a WhatsApp group in as few taps as possible. Native share sheet
 * where the browser has one (every Android phone, which is the Bennett case),
 * clipboard copy everywhere else.
 *
 * The code is issued lazily on first open rather than at challenge creation, so
 * a solo/"Personal" challenge never gets a code it didn't ask for — that
 * absence is what distinguishes Personal from Friends Only.
 */
export function InviteSheet({
  challengeId,
  challengeTitle,
  onClose,
}: {
  challengeId: string;
  challengeTitle: string;
  onClose: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Issue (or fetch) the code as soon as the sheet opens. Every state write
  // happens after an await, so this never sets state synchronously in an
  // effect; `cancelled` drops the response if the sheet closes mid-flight.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { code: c, error: e } = await ensureInviteCode(createClient(), challengeId);
      if (cancelled) return;
      setCode(c);
      setError(e);
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  const url = code ? inviteUrl(code) : "";
  const shareText = `Join me on "${challengeTitle}" — daily proof, no excuses.`;

  async function handleShare() {
    if (!url) return;
    // navigator.share needs a user gesture and only exists on secure origins.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: challengeTitle, text: shareText, url });
        return;
      } catch {
        // User dismissed the sheet, or the browser refused — fall through to copy.
      }
    }
    await handleCopy();
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(`${shareText}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically — select the link below and copy it.");
    }
  }

  async function handleRotate() {
    setBusy(true);
    setError(null);
    const { code: c, error: e } = await ensureInviteCode(createClient(), challengeId, true);
    setCode(c);
    setError(e);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-gutter backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-sheet-title"
        className="w-full max-w-md rounded-xl bg-surface-container-lowest p-space-md elev-5"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="invite-sheet-title" className="text-headline-sm text-on-surface">
              Invite your people
            </h2>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              Anyone with this link can join and see everyone&apos;s proof.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {busy ? (
          <div className="flex justify-center py-space-xl">
            <Loader2 size={22} className="animate-spin text-secondary" aria-hidden="true" />
          </div>
        ) : error && !code ? (
          <p role="alert" className="py-space-lg text-center text-body-md text-error">
            {error}
          </p>
        ) : (
          <>
            {/* The link itself — selectable, so a manual copy always works. */}
            <div className="mt-space-md rounded-lg bg-surface-container-low p-space-sm">
              <p className="break-all font-mono text-body-sm text-on-surface">{url}</p>
            </div>

            <div className="mt-space-md flex gap-space-sm">
              <Button variant="primary" fullWidth onClick={handleShare}>
                <Share2 size={16} aria-hidden="true" />
                Share link
              </Button>
              <Button variant="outline" onClick={handleCopy} aria-label="Copy invite link">
                {copied ? (
                  <Check size={16} className="text-on-tertiary-container" aria-hidden="true" />
                ) : (
                  <Copy size={16} aria-hidden="true" />
                )}
              </Button>
            </div>

            {copied ? (
              <p role="status" className="mt-space-xs text-center text-label-sm text-on-tertiary-container">
                Copied — paste it in your group chat.
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="mt-space-xs text-center text-label-sm text-error">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleRotate}
              className="mt-space-md flex w-full items-center justify-center gap-1.5 py-2 text-label-md text-on-surface-variant transition-colors hover:text-on-surface"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Generate a new link
            </button>
            <p className="text-center text-label-sm text-on-surface-variant/80">
              Replacing the link stops the old one working.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
