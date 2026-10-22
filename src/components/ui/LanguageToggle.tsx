"use client";

/**
 * LanguageToggle — English / हिंदी, for the business surfaces.
 *
 * A two-option segmented control rather than a dropdown: there are exactly
 * two languages, so the choice and the current state both fit on screen with
 * no tap to discover them. Rendered as a radiogroup so a screen reader
 * announces it as a choice between two, not as two unrelated buttons.
 */

import { useLocale, type Locale } from "@/lib/i18n/LocaleProvider";
import { Languages } from "lucide-react";

const OPTIONS: { value: Locale; label: string; aria: string }[] = [
  { value: "en", label: "EN", aria: "English" },
  { value: "hi", label: "हिं", aria: "Hindi" },
];

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      role="radiogroup"
      aria-label={t("lang.label")}
      className={`inline-flex items-center gap-0.5 rounded-xl border border-outline-variant bg-surface-container p-0.5 ${className}`}
    >
      <Languages
        size={13}
        className="ml-1.5 mr-0.5 shrink-0 text-on-surface-variant"
        aria-hidden="true"
      />
      {OPTIONS.map((o) => {
        const active = locale === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.aria}
            onClick={() => setLocale(o.value)}
            className={[
              "h-7 min-w-[34px] rounded-lg px-2 text-label-sm font-bold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-secondary",
              active
                ? "bg-secondary text-white"
                : "text-on-surface-variant hover:bg-surface-container-high",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
