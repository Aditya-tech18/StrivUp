"use client";

/**
 * PermissionPrompt — the first-launch sheet asking for notifications and
 * location.
 *
 * Appears once per device, shortly after the app opens, and only for a
 * signed-in person on an app screen. The delay is deliberate: a permission
 * sheet that lands before the page has painted is the thing people dismiss
 * without reading, and a dismissed prompt is harder to recover from than a
 * late one, because the browser remembers a denial.
 *
 * It does not open the Android dialog itself. It cannot: see
 * permissionState.ts. It explains, and its buttons are the gesture that opens
 * the real one.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck } from "lucide-react";
import { markPromptSeen, promptSeen } from "./permissionState";
import { PermissionControls } from "./PermissionControls";

/** Long enough for the first screen to be on screen and understood. */
const DELAY_MS = 2500;

export function PermissionPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (promptSeen()) return;
    const id = window.setTimeout(() => setOpen(true), DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    markPromptSeen();
    setOpen(false);
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perm-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 h-full w-full bg-primary/50 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-md rounded-t-3xl border border-outline-variant bg-surface-container-lowest p-5 pb-safe elev-5 sm:rounded-2xl sm:pb-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10">
            <ShieldCheck size={20} className="text-secondary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p id="perm-title" className="text-body-lg font-bold text-on-surface">
              Two quick permissions
            </p>
            <p className="mt-0.5 text-body-sm leading-relaxed text-on-surface-variant">
              Both are optional, and you can change them any time in Settings.
            </p>
          </div>
        </div>

        <PermissionControls variant="sheet" onDone={close} />
      </div>
    </div>,
    document.body
  );
}
