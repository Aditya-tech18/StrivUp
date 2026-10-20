"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellOff, CheckCircle2, CircleAlert, CircleDashed, RotateCcw } from "lucide-react";
import { safeHref } from "./chat";
import { relativeTime } from "./richtext";
import {
  BLOCKED_HELP,
  currentSubscription,
  diagnosePush,
  permissionState,
  devToolsVisible,
  disablePush,
  enablePush,
  lastSeenAt,
  loadPushHistory,
  loadPushPrefs,
  markNotificationsSeen,
  previewNextPush,
  pushIcon,
  rememberPushAnswer,
  sendTestPush,
  setNudges,
  setPushLanguage,
  type PushHistoryItem,
  type PushLanguage,
  type SetupStep,
} from "./push";

/**
 * The list of this user's recent STRIVY notifications: loading, error and
 * empty states, an unread dot on anything newer than the last visit, and a
 * relative timestamp. Opening it marks everything seen.
 */
export function StrivyNotificationList({ onNavigate }: { onNavigate?: () => void }) {
  const [items, setItems] = useState<PushHistoryItem[] | null | "loading">("loading");
  const [seen] = useState(lastSeenAt);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadPushHistory().then((list) => {
      if (cancelled) return;
      setItems(list);
      if (list) markNotificationsSeen();
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const since = seen ? Date.parse(seen) : 0;
  return (
    <section aria-label="Recent STRIVY notifications" className="flex flex-col gap-2">
      <p className="text-[12px] font-bold uppercase tracking-wide text-on-surface-variant">
        Recent 🔔
      </p>
      {items === "loading" ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading notifications">
          {[0, 1].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-surface-container" />
          ))}
        </div>
      ) : items === null ? (
        <div className="flex items-center gap-2 rounded-xl border border-outline-variant px-3 py-2.5 text-[13px] text-on-surface-variant">
          <CircleAlert size={16} aria-hidden="true" className="shrink-0" />
          <span className="flex-1">Couldn&apos;t load notifications right now.</span>
          <button
            type="button"
            onClick={() => {
              setItems("loading");
              setAttempt((n) => n + 1);
            }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-secondary hover:bg-secondary/5"
          >
            <RotateCcw size={13} aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-outline-variant px-3 py-3 text-[13px] leading-5 text-on-surface-variant">
          <BellOff size={16} aria-hidden="true" className="shrink-0" />
          <span>
            No STRIVY notifications yet. When something&apos;s worth a nudge, it shows up here.
          </span>
        </div>
      ) : (
        <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {items.map((item) => {
            const unread = Date.parse(item.sentAt) > since;
            const href = safeHref(item.url) ?? "/feed";
            return (
              <li key={item.id}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${unread ? "bg-secondary/5" : ""}`}
                >
                  <span aria-hidden="true" className="text-[16px] leading-5">
                    {pushIcon(item.type)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-5 text-on-surface">{item.body}</span>
                    <span className="text-[11px] text-on-surface-variant">
                      {relativeTime(item.sentAt)}
                    </span>
                  </span>
                  {unread && (
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary"
                      aria-label="New"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StepIcon({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return (
      <CircleDashed
        size={14}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-on-surface-variant"
      />
    );
  return ok ? (
    <CheckCircle2 size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-tertiary" />
  ) : (
    <CircleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-error" />
  );
}

const LANGUAGES: { value: PushLanguage | "auto"; label: string }[] = [
  { value: "auto", label: "Auto (matches your chat)" },
  { value: "en", label: "English" },
  { value: "hinglish", label: "Hinglish" },
  { value: "hi", label: "हिंदी" },
  { value: "bho", label: "भोजपुरी" },
];

function Switch({
  on,
  label,
  disabled,
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={[
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
        on ? "bg-secondary" : "bg-outline-variant",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "absolute left-0 top-0.5 h-5 w-5 rounded-full bg-surface-container-lowest shadow transition-transform",
          on ? "translate-x-[22px]" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

/**
 * StrivyPushSettings — the strip under the panel header for STRIVY push:
 *  - push notifications on/off for this device (browser subscription);
 *  - daily STRIVY nudges on/off for the account (the automatic engine);
 *  - the language nudges are written in;
 *  - a clearly labelled development-only test button when
 *    NEXT_PUBLIC_STRIVY_PUSH_DEV_TOOLS=true.
 */
export function StrivyPushSettings({ onNavigate }: { onNavigate?: () => void } = {}) {
  const [push, setPush] = useState<boolean | null>(null);
  const [steps, setSteps] = useState<SetupStep[] | null>(null);
  const [nudges, setNudgesState] = useState<boolean | null>(null);
  const [language, setLanguage] = useState<PushLanguage | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void currentSubscription()
      .then((sub) => {
        if (!cancelled) setPush(Boolean(sub) && Notification.permission === "granted");
      })
      .catch(() => !cancelled && setPush(false));
    void loadPushPrefs().then((prefs) => {
      if (cancelled) return;
      setNudgesState(prefs ? prefs.nudges : null);
      if (prefs) setLanguage(prefs.language ?? "auto");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await task();
    } catch {
      setNote("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  function togglePush() {
    void run(async () => {
      if (push) {
        const ok = await disablePush();
        setPush(false);
        if (!ok) setNote("Turned off here, but the server didn't confirm. Try again later.");
        return;
      }
      const result = await enablePush();
      setPush(result === "enabled");
      if (result === "denied") setNote(BLOCKED_HELP);
      if (result === "unsupported") setNote("This browser doesn't support push notifications.");
      if (result === "server-error") setNote("Push isn't available right now. Try again later 🔔");
      if (result === "enabled" && nudges === null) {
        const prefs = await loadPushPrefs();
        setNudgesState(prefs ? prefs.nudges : null);
      }
    });
  }

  function toggleNudges() {
    void run(async () => {
      const next = !nudges;
      if (await setNudges(next)) setNudgesState(next);
      else setNote("Couldn't save that on the server. Try again in a moment.");
    });
  }

  function changeLanguage(value: PushLanguage | "auto") {
    void run(async () => {
      if (await setPushLanguage(value)) setLanguage(value);
      else setNote("Couldn't save that on the server. Try again in a moment.");
    });
  }

  function test() {
    void run(async () => {
      const result = await sendTestPush();
      // Dev tools only: the category and fix help; normal users never see this button.
      setNote(result.detail ? `${result.text}\n${result.detail}` : result.text);
    });
  }

  function diagnose() {
    void run(async () => setSteps(await diagnosePush()));
  }

  function preview() {
    void run(async () => setNote(await previewNextPush()));
  }

  const pushOn = push === true;
  const blocked = !pushOn && permissionState() === "denied";
  return (
    <div className="flex max-h-[60%] flex-col gap-3 overflow-y-auto border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
      {pushOn && <StrivyNotificationList onNavigate={onNavigate} />}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-on-surface">Push notifications</p>
          <p className="text-[12px] leading-4 text-on-surface-variant">
            {blocked ? "Blocked in this browser's settings." : "On this device."}
          </p>
        </div>
        <Switch
          on={pushOn}
          label="Push notifications on this device"
          disabled={busy || push === null}
          onToggle={togglePush}
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-on-surface">Daily STRIVY nudges</p>
          <p className="text-[12px] leading-4 text-on-surface-variant">
            Up to 3 a day, only when there&apos;s something worth saying.
          </p>
        </div>
        <Switch
          on={pushOn && nudges === true}
          label="Daily STRIVY nudges"
          disabled={busy || !pushOn || nudges === null}
          onToggle={toggleNudges}
        />
      </div>

      <label className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[14px] font-semibold text-on-surface">
          Nudge language
        </span>
        <select
          value={language}
          disabled={busy || !pushOn || nudges === null}
          onChange={(e) => changeLanguage(e.target.value as PushLanguage | "auto")}
          className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-[13px] text-on-surface disabled:opacity-50"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      {devToolsVisible() && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={test}
            disabled={busy || !pushOn}
            className="rounded-full border border-dashed border-outline-variant px-3 py-1 text-[12px] font-semibold text-on-surface-variant transition-colors hover:border-secondary hover:text-secondary disabled:opacity-40"
          >
            Send test STRIVY notification (dev only)
          </button>
          <button
            type="button"
            onClick={preview}
            disabled={busy || !pushOn}
            className="rounded-full border border-dashed border-outline-variant px-3 py-1 text-[12px] font-semibold text-on-surface-variant transition-colors hover:border-secondary hover:text-secondary disabled:opacity-40"
          >
            Preview next nudge (dev only)
          </button>
          <button
            type="button"
            onClick={diagnose}
            disabled={busy}
            className="rounded-full border border-dashed border-outline-variant px-3 py-1 text-[12px] font-semibold text-on-surface-variant transition-colors hover:border-secondary hover:text-secondary disabled:opacity-40"
          >
            Check push setup (dev only)
          </button>
        </div>
      )}
      {devToolsVisible() && steps && (
        <ol
          aria-label="Push setup checks"
          className="flex flex-col gap-1 rounded-xl bg-surface-container-low px-3 py-2"
        >
          {steps.map((step) => (
            <li
              key={step.label}
              className="flex items-start gap-2 text-[12px] leading-4 text-on-surface"
            >
              <StepIcon ok={step.ok} />
              <span className="min-w-0">
                {step.label}
                {step.fix && !step.ok && (
                  <span className="block text-on-surface-variant">{step.fix}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {blocked && !note && (
        <p className="text-[12px] leading-4 text-on-surface-variant">{BLOCKED_HELP}</p>
      )}
      {note && (
        <p
          role="status"
          className="whitespace-pre-wrap break-words text-[12px] text-on-surface-variant"
        >
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * StrivyPushPrompt — a one-time card in the chat, shown only after STRIVY has
 * answered something, asking whether to turn on nudges. The browser's own
 * permission prompt appears only after "Enable notifications" is tapped, and
 * "Not now" is remembered so the card doesn't come back.
 */
export function StrivyPushPrompt({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function enable() {
    setBusy(true);
    try {
      const result = await enablePush();
      if (result === "enabled") {
        rememberPushAnswer("enabled");
        setNote("Done 🔔 I'll only ping you when it matters, 3 a day at most.");
        window.setTimeout(onDone, 2500);
      } else if (result === "denied") {
        rememberPushAnswer("not-now");
        setNote(BLOCKED_HELP);
      } else {
        setNote("Push isn't available here yet. You can try again from the bell later.");
      }
    } catch {
      setNote("Something went sideways 😅 Try again from the bell later.");
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    rememberPushAnswer("not-now");
    onDone();
  }

  return (
    <div className="strivy-msg flex items-end gap-2">
      <span aria-hidden="true" className="w-7 shrink-0" />
      <div
        role="group"
        aria-label="Turn on STRIVY notifications"
        className="flex max-w-[85%] flex-col gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest px-3.5 py-3"
      >
        <p className="text-body-md font-semibold text-on-surface">
          Want STRIVY to keep you accountable? 🔔
        </p>
        {note ? (
          <p role="status" className="text-[13px] leading-5 text-on-surface-variant">
            {note}
          </p>
        ) : (
          <>
            <p className="text-[13px] leading-5 text-on-surface-variant">
              Up to 3 nudges a day, only when there&apos;s something real to say.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void enable()}
                disabled={busy}
                className="rounded-full bg-secondary px-3.5 py-1.5 text-[13px] font-semibold text-on-secondary transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
              >
                Enable notifications
              </button>
              <button
                type="button"
                onClick={notNow}
                disabled={busy}
                className="rounded-full border border-outline-variant px-3.5 py-1.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
