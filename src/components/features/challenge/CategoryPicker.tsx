"use client";

import { useId, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { CATEGORY_GROUPS } from "@/lib/challenges/presets";

/**
 * CategoryPicker — grouped chips, plus somewhere to type your own.
 *
 * Replaces a five-option <select>. challenges.category is free text with no
 * CHECK constraint, so a typed category is exactly as valid as a listed one
 * and needs no migration; the list is there to save typing and to keep the
 * common spellings consistent, not to constrain anyone.
 *
 * Chips rather than a dropdown because the whole set is worth seeing: picking
 * a category is also how the form works out what daily proof to ask for, so a
 * creator scanning the options is being shown what the product understands.
 */
export function CategoryPicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (category: string) => void;
  error?: string;
}) {
  const id = useId();
  const isListed = CATEGORY_GROUPS.some((g) => g.items.includes(value));
  // Open the custom field when the current value is something typed.
  const [custom, setCustom] = useState(!isListed && value !== "");
  const [draft, setDraft] = useState(isListed ? "" : value);

  const commitCustom = (next: string) => {
    setDraft(next);
    onChange(next.trim());
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span id={`${id}-label`} className="text-body-md font-medium text-on-surface">
          Category
        </span>
        {value ? (
          <span className="text-label-sm text-on-surface-variant">
            Selected: <span className="font-semibold text-on-surface">{value}</span>
          </span>
        ) : null}
      </div>

      <div role="group" aria-labelledby={`${id}-label`} className="space-y-2.5">
        {CATEGORY_GROUPS.map((group) => (
          <div key={group.group}>
            <p className="mb-1 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant/70">
              {group.group}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((item) => {
                const selected = value === item;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      onChange(item);
                      setCustom(false);
                      setDraft("");
                    }}
                    className={[
                      "rounded-full px-3 py-1.5 text-label-sm font-medium transition-all duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1",
                      selected
                        ? "bg-secondary text-on-secondary elev-brand"
                        : "border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-secondary/50 hover:text-on-surface",
                    ].join(" ")}
                  >
                    {selected ? (
                      <Check size={12} strokeWidth={3} className="mr-1 inline-block" aria-hidden="true" />
                    ) : null}
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {custom ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => commitCustom(e.target.value)}
            maxLength={30}
            placeholder="Name your own category"
            aria-label="Custom category"
            className="h-9 min-w-0 flex-1 rounded-xl border border-secondary bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/20"
          />
          <button
            type="button"
            aria-label="Cancel custom category"
            onClick={() => {
              setCustom(false);
              setDraft("");
              if (!isListed) onChange("");
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCustom(true)}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-outline-variant px-3 py-1.5 text-label-sm font-medium text-on-surface-variant transition-colors hover:border-secondary hover:text-secondary"
        >
          <Plus size={13} aria-hidden="true" />
          Something else
        </button>
      )}

      {error ? (
        <p role="alert" className="text-label-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
