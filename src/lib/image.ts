/**
 * src/lib/image.ts — client-side image compression, shared by every upload.
 *
 * Before this existed, exactly one of the app's eight upload paths compressed
 * anything (the proof uploader had its own private copy). Challenge thumbnails,
 * quest thumbnails, avatars and business logos all pushed the raw file straight
 * into Storage, so a 10 MB photo occupied 10 MB forever.
 *
 * Three things this does that a naive canvas resize does not:
 *
 *   EXIF ORIENTATION. A photo from a phone carries a rotation flag rather than
 *   rotated pixels. createImageBitmap with imageOrientation: "from-image"
 *   bakes the rotation in, so portrait shots stop arriving sideways.
 *
 *   TARGETS A SIZE, NOT A QUALITY. A fixed quality gives wildly different file
 *   sizes depending on the photo — a flat sky compresses to nothing, a detailed
 *   scene stays huge. This steps quality down until the result fits the budget,
 *   so the cap is actually a cap.
 *
 *   KEEPS TRANSPARENCY. Re-encoding everything to JPEG puts black boxes behind
 *   transparent logos and avatars. Alpha is detected and PNG preserved.
 *
 * Returns the pixel dimensions alongside the file so callers can persist them
 * and render the image at its true aspect ratio instead of guessing.
 */

export interface CompressedImage {
  file: File;
  width: number;
  height: number;
  /** Bytes saved, for logging and for telling the person what happened. */
  originalBytes: number;
  compressedBytes: number;
}

export interface CompressOptions {
  /** Longest edge, in pixels. Larger images are scaled down proportionally. */
  maxEdge: number;
  /** Byte budget. Quality steps down until the encode fits, or bottoms out. */
  maxBytes: number;
  /** Starting JPEG/WebP quality. */
  quality?: number;
}

/** Tuned per surface: a proof is looked at closely, an avatar is 40px on screen. */
export const IMAGE_PRESETS = {
  /** Daily proof. Generous, because this is the thing people zoom into. */
  proof: { maxEdge: 1600, maxBytes: 800_000, quality: 0.85 },
  /** Challenge and quest cover art. */
  thumbnail: { maxEdge: 1280, maxBytes: 500_000, quality: 0.82 },
  /** Avatars and business logos — never rendered above ~160px. */
  avatar: { maxEdge: 512, maxBytes: 200_000, quality: 0.85 },
} as const satisfies Record<string, CompressOptions>;

/**
 * Does this image actually use transparency?
 *
 * Sampled from a 64×64 downscale rather than the full bitmap: reading 4k pixels
 * is instant, reading 12 megapixels is not, and a logo with transparency will
 * always still have transparent pixels once shrunk.
 */
function hasAlpha(bitmap: ImageBitmap): boolean {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  ctx.drawImage(bitmap, 0, 0, size, size);
  try {
    const { data } = ctx.getImageData(0, 0, size, size);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return true;
    }
  } catch {
    // Tainted canvas (cross-origin source): assume opaque rather than throw.
    return false;
  }
  return false;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Compress an image file. Non-images (video proofs) pass through untouched.
 *
 * Never throws: if anything goes wrong — an unreadable file, a missing 2D
 * context, a browser that refuses the encode — the original file is returned so
 * the upload still succeeds. A failed optimisation must not become a failed
 * upload.
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = IMAGE_PRESETS.proof
): Promise<CompressedImage> {
  const originalBytes = file.size;
  const passthrough = (w = 0, h = 0): CompressedImage => ({
    file,
    width: w,
    height: h,
    originalBytes,
    compressedBytes: originalBytes,
  });

  if (!file.type.startsWith("image/")) return passthrough();
  // Animated GIFs would be flattened to a single frame by a canvas round-trip.
  if (file.type === "image/gif") return passthrough();

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return passthrough();
  }

  const { width: srcW, height: srcH } = bitmap;
  const scale = Math.min(1, opts.maxEdge / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return passthrough(srcW, srcH);
  }

  // Better downscaling than the default, which aliases badly on big reductions.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);

  const keepPng = hasAlpha(bitmap);
  bitmap.close();

  const mime = keepPng ? "image/png" : "image/jpeg";
  const ext = keepPng ? "png" : "jpg";

  let blob: Blob | null = null;

  if (keepPng) {
    // PNG ignores the quality argument; the resize is the only lever.
    blob = await canvasToBlob(canvas, mime, 1);
  } else {
    // Step quality down until it fits the budget. Stops at 0.55 — below that
    // the artefacts are worse than the bytes are worth.
    let quality = opts.quality ?? 0.85;
    for (let attempt = 0; attempt < 5; attempt++) {
      blob = await canvasToBlob(canvas, mime, quality);
      if (!blob || blob.size <= opts.maxBytes || quality <= 0.55) break;
      quality = Math.max(0.55, quality - 0.1);
    }
  }

  if (!blob) return passthrough(srcW, srcH);

  // If the "optimised" file is bigger than what we started with — common for
  // already-tuned images, and for small PNGs — keep the original bytes but
  // still report the dimensions we measured.
  if (blob.size >= originalBytes) {
    return { ...passthrough(width, height), width, height };
  }

  const name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
  return {
    file: new File([blob], name, { type: mime, lastModified: Date.now() }),
    width,
    height,
    originalBytes,
    compressedBytes: blob.size,
  };
}

/**
 * Clamp an image's aspect ratio to a range the feed can lay out sensibly.
 *
 * Rendering every image at its true ratio sounds right until someone posts a
 * 1:6 panorama or a screenshot of an entire webpage and it eats the screen.
 * The bounds match what the major feeds settled on: 4:5 at the tall end,
 * 1.91:1 at the wide end. Inside that range nothing is cropped at all, which is
 * the overwhelming majority of real photos.
 */
export const ASPECT_MIN = 4 / 5;
export const ASPECT_MAX = 1.91;

export function clampAspect(width: number | null, height: number | null): number {
  if (!width || !height || width <= 0 || height <= 0) {
    // Unknown dimensions (anything uploaded before dimensions were recorded)
    // fall back to 4:3, which is gentler than the 16:9 the feed used to force.
    return 4 / 3;
  }
  return Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, width / height));
}

/** "2.4 MB → 310 KB", for upload feedback. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
