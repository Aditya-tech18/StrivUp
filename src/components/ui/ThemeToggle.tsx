"use client";

/**
 * ThemeToggle — the Light / Dark control, and the one place that writes the
 * theme.
 *
 * The attribute on <html> is the single source of truth; CSS does the rest.
 * localStorage holds the choice so it survives a reload, and the inline
 * script in app/layout.tsx replays it before the first paint, which is what
 * stops a dark-mode user being flashed a white screen on every navigation.
 *
 * System preference is read only as the initial default for someone who has
 * never chosen. Once they choose, their choice wins and stays won.
 */

import { useEffect, useState } from "react";
import { Check, Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";
export const THEME_KEY = "strivup:theme";

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode. The attribute is already set, so this session is correct;
    // only persistence is lost.
  }
}

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

const OPTIONS: { value: Theme; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", hint: "Default", icon: Sun },
  { value: "dark", label: "Dark", hint: "Easier at night", icon: Moon },
];

export function ThemeToggle() {
  /* Starts from whatever the pre-paint script already put on <html>, so the
     control never contradicts the page it is sitting on. Read after mount
     because the server has no document. */
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const id = window.setTimeout(() => setTheme(readTheme()), 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div role="radiogroup" aria-label="Theme" className="flex flex-col gap-2">
      {OPTIONS.map(({ value, label, hint, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              applyTheme(value);
              setTheme(value);
            }}
            className={[
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
              active
                ? "border-secondary bg-secondary/10"
                : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                active ? "bg-secondary/15 text-secondary" : "bg-surface-container text-on-surface-variant",
              ].join(" ")}
            >
              <Icon size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body-md font-semibold text-on-surface">{label}</span>
              <span className="block text-body-sm text-on-surface-variant">{hint}</span>
            </span>
            {active && <Check size={17} className="shrink-0 text-secondary" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
