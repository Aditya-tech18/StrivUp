/**
 * src/lib/share/ogCard.tsx — the image WhatsApp actually shows.
 *
 * A link preview's chrome belongs to the platform: WhatsApp decides the
 * bubble, the corner radius and where the domain goes, and no markup of ours
 * changes it. The one surface we control is og:image, so the whole card
 * design lives inside the 1200x630 picture rendered here.
 *
 * Rendered by Satori, which is not a browser. Only flexbox lays out, every
 * element holding more than one child needs an explicit display:flex, and
 * there is no text truncation worth relying on, so strings are cut to length
 * before they are passed in.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SharePreview } from "@/lib/data/share";
import { formatTenure } from "@/lib/data/share";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/jpeg";

/**
 * Cache headers for the generated card.
 *
 * Without these the route answered `max-age=0, must-revalidate` and every
 * crawler fetch re-rendered the card: three font files off disk, a remote
 * thumbnail fetched, and the whole 1200x630 frame rasterised. WhatsApp gives
 * a link preview a short window and drops the image if the fetch does not
 * finish inside it, so a cold render was a coin toss even once the URL was
 * right.
 *
 * s-maxage lets Vercel's CDN answer later fetches from the edge, which is
 * what turns the second share of a link into a hit rather than another
 * render. stale-while-revalidate keeps that true past the day without ever
 * making a crawler wait for a re-render. A card going a day stale costs
 * nothing: the platforms cache these for far longer than we do.
 */
export const OG_CACHE_HEADERS = {
  "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
} as const;

/* The dark teal the share card is built on. StrivUp's own palette is black,
   white and a blue accent, none of which carry a photograph well at this
   size: a cover image on white reads as a document, and on black it reads as
   a video thumbnail. The teal is the dark end of --color-chart-2 (#0e7490),
   already in globals.css, so the card stays inside the project's palette
   rather than introducing a colour from nowhere. */
const TEAL_DEEP = "#062A2E";
const TEAL = "#0C4349";
const TEAL_EDGE = "#15616D";
const INK = "#FFFFFF";
const INK_MUTED = "rgba(255,255,255,0.82)";
const INK_FAINT = "rgba(255,255,255,0.60)";

/**
 * Render a card and hand back a response a crawler will actually accept.
 *
 * next/og only emits PNG, and a PNG of a photograph at 1200x630 is enormous:
 * measured at 1,063,335 bytes for a photographic cover. WhatsApp drops a
 * preview image well below that, so even with the URL fixed the picture would
 * have been a coin toss on the one platform this is mostly shared through.
 * The same frame as JPEG measured 94,297 bytes at quality 82 and 129,101 at
 * 90, a reduction of about 88 percent, with no change to the dimensions and
 * no visible difference on either the photographic or the flat card.
 *
 * So: let Satori rasterise, then re-encode. sharp is already in the tree for
 * Next's image optimiser and is now declared in package.json rather than
 * relied on as a transitive hoist.
 *
 * If the re-encode ever throws, the PNG is returned as it was. A large image
 * is a risk; no image is a certainty.
 */
export async function renderOgImage(
  element: React.ReactElement,
  fonts: Awaited<ReturnType<typeof loadOgFonts>>
): Promise<Response> {
  const { ImageResponse } = await import("next/og");
  const png = new ImageResponse(element, { ...OG_SIZE, fonts });

  try {
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(Buffer.from(await png.arrayBuffer()))
      .jpeg({ quality: 88, progressive: true, mozjpeg: true })
      .toBuffer();

    return new Response(new Uint8Array(jpeg), {
      headers: { "content-type": OG_CONTENT_TYPE, ...OG_CACHE_HEADERS },
    });
  } catch (err) {
    console.error("[ogCard] JPEG re-encode failed, serving PNG", err);
    return new Response(await png.arrayBuffer(), {
      headers: { "content-type": "image/png", ...OG_CACHE_HEADERS },
    });
  }
}

