"use client";

/**
 * src/lib/i18n/LocaleProvider.tsx
 *
 * The business side's language. English by default, Hindi on request, the
 * choice remembered per device.
 *
 * Scoped deliberately: the provider is mounted by the business layout, not
 * the root one, so it only costs the business routes anything and the user
 * side is untouched.
 *
 * The stored choice is read after mount rather than in the useState
 * initializer. Reading localStorage during render makes the server and the
 * client disagree and React throws out the server HTML; and the business
 * pages hold a spinner until the profile loads, so nothing translated is on
 * screen during that first frame anyway. The read is deferred by a timeout
 * for the same reason ThemeToggle defers its own: setting state straight
 * from an effect body is the cascading-render pattern the React Compiler
 * lint rejects.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import { EN, HI, type StringKey } from "./businessStrings";

export type Locale = "en" | "hi";

export const LOCALE_KEY = "strivup:businessLocale";

function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "hi";
}

export function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(LOCALE_KEY);
    return isLocale(raw) ? raw : "en";
  } catch {
    return "en"; // private mode, or site data blocked
  }
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  /** Translate. Falls back to English when Hindi has no string for the key. */
  t: (key: StringKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const id = setTimeout(() => setLocaleState(readStoredLocale()), 0);
    return () => clearTimeout(id);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try { localStorage.setItem(LOCALE_KEY, next); } catch { /* nothing to persist to */ }
  }, []);

  const t = useCallback(
    (key: StringKey) => (locale === "hi" ? HI[key] ?? EN[key] : EN[key]),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Translation for the current surface.
 *
 * Outside a provider it returns English rather than throwing, so a business
 * component reused on a user-side page degrades to English instead of
 * crashing the page.
 */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx;
  return {
    locale: "en",
    setLocale: () => {},
    t: (key: StringKey) => EN[key],
  };
}
