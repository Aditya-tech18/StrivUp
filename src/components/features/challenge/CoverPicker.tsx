"use client";

import { useEffect, useRef } from "react";
import { Check, CloudUpload, ImagePlus } from "lucide-react";
import { COVER_PRESETS, paintCover, type CoverPreset } from "@/lib/challenges/presets";

/**
 * CoverPicker — pick a ready-made cover, or upload your own.
 *
 * The form previously offered upload only, so a creator without a suitable
 * photo to hand either shipped a challenge with no cover or abandoned the
 * form. The presets mean there is always a decent answer one tap away, and
 * uploading stays exactly as prominent for anyone who has their own art.
 *
 * Each preset is painted on a canvas rather than loaded as a file: nothing to
 * host, it scales to any size, and on submit the same paint is exported as a
 * PNG and uploaded like a photo — so thumbnail_url stays an ordinary URL and
 * nothing downstream has to know a preset was involved.
 */

function PresetTile({
  preset,
  selected,
  onSelect,
}: {
  preset: CoverPreset;
  selected: boolean;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Drawn at 2x the display box so it stays crisp on a retina screen.
    const w = (canvas.width = 240);
    const h = (canvas.height = 135);
    paintCover(ctx, preset, w, h);
  }, [preset]);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Use the ${preset.label} cover`}
      className={[
        "group relative aspect-video overflow-hidden rounded-xl transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
        selected
          ? "ring-2 ring-secondary ring-offset-2"
          : "ring-1 ring-outline-variant hover:ring-secondary/50",
      ].join(" ")}
    >
      <canvas ref={canvasRef} className="h-full w-full object-cover" aria-hidden="true" />
      {selected ? (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-on-secondary">
          <Check size={12} strokeWidth={3} aria-hidden="true" />
        </span>
      ) : null}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2 py-1 text-left text-label-sm font-medium text-white">
        {preset.label}
      </span>
    </button>
  );
}

export function CoverPicker({
  presetId,
  uploadedUrl,
  onSelectPreset,
  onUpload,
}: {
  /** Selected preset, or null when a file is in use. */
  presetId: string | null;
  /** Object URL of an uploaded file, if any. */
  uploadedUrl: string | null;
  onSelectPreset: (preset: CoverPreset) => void;
  onUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <label className="text-body-md font-medium text-on-surface">Cover</label>
        <span className="text-label-sm text-on-surface-variant">Pick one, or use your own</span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {COVER_PRESETS.map((preset) => (
          <PresetTile
            key={preset.id}
            preset={preset}
            selected={presetId === preset.id && !uploadedUrl}
            onSelect={() => onSelectPreset(preset)}
          />
        ))}

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Upload your own cover image"
          className={[
            "flex aspect-video flex-col items-center justify-center gap-1 overflow-hidden rounded-xl",
            "transition-all duration-150 focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-secondary focus-visible:ring-offset-2",
            uploadedUrl
              ? "relative ring-2 ring-secondary ring-offset-2"
              : "border border-dashed border-outline-variant bg-surface-container-low hover:border-secondary hover:bg-secondary/5",
          ].join(" ")}
        >
          {uploadedUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={uploadedUrl} alt="Your cover" className="absolute inset-0 h-full w-full object-cover" />
              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-on-secondary">
                <Check size={12} strokeWidth={3} aria-hidden="true" />
              </span>
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2 py-1 text-label-sm font-medium text-white">
                Yours
              </span>
            </>
          ) : (
            <>
              <ImagePlus size={18} className="text-on-surface-variant" aria-hidden="true" />
              <span className="px-1 text-center text-label-sm leading-tight text-on-surface-variant">
                Upload
              </span>
            </>
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 text-label-sm text-secondary transition-colors hover:underline"
      >
        <CloudUpload size={13} aria-hidden="true" />
        {uploadedUrl ? "Replace your image" : "Upload a photo instead"}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          // Reset so picking the same file twice still fires a change.
          e.target.value = "";
        }}
      />
    </div>
  );
}
