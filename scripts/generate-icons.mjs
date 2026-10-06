/**
 * generate-icons.mjs — builds every app icon from the one source logo.
 *
 *   node scripts/generate-icons.mjs
 *
 * Source of truth is brand/strivup-logo.webp, the square logo as supplied.
 * Everything under public/icons/, plus src/app/icon.png, apple-icon.png and
 * favicon.ico, is generated from it and should never be edited by hand: re-run
 * this instead, so a new logo propagates in one step.
 *
 * Three shapes come out of it, because the platforms want different things:
 *
 *   any       the logo as supplied, which already carries its own padding and
 *             rounded border. This is what shows in a browser tab and in the
 *             Play Store listing.
 *   maskable  Android crops a maskable icon to whatever shape the launcher
 *             uses, keeping only the central 80% circle. The full wordmark
 *             would lose its ends, so this variant scales the wordmark to fit
 *             inside that circle and pads the rest with the brand white.
 *   favicon   at 16px a 3.6:1 wordmark is a smudge, so the favicon uses the
 *             blue arrow-and-UP mark on its own, which still reads.
 */

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SRC = "brand/strivup-logo.webp";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/* Measured from the source with a colour-bucket pass; see git history. The
   wordmark is the union of the navy and blue boxes. */
const MARK = { left: 803, top: 455, width: 332, height: 297 };   // arrow + UP, with a hair of margin
const WORDMARK = { left: 126, top: 465, width: 1001, height: 277 };

async function squareOnWhite(input, size, contentScale) {
  const inner = Math.round(size * contentScale);
  const resized = await sharp(input)
    .resize(inner, inner, { fit: "inside", withoutEnlargement: false })
    .toBuffer();
  const meta = await sharp(resized).metadata();
  return sharp({
    create: { width: size, height: size, channels: 4, background: WHITE },
  })
    .composite([
      {
        input: resized,
        left: Math.round((size - meta.width) / 2),
        top: Math.round((size - meta.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

async function main() {
  await mkdir("public/icons", { recursive: true });

  const wordmark = await sharp(SRC).extract(WORDMARK).toBuffer();
  const mark = await sharp(SRC).extract(MARK).toBuffer();

  /* ── any ────────────────────────────────────────────────────────────── */
  for (const size of [192, 512, 1024]) {
    await sharp(SRC)
      .resize(size, size, { fit: "cover" })
      .png()
      .toFile(`public/icons/icon-${size}.png`);
  }

  /* ── maskable: wordmark at 68% of the square, inside the 80% safe circle */
  for (const size of [192, 512]) {
    await writeFile(
      `public/icons/icon-maskable-${size}.png`,
      await squareOnWhite(wordmark, size, 0.68)
    );
  }

  /* ── Next.js app-router conventions ─────────────────────────────────────
     icon.png is the browser-tab icon, which browsers render as small as 16px,
     so it gets the mark rather than the wordmark. apple-icon.png is a home
     screen tile at 180px, where the full logo reads fine. */
  await writeFile("src/app/icon.png", await squareOnWhite(mark, 512, 0.78));
  await sharp(SRC).resize(180, 180, { fit: "cover" }).png().toFile("src/app/apple-icon.png");

  /* ── favicon: the mark alone, legible at 16px ───────────────────────── */
  await writeFile("public/icons/favicon-32.png", await squareOnWhite(mark, 32, 0.82));
  await writeFile("public/icons/favicon-16.png", await squareOnWhite(mark, 16, 0.86));

  /* ── wordmark for in-app brand marks (sidebar, headers, auth) ───────── */
  await sharp(wordmark)
    .resize({ height: 160, withoutEnlargement: false })
    .png()
    .toFile("public/brand/wordmark.png");
  await sharp(mark)
    .resize({ height: 160, withoutEnlargement: false })
    .png()
    .toFile("public/brand/mark.png");

  /* ── Open Graph / Twitter card, 1200x630 ────────────────────────────── */
  const ogLogo = await sharp(wordmark).resize({ width: 760 }).toBuffer();
  const ogMeta = await sharp(ogLogo).metadata();
  await sharp({
    create: { width: 1200, height: 630, channels: 4, background: WHITE },
  })
    .composite([
      {
        input: ogLogo,
        left: Math.round((1200 - ogMeta.width) / 2),
        top: Math.round((630 - ogMeta.height) / 2),
      },
    ])
    .png()
    .toFile("public/og.png");

  console.log("icons written to public/icons, public/brand, src/app and public/og.png");
}

await mkdir("public/brand", { recursive: true });
await main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
