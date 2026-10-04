"use client";

/**
 * /dev/image-test — dev-only proving ground for the upload compressor.
 *
 * Generates synthetic photos at realistic sizes and shapes, runs each preset
 * over them, and reports the before/after bytes and dimensions. The noise in
 * the generator matters: a flat gradient compresses to almost nothing and would
 * make the pipeline look far better than it is on a real photograph.
 *
 * 404s in production, like the other /dev routes.
 */

import { useState } from "react";
import { notFound } from "next/navigation";
import { compressImage, formatBytes, clampAspect, IMAGE_PRESETS } from "@/lib/image";

interface Row {
  label: string;
  srcDims: string;
  outDims: string;
  before: string;
  after: string;
  saved: string;
  aspect: string;
  type: string;
}

/** A logo-style image with a transparent background — must survive as PNG. */
async function syntheticLogo(w: number, h: number): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // No fillRect: the background stays fully transparent.
  ctx.fillStyle = "#1d4ed8";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, Math.min(w, h) / 3, 0, Math.PI * 2);
  ctx.fill();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  return new File([blob!], "logo.png", { type: "image/png" });
}

/** A busy, noisy image — the kind that actually resists compression. */
async function syntheticPhoto(w: number, h: number): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#1d4ed8");
  grad.addColorStop(0.5, "#019668");
  grad.addColorStop(1, "#1b1c1c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // High-frequency detail so the encoder has real work to do.
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `hsl(${Math.random() * 360} 80% ${30 + Math.random() * 50}%)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 24, Math.random() * 24);
  }

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  return new File([blob!], "synthetic.png", { type: "image/png" });
}

export default function ImageTestPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setRows([]);

    const cases: Array<[string, number, number, keyof typeof IMAGE_PRESETS]> = [
      ["Landscape photo 4032×3024", 4032, 3024, "proof"],
      ["Portrait phone 3024×4032", 3024, 4032, "proof"],
      ["Square 2000×2000", 2000, 2000, "proof"],
      ["Panorama 6000×1500", 6000, 1500, "proof"],
      ["Thumbnail source 4032×3024", 4032, 3024, "thumbnail"],
      ["Avatar source 2000×2000", 2000, 2000, "avatar"],
      ["Transparent logo 1200×1200", 1200, 1200, "avatar"],
    ];

    const out: Row[] = [];
    for (const [label, w, h, preset] of cases) {
      const src = label.startsWith("Transparent")
        ? await syntheticLogo(w, h)
        : await syntheticPhoto(w, h);
      const res = await compressImage(src, IMAGE_PRESETS[preset]);
      out.push({
        label: `${label} · ${preset}`,
        srcDims: `${w}×${h}`,
        outDims: `${res.width}×${res.height}`,
        before: formatBytes(res.originalBytes),
        after: formatBytes(res.compressedBytes),
        saved:
          res.originalBytes > 0
            ? `${Math.round((1 - res.compressedBytes / res.originalBytes) * 100)}%`
            : "—",
        aspect: clampAspect(res.width, res.height).toFixed(2),
        type: res.file.type,
      });
      setRows([...out]);
    }
    setRunning(false);
  }

  return (
    <div className="min-h-screen bg-surface px-gutter py-space-lg">
      <div className="mx-auto max-w-2xl">
        <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
          Dev harness
        </p>
        <h1 className="text-headline-lg-mobile text-on-surface">Upload compressor</h1>
        <p className="mt-space-xs text-body-sm text-on-surface-variant">
          Synthetic noisy photos, so the numbers reflect real images rather than
          flat gradients. Not reachable in production.
        </p>

        <button
          type="button"
          onClick={run}
          disabled={running}
          className="mt-space-md h-11 rounded-lg bg-primary px-space-lg text-label-lg text-on-primary disabled:opacity-50"
        >
          {running ? "Running…" : "Run compression tests"}
        </button>

        {rows.length > 0 ? (
          <div className="mt-space-lg flex flex-col gap-space-sm">
            {rows.map((r) => (
              <div
                key={r.label}
                className="rounded-xl bg-surface-container-lowest p-space-md shadow-sm"
              >
                <p className="text-body-md font-semibold text-on-surface">{r.label}</p>
                <dl className="mt-1.5 grid grid-cols-2 gap-x-space-md gap-y-1 text-body-sm">
                  <dt className="text-on-surface-variant">Size</dt>
                  <dd className="text-on-surface">
                    {r.before} → <span className="font-bold">{r.after}</span>{" "}
                    <span className="text-on-tertiary-container">(−{r.saved})</span>
                  </dd>
                  <dt className="text-on-surface-variant">Dimensions</dt>
                  <dd className="text-on-surface">
                    {r.srcDims} → {r.outDims}
                  </dd>
                  <dt className="text-on-surface-variant">Rendered aspect</dt>
                  <dd className="text-on-surface">{r.aspect}</dd>
                  <dt className="text-on-surface-variant">Output type</dt>
                  <dd className="text-on-surface">{r.type}</dd>
                </dl>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
