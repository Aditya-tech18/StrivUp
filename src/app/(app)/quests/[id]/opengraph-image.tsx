/**
 * og:image for /quests/[id].
 *
 * Next serves this as a route beside the page and writes the matching
 * og:image tags into the head, so the only thing the page has to do is exist.
 * The proxy exempts this path along with the page itself, since a crawler
 * fetches the image with no cookies.
 */

import { getQuestSharePreview } from "@/lib/data/share";
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  renderOgImage,
  OgShareCard,
  OgFallbackCard,
  loadOgFonts,
} from "@/lib/share/ogCard";

export const alt = "StrivUp quest";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [preview, fonts] = await Promise.all([getQuestSharePreview(id), loadOgFonts()]);

  // CHANGED: renderOgImage rasterises the card and re-encodes it as JPEG.
  // The PNG next/og emits measured 1,063,335 bytes with a photographic
  // cover, which WhatsApp will not take; the same frame as JPEG is about
  // an eighth of that. It also carries the edge cache headers.
  return renderOgImage(
    preview ? <OgShareCard preview={preview} /> : <OgFallbackCard />,
    fonts
  );
}
