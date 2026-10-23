/**
 * VerifiedBadge — the blue tick, and the gold one.
 *
 * ONE mark, two tiers. The owner asked for a "golden blue tick" for
 * businesses and a "standard blue tick" for people, so the shape is the same
 * seal in both cases and only the fill changes. That is also how the badges
 * this is modelled on work: a tier is a colour, not a different symbol, or
 * nobody learns to recognise either one.
 *
 * The geometry is measured from the reference images rather than eyeballed.
 * Sampling the blue reference gave a 20-point starburst whose inner radius is
 * 0.91 of its outer radius, which is why the points read as a scalloped seal
 * rather than a spiky star. The blue is the image's own dominant colour,
 * #1050EF, which covered 58% of it. The gold is the gold reference's
 * gradient, sampled at its 5th and 95th luminance percentiles so the two
 * endpoints come from the artwork instead of from taste.
 *
 * Drawn as SVG, not shipped as PNGs: it has to sit inline next to a name at
 * 14px and also at 28px on a profile header, stay crisp on every screen, and
 * not cost two network requests on a feed full of verified accounts.
 */

export type VerificationType = "none" | "user" | "business";

/* Measured from the reference artwork. */
const POINTS = 20;
const INNER_RATIO = 0.91;

const BLUE = "#1050EF";
const GOLD_LIGHT = "#E6CA43";
const GOLD_DARK = "#BC890E";

/**
 * The scalloped seal outline.
 *
 * Alternates outer and inner radius around the circle, which is the whole
 * trick: with a ratio near 1 the result is a seal, and near 0 it would be a
 * sunburst. Computed once at module load, not per render.
 */
const SEAL_PATH = (() => {
  const cx = 24;
  const cy = 24;
  const outer = 23;
  const inner = outer * INNER_RATIO;
  const step = Math.PI / POINTS; // half a point per step
  const parts: string[] = [];

  for (let i = 0; i < POINTS * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    // Start at the top so the seal sits square rather than rotated.
    const a = i * step - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  parts.push("Z");
  return parts.join(" ");
})();

export function VerifiedBadge({
  type,
  size = 16,
  className = "",
  title,
}: {
  type: VerificationType | null | undefined;
  size?: number;
  className?: string;
  /** Overrides the default label. Pass "" to hide it from screen readers. */
  title?: string;
}) {
  if (type !== "user" && type !== "business") return null;

  const isBusiness = type === "business";
  const label =
    title ?? (isBusiness ? "Verified business" : "Verified account");

  /* The gradient needs an id unique to the tier, not to the instance: two
     badges of the same tier can share one definition, and a render-time
     random id would differ between the server and the client and break
     hydration. */
  const gradientId = "strivup-verified-gold";

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={`inline-block shrink-0 align-[-0.125em] ${className}`}
      role={label ? "img" : "presentation"}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {isBusiness && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={GOLD_LIGHT} />
            <stop offset="100%" stopColor={GOLD_DARK} />
          </linearGradient>
        </defs>
      )}

      <path d={SEAL_PATH} fill={isBusiness ? `url(#${gradientId})` : BLUE} />

      {/* The check. Butt caps and a round join match the reference, where the
          stroke ends are square but the elbow is not. */}
      <path
        d="M15 24.5 L21.2 30.5 L33.5 18"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={4.2}
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </svg>
  );
}
