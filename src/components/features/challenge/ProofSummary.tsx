"use client";

import { useState } from "react";
import { Camera, Sparkles } from "lucide-react";
import { PROOF_OPTIONS, type InferredProof } from "@/lib/challenges/presets";

/**
 * ProofSummary — what participants will be asked for each day.
 *
 * NOT A PICKER. The form used to offer the same four options to every
 * challenge — Running GPS, Gym Selfie, Coding Screenshot, Page Reading — so a
 * running challenge could be set to demand a coding screenshot. Nothing
 * stopped it, and a participant who cannot produce the proof their challenge
 * asks for just stops posting. The proof is now read off the challenge itself.
 *
 * ON THE OVERRIDE. The brief was that the creator should not be able to
 * choose, and the visible design honours that: this reads as a statement, not
 * a question, and the full list is not on screen. But inference from free text
 * is occasionally going to be wrong — "Morning Pages" is writing, not reading
 * — and with no way to correct it a wrong guess would be permanent and the
 * challenge unusable. So there is one quiet link, closed by default. A creator
 * who does not go looking never sees a list to get wrong, which was the point.
 */
export function ProofSummary({
  inferred,
  overrideId,
  onOverride,
  onClearOverride,
}: {
  inferred: InferredProof;
  /** Set only when the creator has deliberately changed it. */
  overrideId: string | null;
  onOverride: (id: string) => void;
  onClearOverride: () => void;
}) {
  const [open, setOpen] = useState(false);
  const active = overrideId
    ? PROOF_OPTIONS.find((o) => o.id === overrideId) ?? inferred
    : inferred;

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/10">
          <Camera size={18} className="text-secondary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-body-md font-semibold text-on-surface">Daily proof</p>
            {!overrideId && inferred.matched ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-label-sm font-semibold text-secondary">
                <Sparkles size={10} aria-hidden="true" />
                Set from your challenge
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-body-md text-on-surface-variant">{active.instruction}</p>

          <p className="mt-2 text-label-sm text-on-surface-variant/80">
            Everyone who joins is asked for this, every day. You cannot ask for
            something you would not post yourself.
          </p>

          {open ? (
            <div className="mt-3 space-y-2">
              <p className="text-label-sm font-semibold text-on-surface">
                Pick a different kind of proof
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PROOF_OPTIONS.map((option) => {
                  const selected = option.id === active.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        onOverride(option.id);
                        setOpen(false);
                      }}
                      className={[
                        "rounded-full px-2.5 py-1 text-label-sm font-medium transition-colors",
                        selected
                          ? "bg-secondary text-on-secondary"
                          : "border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:text-on-surface",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  onClearOverride();
                  setOpen(false);
                }}
                className="text-label-sm text-secondary transition-colors hover:underline"
              >
                Go back to the automatic choice
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-2 text-label-sm text-on-surface-variant underline decoration-outline-variant underline-offset-2 transition-colors hover:text-secondary hover:decoration-secondary"
            >
              {overrideId ? "Change it" : "Not right for this challenge?"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
