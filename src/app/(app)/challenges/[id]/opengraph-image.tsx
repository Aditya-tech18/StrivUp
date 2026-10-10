/**
 * og:image for /challenges/[id].
 *
 * Next serves this as a route beside the page and writes the matching
 * og:image tags into the head, so the only thing the page has to do is exist.
 * The proxy exempts this path along with the page itself, since a crawler
 * fetches the image with no cookies.
 */

import { ImageResponse } from "next/og";
import { getChallengeSharePreview } from "@/lib/data/share";
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  OgShareCard,
  OgFallbackCard,
  loadOgFonts,
} from "@/lib/share/ogCard";

export const alt = "StrivUp challenge";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [preview, fonts] = await Promise.all([getChallengeSharePreview(id), loadOgFonts()]);

  return new ImageResponse(
    preview ? <OgShareCard preview={preview} /> : <OgFallbackCard />,
    { ...size, fonts }
  );
}
