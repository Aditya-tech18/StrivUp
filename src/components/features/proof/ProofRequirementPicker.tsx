"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui";
import { pickableCategories, type ProofCategoryId } from "@/lib/proof/categories";

/**
 * ProofRequirementPicker — "what will people be doing, and what should they
 * upload to prove it?"
 *
 * Shown when a creator adds a task. They pick the kind of activity; the
 * requirements come straight from the catalog for a known one, or from the
 * model for "Something else". Either way the creator can edit every line
 * before saving, because they know their own quest better than any default.
 *
 * Those same lines are shown to the participant before they upload and are
 * what the reviewer judges against — so editing them here changes what is
 * actually accepted, not just the copy.
 */

export interface ProofRequirementDraft {
  activity_category: ProofCategoryId;
  custom_activity: string | null;
  activity_label: string;
  required_elements: string[];
  optional_elements: string[];
  reject_if: string[];
  participant_hint: string;
  generated_by: "template" | "ai" | "creator";
}

export function ProofRequirementPicker({
  value,
  onChange,
  taskTitle,
  taskDescription,
}: {
  value: ProofRequirementDraft | null;
  onChange: (next: ProofRequirementDraft | null) => void;
  taskTitle?: string;
  taskDescription?: string;
}) {
  const [customText, setCustomText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const categories = pickableCategories();
  const selected = value?.activity_category ?? null;

  async function choose(categoryId: ProofCategoryId, text?: string) {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/proof/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: categoryId,
          customText: text,
          taskTitle,
          taskDescription,
        }),
      });
      const body = (await res.json()) as ProofRequirementDraft & {
        error?: string;
        note?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Could not load requirements");
      onChange({
        activity_category: body.activity_category,
        custom_activity: body.custom_activity,
        activity_label: body.activity_label,
        required_elements: body.required_elements,
        optional_elements: body.optional_elements,
        reject_if: body.reject_if,
        participant_hint: body.participant_hint,
        generated_by: body.generated_by,
      });
      if (body.note) setNote(body.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  /** Any manual edit makes this the creator's spec, not a generated one. */
  function editList(key: "required_elements" | "optional_elements" | "reject_if", next: string[]) {
    if (!value) return;
    onChange({ ...value, [key]: next, generated_by: "creator" });
  }

  return (
    <div className="mt-3 rounded-lg border border-purple-100 bg-purple-50/40 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-900">
        Proof &amp; verification
      </p>
      <p className="mb-3 text-[11px] leading-relaxed text-gray-600">
        What will people be doing? We&apos;ll tell them exactly what to upload, and reject
        anything that doesn&apos;t show it.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => {
          const isSelected = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              disabled={loading}
              onClick={() => {
                if (c.id === "other") {
                  onChange(null);
                  setCustomText("");
                  return;
                }
                void choose(c.id);
              }}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                isSelected
                  ? "border-purple-500 bg-purple-600 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-purple-300"
              }`}
            >
              <span aria-hidden>{c.icon}</span>
              {c.label}
              {isSelected && <Check className="h-3 w-3" />}
            </button>
          );
        })}
      </div>

      {/* "Something else" — describe it and the model writes the spec. */}
      {selected !== "other" && value === null && (
        <div className="mt-2.5 flex gap-2">
          <input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Not listed? Describe it — e.g. 'learn 10 new words'"
            maxLength={200}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && customText.trim().length >= 3) {
                e.preventDefault();
                void choose("other", customText.trim());
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={loading || customText.trim().length < 3}
            onClick={() => void choose("other", customText.trim())}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Suggest
          </Button>
        </div>
      )}

      {loading && !value && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Working out what proof fits…
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {note && <p className="mt-2 text-[11px] text-amber-700">{note}</p>}

      {value && (
        <div className="mt-3 space-y-3 rounded-lg bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-gray-900">
              {value.activity_label}
              {value.generated_by === "ai" && (
                <span className="ml-1.5 rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                  AI suggested
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[11px] text-gray-400 hover:text-gray-600"
            >
              Change
            </button>
          </div>

          <EditableList
            label="Must show (proof is rejected without these)"
            tone="required"
            items={value.required_elements}
            onChange={(next) => editList("required_elements", next)}
          />
          <EditableList
            label="Nice to have"
            tone="optional"
            items={value.optional_elements}
            onChange={(next) => editList("optional_elements", next)}
          />
          <EditableList
            label="Reject if it's only this"
            tone="reject"
            items={value.reject_if}
            onChange={(next) => editList("reject_if", next)}
          />

          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-600">
              What participants will be told
            </label>
            <textarea
              value={value.participant_hint}
              onChange={(e) =>
                onChange({ ...value, participant_hint: e.target.value, generated_by: "creator" })
              }
              rows={2}
              maxLength={300}
              className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EditableList({
  label,
  items,
  onChange,
  tone,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  tone: "required" | "optional" | "reject";
}) {
  const [draft, setDraft] = useState("");

  const dot =
    tone === "required" ? "bg-red-500" : tone === "optional" ? "bg-gray-300" : "bg-amber-500";

  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-gray-600">{label}</label>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={`${item}-${i}`} className="flex items-start gap-1.5 text-xs text-gray-700">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span className="flex-1">{item}</span>
            <button
              type="button"
              aria-label={`Remove "${item}"`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-gray-300 hover:text-red-500"
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-[11px] italic text-gray-400">None</li>}
      </ul>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            onChange([...items, draft.trim()]);
            setDraft("");
          }
        }}
        placeholder="Add one and press Enter"
        maxLength={200}
        className="mt-1.5 w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px]"
      />
    </div>
  );
}
