"use client";

/**
 * /dev/challenge-form-preview — dev-only harness for the create-challenge
 * pieces, which otherwise only render behind auth.
 *
 * The table at the bottom is the one that matters: it runs the proof rules
 * against realistic challenge titles so a wrong match is visible at a glance
 * rather than discovered by a participant who cannot produce the proof.
 */

import { useState } from "react";
import { CoverPicker } from "@/components/features/challenge/CoverPicker";
import { CategoryPicker } from "@/components/features/challenge/CategoryPicker";
import { ProofSummary } from "@/components/features/challenge/ProofSummary";
import { inferProof, type CoverPreset } from "@/lib/challenges/presets";

const SAMPLES: [string, string][] = [
  ["100 Days of LeetCode", "Coding"],
  ["30 Day Running Streak", "Running"],
  ["Gym every morning", "Gym"],
  ["Read 20 pages a day", "Reading"],
  ["Morning Pages journal", "Writing"],
  ["Swim 1km daily", "Swimming"],
  ["10k steps a day", "Steps"],
  ["Meditate 10 minutes", "Mindfulness"],
  ["GATE 2027 prep", "Study"],
  ["Learn Spanish daily", "Language"],
  ["Guitar practice", "Music"],
  ["Daily sketch", "Art"],
  ["Drink 3L water", "Nutrition"],
  ["Sleep before 11pm", "Sleep"],
  ["Save ₹100 a day", "Finance"],
  ["Be a better person", ""],
];

export default function ChallengeFormPreviewPage() {
  const [cover, setCover] = useState<CoverPreset | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("30 Day Running Streak");
  const [override, setOverride] = useState<string | null>(null);

  const inferred = inferProof(title, "", category);

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <h1 className="text-headline-lg text-on-surface">Create-challenge pieces</h1>

        <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <CoverPicker
            presetId={cover?.id ?? null}
            uploadedUrl={uploaded}
            onSelectPreset={(p) => {
              setCover(p);
              setUploaded(null);
            }}
            onUpload={(f) => {
              setCover(null);
              setUploaded(URL.createObjectURL(f));
            }}
          />
        </section>

        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <CategoryPicker value={category} onChange={setCategory} />
        </section>

        <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Challenge title"
            aria-label="Challenge title"
            className="h-10 w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/20"
          />
          <ProofSummary
            inferred={inferred}
            overrideId={override}
            onOverride={setOverride}
            onClearOverride={() => setOverride(null)}
          />
        </section>

        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <h2 className="mb-3 text-body-lg font-bold text-on-surface">Inference check</h2>
          <table className="w-full text-left text-label-sm">
            <thead>
              <tr className="text-on-surface-variant">
                <th className="pb-2">Title</th>
                <th className="pb-2">Matched</th>
                <th className="pb-2">Asks for</th>
              </tr>
            </thead>
            <tbody data-testid="inference-table">
              {SAMPLES.map(([t, c]) => {
                const r = inferProof(t, "", c);
                return (
                  <tr key={t} className="border-t border-outline-variant">
                    <td className="py-1.5 pr-3 text-on-surface">{t}</td>
                    <td className="py-1.5 pr-3">
                      <span className={r.matched ? "text-success" : "text-warning"}>
                        {r.matched ? r.id : "fallback"}
                      </span>
                    </td>
                    <td className="py-1.5 text-on-surface-variant">{r.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
