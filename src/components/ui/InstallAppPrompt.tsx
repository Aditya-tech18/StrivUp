"use client";

/**
 * InstallAppPrompt — the "get the app" nudge.
 *
 * Appears 30 seconds after someone lands, once per visit. It is not re-shown
 * every 30 seconds for the length of a session: a banner that keeps coming
 * back over the screen someone is reading is the thing that gets a site
 * closed, and on Chrome a repeatedly-dismissed install prompt is a signal
 * Chrome itself starts suppressing. DISMISS_DAYS below is the knob if you
 * want it to nag harder or softer.
 *
 * On Android Chrome this fires the real install flow through the
 * beforeinstallprompt event, so "Install" means installed, with no app store
 * detour. iOS Safari never fires that event and has no programmatic install,
 * so it gets the Share -> Add to Home Screen instruction instead, which is
 * the only thing that actually works there.
 *
 * It never shows to someone who already has the app: display-mode:standalone
 * is true inside the installed PWA and inside the Play Store TWA wrapper.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { BrandMark } from "./BrandMark";

/** How long after landing the prompt appears. */
const DELAY_MS = 30_000;
/** How long a dismissal is respected. */
const DISMISS_DAYS = 7;
const DISMISS_KEY = "strivup.installPrompt.dismissedUntil";

/** The slice of BeforeInstallPromptEvent we use; it is not in lib.dom yet. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari predates display-mode and sets this instead.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Storage can throw in private mode, so every access is guarded. */
function dismissedRecently(): boolean {
  try {
    const until = window.localStorage.getItem(DISMISS_KEY);
    return until !== null && Number(until) > Date.now();
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(
      DISMISS_KEY,
      String(Date.now() + DISMISS_DAYS * 86_400_000)
    );
  } catch {
    /* Private mode. The prompt simply reappears next visit. */
  }
}

export function InstallAppPrompt() {
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const deferred = useRef<InstallPromptEvent | null>(null);
  const [canInstallDirectly, setCanInstallDirectly] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    /* Chrome fires this when the app is installable, and only then. Capturing
       it is what lets the button run the real install later: the event cannot
       be summoned on demand, it has to be kept from when it was offered. */
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      deferred.current = event as InstallPromptEvent;
      setCanInstallDirectly(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Someone who installs from the browser's own menu should not then be
    // asked to install.
    const onInstalled = () => setOpen(false);
    window.addEventListener("appinstalled", onInstalled);

    const timer = setTimeout(() => setOpen(true), DELAY_MS);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(timer);
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    rememberDismissal();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const install = useCallback(async () => {
    const event = deferred.current;
    if (!event) return;
    setInstalling(true);
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      /* Chrome refuses a second call on the same event; nothing to recover. */
    } finally {
      // Spent either way: the event cannot be reused.
      deferred.current = null;
      setInstalling(false);
      setOpen(false);
      rememberDismissal();
    }
  }, []);

  if (!open) return null;

  /* Three states, because only one of them can actually install anything:
       canInstallDirectly  Chrome offered the event, the button is real
       iOS                 no programmatic install exists, so: instructions
       neither             a browser that will not install, or one that has
                           not met the criteria yet. A disabled button here
                           just looks broken, so it becomes a sentence. */
  const ios = isIos();

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="install-prompt-title"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex justify-center px-gutter pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:pb-6"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-4">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container">
          <BrandMark variant="mark" height={22} />
        </span>

        <div className="min-w-0 flex-1">
          <p id="install-prompt-title" className="text-body-md font-bold text-on-surface">
            Get the StrivUp app
          </p>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            Full-screen, a home screen icon, and it works offline.
          </p>

          {canInstallDirectly ? (
            <button
              type="button"
              onClick={install}
              disabled={installing}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-body-md font-bold text-on-primary disabled:opacity-60"
            >
              <Download size={16} aria-hidden="true" />
              {installing ? "Installing…" : "Install"}
            </button>
          ) : ios ? (
            <p className="mt-2 flex items-center gap-1.5 text-body-sm font-medium text-secondary">
              <Share size={15} className="shrink-0" aria-hidden="true" />
              Tap Share, then Add to Home Screen
            </p>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-body-sm font-medium text-secondary">
              <Download size={15} className="shrink-0" aria-hidden="true" />
              Open your browser menu and choose Install app
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Not now"
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
