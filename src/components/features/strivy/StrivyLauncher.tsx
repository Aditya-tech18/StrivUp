"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Sparkle, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  claimCheckinRun,
  clearChat,
  clearCheckInState,
  loadChat,
  markCheckInsSeen,
  newId,
  saveChat,
  unseenCheckIns,
  type CheckInPayload,
  type StrivyChatMessage,
} from "./chat";
import { StrivyCompanionPopup } from "./StrivyCompanionPopup";
import { useStrivyCompanion } from "./useStrivyCompanion";

/**
 * StrivyLauncher — the floating STRIVY button, mounted once in the (app) shell.
 *
 * Phone: sits bottom-right just above the BottomNav. Desktop: bottom-right of
 * the viewport. The chat panel is code-split and only downloaded on first tap,
 * so pages that never open Strivy pay for this button and nothing else.
 *
 * The button is shown only on pages without their own bottom action bar or
 * floating button, so it never covers a Save / Submit bar.
 *
 * The conversation lives here, so it survives closing the panel and moving
 * between pages. It is also kept in this tab's sessionStorage, tagged with the
 * signed-in user's id, so a reload doesn't lose it. It is wiped on sign-out,
 * never restored for a different account, and never written to the database.
 *
 * Phase 3: once per tab per day, the launcher asks /api/strivy/checkin for
 * grounded check-ins (streak at risk, quest ending soon…). New ones show as a
 * dot on the button and are added to the chat when the panel opens. Each is
 * shown once per device.
 *
 * v6: the launcher also hosts STRIVY's companion popups (useStrivyCompanion):
 * short, optional playful lines on moments like dark mode, a completed
 * quest or a while of browsing, with cooldowns and dismissal respected.
 */

const StrivyPanel = dynamic(() => import("./StrivyPanel"), { ssr: false });

/** Matches the panel's closing animation in globals.css (instant with reduced motion). */
const CLOSE_MS = 200;

const EXACT_ROUTES = new Set(["/feed", "/explore", "/search", "/alerts", "/profile", "/quests"]);

function showOn(pathname: string): boolean {
  if (EXACT_ROUTES.has(pathname)) return true;
  // Challenge pages, but not the create form (it has its own action bar).
  if (pathname.startsWith("/challenges/") && pathname !== "/challenges/new") return true;
  // Public profiles.
  if (pathname.startsWith("/u/")) return true;
  return false;
}

export function StrivyLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Keeps the panel mounted while its closing animation plays.
  const [closing, setClosing] = useState(false);
  const [messages, setMessages] = useState<StrivyChatMessage[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInPayload[]>([]);
  const ownerRef = useRef<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const companion = useStrivyCompanion({ pathname, panelOpen: open && !closing });
  const close = useCallback(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setClosing(true);
    window.setTimeout(
      () => {
        setOpen(false);
        setClosing(false);
      },
      reduced ? 0 : CLOSE_MS
    );
  }, []);

  const openPanel = useCallback(() => {
    setOpen(true);
    const owner = ownerRef.current;
    if (!owner || checkIns.length === 0) return;
    setMessages((prev) => [
      ...prev,
      ...checkIns.map((c): StrivyChatMessage => ({
        id: newId(),
        role: "strivy",
        reply: { ...c.reply, chips: [{ label: "Check-in", tone: "neutral" }, ...c.reply.chips] },
      })),
    ]);
    markCheckInsSeen(
      owner,
      checkIns.map((c) => c.key)
    );
    setCheckIns([]);
  }, [checkIns]);

  // Restore this tab's conversation for the signed-in user; wipe it on sign-out
  // or when a different account signs in. getSession() reads the local
  // session only (no network call).
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const id = data.session?.user.id ?? null;
      ownerRef.current = id;
      if (!id) {
        clearChat();
        return;
      }
      const saved = loadChat(id);
      if (saved.length > 0) setMessages((prev) => (prev.length > 0 ? prev : saved));
      if (claimCheckinRun(id)) void fetchCheckIns(id);
    });

    async function fetchCheckIns(id: string) {
      try {
        const res = await fetch("/api/strivy/checkin", { method: "POST" });
        if (!res.ok) return;
        const data = (await res.json()) as { checkIns?: CheckInPayload[] };
        if (!cancelled && ownerRef.current === id) {
          setCheckIns(unseenCheckIns(id, data.checkIns ?? []));
        }
      } catch {
        // Check-ins are optional; the chat works without them.
      }
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user.id ?? null;
      if (event === "SIGNED_OUT" || !id || (ownerRef.current && ownerRef.current !== id)) {
        clearChat();
        clearCheckInState();
        setMessages([]);
        setCheckIns([]);
      }
      ownerRef.current = id;
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (ownerRef.current) saveChat(ownerRef.current, messages);
  }, [messages]);

  // Keyboard users land back on the launcher after closing the panel.
  useEffect(() => {
    if (open) wasOpen.current = true;
    else if (wasOpen.current) buttonRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!showOn(pathname) && !open) return null;

  return (
    <>
      {companion.line && (
        <StrivyCompanionPopup
          line={companion.line}
          panelOpen={open}
          onOpen={() => {
            companion.hide();
            openPanel();
          }}
          onDismiss={companion.dismiss}
        />
      )}
      {!open && (
        <button
          ref={buttonRef}
          type="button"
          onClick={openPanel}
          data-state={checkIns.length > 0 ? "new" : "idle"}
          aria-label={
            checkIns.length > 0
              ? `Open Strivy, ${checkIns.length} new check-in${checkIns.length === 1 ? "" : "s"}`
              : "Open Strivy"
          }
          className="strivy-launcher fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-on-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 [bottom:calc(var(--bottom-nav-h)+1rem)] md:right-6 md:[bottom:1.5rem]"
        >
          <Sparkles
            size={24}
            strokeWidth={2.25}
            aria-hidden="true"
            className="strivy-launcher-icon"
          />
          <Sparkle
            size={10}
            strokeWidth={2.5}
            aria-hidden="true"
            className="strivy-sparkle absolute left-2.5 top-2.5 fill-current"
          />
          {checkIns.length > 0 && (
            <span
              aria-hidden="true"
              className="strivy-unread absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-error"
            />
          )}
        </button>
      )}
      {open && (
        <StrivyPanel
          messages={messages}
          setMessages={setMessages}
          onClose={close}
          closing={closing}
        />
      )}
    </>
  );
}
