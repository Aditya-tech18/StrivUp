/**
 * og:image for /join/[code] — the link people actually paste into WhatsApp.
 *
 * Same card as the challenge route, fed by the invite code instead of an id,
 * because an invite usually points at a private challenge that the anonymous
 * role cannot read directly.
 */

import { getInviteSharePreview } from "@/lib/data/share";
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  renderOgImage,
  OgShareCard,
  OgFallbackCard,
  loadOgFonts,
} from "@/lib/share/ogCard";

export const alt = "You have been invited to a StrivUp challenge";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [preview, fonts] = await Promise.all([
    getInviteSharePreview(code),
    loadOgFonts(),
  ]);

  // CHANGED: renderOgImage rasterises the card and re-encodes it as JPEG.
  // The PNG next/og emits measured 1,063,335 bytes with a photographic
  // cover, which WhatsApp will not take; the same frame as JPEG is about
  // an eighth of that. It also carries the edge cache headers.
  return renderOgImage(
    preview ? <OgShareCard preview={preview} /> : <OgFallbackCard />,
    fonts
  );
}
