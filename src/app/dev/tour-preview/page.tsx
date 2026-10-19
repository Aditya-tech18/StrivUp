"use client";

/**
 * /dev/tour-preview — dev-only harness for the product tour.
 *
 * The real tour runs in the authenticated shell and navigates between a dozen
 * routes, so it cannot be exercised without signing in. This mounts the same
 * Tour component over a stand-in nav carrying the same data-tour anchors, with
 * routing disabled, so the spotlight, placement, keyboard handling and copy
 * can all be checked.
 *
 * The step list is the real one — only the `route` fields are stripped, so a
 * step that loses its copy or its anchor shows up here.
 */

import { useState } from "react";
import { notFound } from "next/navigation";
import { Tour } from "@/components/ui/Tour";
import { TOUR_STEPS } from "@/lib/tour/steps";

/** The real steps, minus navigation, so the harness stays on one page. */
const STEPS = TOUR_STEPS.map((step) => {
  const copy = { ...step };
  delete copy.route;
  return copy;
});

const ANCHORS = [
  ["nav-feed", "Home"],
  ["nav-explore", "Explore"],
  ["nav-search", "Search"],
  ["nav-quests", "Quests"],
  ["nav-create", "Create"],
  ["nav-my-challenges", "My Challenges"],
  ["nav-alerts", "Alerts"],
  ["nav-profile", "Profile"],
];

export default function TourPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  /* Checked on demand, not during render: a render-time querySelector runs
     before this page's own anchors are in the DOM and reports every step as
     unresolved. */
  const [missing, setMissing] = useState<string[] | null>(null);

  const checkAnchors = () =>
    setMissing(
      STEPS.filter((s) => s.target && !document.querySelector(s.target)).map((s) => s.id)
    );

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="mx-auto flex max-w-4xl gap-8">
        {/* Stand-in rail carrying the real anchors. */}
        <nav className="flex w-48 shrink-0 flex-col gap-1" aria-label="Stand-in navigation">
          {ANCHORS.map(([id, label]) => (
            <span
              key={id}
              data-tour={id}
              className="rounded-lg px-3 py-2.5 text-body-md text-on-surface-variant ring-1 ring-outline-variant"
            >
              {label}
            </span>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          <h1 className="text-headline-lg text-on-surface">Product tour</h1>
          <button
            type="button"
            onClick={() => {
              setIndex(0);
              setOpen(true);
            }}
            className="rounded-xl bg-secondary px-4 py-2.5 text-body-md font-semibold text-on-secondary"
          >
            Start tour
          </button>

          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <h2 className="mb-2 text-body-lg font-bold text-on-surface">Step inventory</h2>
            <p className="mb-3 text-label-sm text-on-surface-variant" data-testid="step-count">
              {STEPS.length} steps · {STEPS.filter((s) => s.target).length} anchored ·{" "}
              {STEPS.filter((s) => !s.target).length} centred
            </p>
            <ol className="space-y-1 text-label-sm" data-testid="step-list">
              {STEPS.map((s, i) => (
                <li key={s.id} className="text-on-surface-variant">
                  <span className="text-on-surface">
                    {i + 1}. {s.chapter ? `[${s.chapter}] ` : ""}
                    {s.title}
                  </span>
                  {s.target ? ` → ${s.target}` : " → centred"}
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={checkAnchors}
              className="mt-3 rounded-lg border border-outline-variant px-3 py-1.5 text-label-md font-semibold text-on-surface"
            >
              Check anchors
            </button>
            <p className="mt-2 text-label-sm" data-testid="missing-anchors">
              {missing === null ? (
                <span className="text-on-surface-variant">Not checked yet.</span>
              ) : missing.length === 0 ? (
                <span className="text-success">Every anchored step resolves here.</span>
              ) : (
                <span className="text-error">Unresolved: {missing.join(", ")}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <Tour
        steps={STEPS}
        open={open}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setOpen(false)}
        onFinish={() => setOpen(false)}
      />
    </div>
  );
}
