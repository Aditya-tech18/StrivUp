/**
 * src/lib/formatCount.ts — compact counts for participant tallies.
 *
 * Reads the way a hackathon or quest listing does: exact while the number is
 * small enough to matter, abbreviated once it stops being worth reading
 * digit by digit.
 *
 *   0..999   -> "0", "847"
 *   1000+    -> "1K", "1.2K", "12K", "999K"
 *   1000000+ -> "1M", "1.2M"
 *
 * The ".0" is dropped deliberately: "1K" rather than "1.0K".
 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  const v = Math.floor(n);

  if (v < 1000) return v.toLocaleString("en-IN");

  const unit = v >= 1_000_000 ? { d: 1_000_000, s: "M" } : { d: 1000, s: "K" };
  const scaled = v / unit.d;
  /* One decimal below 10 ("1.2K"), none above ("12K") — past that the decimal
     is noise. */
  const text = scaled < 10 ? scaled.toFixed(1).replace(/\.0$/, "") : String(Math.floor(scaled));
  return `${text}${unit.s}`;
}