/** Satori has no ellipsis, so the cut happens here. */
function clamp(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export async function loadOgFonts() {
  const dir = join(process.cwd(), "assets/fonts");
  const [regular, semibold, bold] = await Promise.all([
    readFile(join(dir, "Inter-Regular.ttf")),
    readFile(join(dir, "Inter-SemiBold.ttf")),
    readFile(join(dir, "Inter-Bold.ttf")),
  ]);
  return [
    { name: "Inter", data: regular, style: "normal" as const, weight: 400 as const },
    { name: "Inter", data: semibold, style: "normal" as const, weight: 600 as const },
    { name: "Inter", data: bold, style: "normal" as const, weight: 700 as const },
  ];
}

function CalendarIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={INK_MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

/**
 * The fallback when a creator never uploaded a cover. A flat tile rather than
 * a stock photo: an unrelated stock image on someone's challenge is worse
 * than no image, because it reads as the creator's own choice.
 *
 * It shows the wordmark, not the kind: the kind already has an overline
 * directly below, and the first draft printed "CHALLENGE" twice, once in
 * each place.
 */
function CoverFallback() {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${TEAL_EDGE} 0%, ${TEAL_DEEP} 100%)`,
        fontSize: 56,
        fontWeight: 700,
        letterSpacing: -1,
        color: INK_FAINT,
      }}
    >
      StrivUp
    </div>
  );
}

export function OgShareCard({ preview }: { preview: SharePreview }) {
  const tenure = formatTenure(preview.startDate, preview.endDate);
  const title = clamp(preview.title, 64);
  const organizer = preview.organizerName ? clamp(preview.organizerName, 40) : null;
  const kindLabel = preview.kind === "challenge" ? "CHALLENGE" : "QUEST";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 40,
        background: `linear-gradient(160deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)`,
        fontFamily: "Inter",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          borderRadius: 36,
          overflow: "hidden",
          border: `2px solid rgba(255,255,255,0.10)`,
          background: "rgba(255,255,255,0.04)",
        }}
      >
        {/* Cover. Fixed height so the text block below never moves, whatever
            aspect ratio the creator uploaded.

            CHANGED: 322 to 264. The arithmetic underneath this card only ever
            left room for one line of title: 550 of inner height, minus a 322
            cover, minus 60 of padding, minus 38 for the kind label and 72 for
            the organizer row, leaves 58px, and one line at 52px/1.12 is 58.2.
            A title that wrapped had nowhere to go, so its second line drew
            straight through the organizer row. Giving the cover 58px back is
            what buys the second line. */}
        <div style={{ display: "flex", width: "100%", height: 264, overflow: "hidden" }}>
          {preview.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.imageUrl}
              alt=""
              width={1120}
              height={264}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <CoverFallback />
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "28px 44px 32px 44px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 3,
              color: INK_FAINT,
              marginBottom: 12,
            }}
          >
            {kindLabel}
          </div>

          {/* CHANGED: fixed two-line box, clipped.
              Satori lays the title out as a flex item and gave the div the
              height of a single line, so a title that wrapped to two lines
              rendered its second line straight through the organizer row
              below it. Any challenge whose title ran past about 38
              characters came out with overlapping text. A box exactly two
              lines tall, with overflow hidden, makes that impossible
              whatever the creator types. The clamp above still trims the
              string first, so clipping is the backstop, not the mechanism. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              flexShrink: 0,
              maxHeight: 118,
              overflow: "hidden",
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1.12,
              color: INK,
            }}
          >
            {title}
          </div>

          <div style={{ display: "flex", flex: 1 }} />

          <div style={{ display: "flex", alignItems: "center", marginTop: 20 }}>
            {organizer && (
              <div style={{ display: "flex", alignItems: "center", marginRight: 36 }}>
                {preview.organizerImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.organizerImageUrl}
                    alt=""
                    width={52}
                    height={52}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      objectFit: "cover",
                      marginRight: 14,
                      border: "2px solid rgba(255,255,255,0.25)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      marginRight: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      background: TEAL_EDGE,
                      fontSize: 24,
                      fontWeight: 700,
                      color: INK,
                    }}
                  >
                    {organizer.replace("@", "").charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: INK_MUTED }}>
                  by {organizer}
                </div>
              </div>
            )}

            {tenure && (
              <div style={{ display: "flex", alignItems: "center" }}>
                <CalendarIcon />
                <div
                  style={{
                    display: "flex",
                    fontSize: 28,
                    fontWeight: 500,
                    color: INK_MUTED,
                    marginLeft: 12,
                  }}
                >
                  {tenure}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown when the row is not public, or not there at all. Deliberately says
 * nothing about which: a 404 and a private challenge must look identical to a
 * crawler, or the preview becomes a way to probe for private ids.
 */
export function OgFallbackCard() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(160deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)`,
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", fontSize: 84, fontWeight: 700, color: INK, letterSpacing: -1 }}>
        StrivUp
      </div>
      <div style={{ display: "flex", fontSize: 32, color: INK_MUTED, marginTop: 16 }}>
        Build Better. Every Day.
      </div>
    </div>
  );
}
