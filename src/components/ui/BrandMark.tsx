import Image from "next/image";

/**
 * BrandMark — the StrivUp logo.
 *
 * Both files are generated from brand/strivup-logo.webp by
 * scripts/generate-icons.mjs, so the logo is set in one place and every surface
 * follows. Before this, the brand mark was a lucide Flame in a rounded square,
 * which is also the app's streak icon: the logo and "you are on a streak" were
 * the same glyph.
 *
 *   wordmark  the full STRIVUP lockup. Use wherever there is horizontal room:
 *             headers, auth screens, the sidebar when it is expanded.
 *   mark      the arrow-and-UP alone, for square slots and the collapsed rail.
 *
 * `height` drives the size; width follows the source aspect ratio, so the logo
 * can never be stretched by a caller.
 */

const SOURCES = {
  wordmark: { src: "/brand/wordmark.png", ratio: 1001 / 297 },
  mark: { src: "/brand/mark.png", ratio: 332 / 297 },
} as const;

export function BrandMark({
  variant = "wordmark",
  height = 24,
  className = "",
  priority = false,
}: {
  variant?: keyof typeof SOURCES;
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  const { src, ratio } = SOURCES[variant];
  const width = Math.round(height * ratio);

  return (
    <Image
      src={src}
      alt="StrivUp"
      width={width}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}
