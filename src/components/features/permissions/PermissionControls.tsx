"use client";

/**
 * PermissionControls — the two permission rows, used in two places.
 *
 * `variant="sheet"` is the first-launch explainer; `variant="settings"` is the
 * same two rows inside Settings, where they can be changed later. One
 * component so the wording and the behaviour cannot drift apart between them.
 *
 * Each Allow button is the user gesture the browser requires before it will
 * open the real system dialog. See permissionState.ts for why that cannot
 * happen automatically on launch.
 */

import { useCallback, useEffect, useState } from "react";
import { Bell, Check, Loader2, MapPin, X } from "lucide-react";
import { enablePush } from "@/components/features/strivy/push";
import { getCurrentPosition, clearCachedFix } from "@/lib/location/geo";
import {
  isInstalledApp,
  locationEnabled,
  locationState,
  notificationState,
  setLocationEnabled,
  type PermissionState,
} from "./permissionState";

type Busy = "none" | "notifications" | "location";

export function PermissionControls({
  variant,
  onDone,
}: {
  variant: "sheet" | "settings";
  onDone?: () => void;
}) {
  const [notif, setNotif] = useState<PermissionState>("prompt");
  const [loc, setLoc] = useState<PermissionState>("prompt");
  const [locOn, setLocOn] = useState(true);
  const [busy, setBusy] = useState<Busy>("none");
  const [note, setNote] = useState<string | null>(null);
  /* Browser tab or installed app. Decides whether the system dialog someone
     is about to see belongs to StrivUp or to Chrome. */
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const l = await locationState();
      if (cancelled) return;
      setNotif(notificationState());
      setLoc(l);
      setLocOn(locationEnabled());
      setInstalled(isInstalledApp());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const askNotifications = useCallback(async () => {
    setBusy("notifications");
    setNote(null);
    const result = await enablePush();
    setNotif(notificationState());
    setBusy("none");
    if (result === "denied") {
      setNote("Notifications are blocked for StrivUp. Turn them back on in your browser or Android app settings.");
    } else if (result === "not-configured") {
      /* The server has no VAPID key. Nothing the person can do, and nothing
         about their browser: say so plainly rather than blaming the device. */
      setNote("Push notifications are not switched on for StrivUp yet. Nothing wrong with your phone \u2014 we are still setting this up.");
    } else if (result === "unsupported") {
      setNote("This browser cannot do push notifications. Install StrivUp from the Play Store, or open it in Chrome.");
    } else if (result === "server-error") {
      setNote("Could not register this device. Try again in a moment.");
    }
  }, []);

  const askLocation = useCallback(async () => {
    setBusy("location");
    setNote(null);
    try {
      await getCurrentPosition();
      setLocationEnabled(true);
      setLocOn(true);
      setLoc("granted");
    } catch {
      setLoc(await locationState());
      setNote("Location is blocked for StrivUp. Turn it back on in your browser or Android app settings.");
    } finally {
      setBusy("none");
    }
  }, []);

  const turnLocationOff = useCallback(() => {
    /* No browser lets a page revoke a permission, so this does the part we
       genuinely control: stop asking for a fix, and forget the one we had. */
    setLocationEnabled(false);
    clearCachedFix();
    setLocOn(false);
    setNote("StrivUp will stop using your location. To revoke the browser permission itself, use your browser or Android app settings.");
  }, []);

  const rows = [
    {
      id: "notifications" as const,
      icon: Bell,
      title: "Notifications",
      body: "Streak reminders, proof results, and replies to your posts.",
      state: notif,
      on: notif === "granted",
      onAllow: askNotifications,
      onDisable: undefined,
    },
    {
      id: "location" as const,
      icon: MapPin,
      title: "Location",
      body: "Finds quests near you. Used only while you are looking at Near Me.",
      state: loc,
      on: loc === "granted" && locOn,
      onAllow: askLocation,
      onDisable: turnLocationOff,
    },
  ];

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const Icon = row.icon;
        const working = busy === row.id;
        return (
          <div
            key={row.id}
            className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10">
              <Icon size={18} className="text-secondary" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-body-md font-bold text-on-surface">{row.title}</p>
              <p className="mt-0.5 text-body-sm leading-relaxed text-on-surface-variant">
                {row.body}
              </p>
            </div>

            {row.state === "unsupported" ? (
              <span className="shrink-0 text-label-md text-on-surface-variant">
                Not available
              </span>
            ) : row.on ? (
              <button
                type="button"
                onClick={row.onDisable}
                disabled={!row.onDisable}
                className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-3 py-1.5 text-label-md font-bold text-success disabled:cursor-default"
              >
                <Check size={13} aria-hidden="true" />
                On
              </button>
            ) : row.state === "denied" ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-error/10 px-3 py-1.5 text-label-md font-bold text-error">
                <X size={13} aria-hidden="true" />
                Blocked
              </span>
            ) : (
              <button
                type="button"
                onClick={row.onAllow}
                disabled={working}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-4 py-1.5 text-label-md font-bold text-white disabled:opacity-60"
              >
                {working ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
                Allow
              </button>
            )}
          </div>
        );
      })}

      {/* Said once, and only when it is true and still actionable: in a
          browser tab the prompt and any notification belong to Chrome, not to
          StrivUp. */}
      {!installed && notif !== "granted" && (
        <p className="rounded-xl border border-outline-variant bg-surface-container-low px-3.5 py-3 text-body-sm leading-relaxed text-on-surface-variant">
          You are in a browser tab. Install StrivUp from the Play Store and
          notifications will come from StrivUp itself, with the normal Android
          permission prompt.
        </p>
      )}

      {note && (
        <p className="rounded-xl border border-outline-variant bg-surface-container-low px-3.5 py-3 text-body-sm leading-relaxed text-on-surface-variant">
          {note}
        </p>
      )}

      {variant === "sheet" && (
        <button
          type="button"
          onClick={onDone}
          className="h-11 w-full rounded-xl border border-outline-variant text-body-md font-bold text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          Not now
        </button>
      )}
    </div>
  );
}
