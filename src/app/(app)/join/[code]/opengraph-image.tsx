/**
 * og:image for /join/[code] — the link people actually paste into WhatsApp.
 *
 * Same card as the challenge route, fed by the invite code instead of an id,
 * because an invite usually points at a private challenge that the anonymous
 * role cannot read directly.
 */

import { ImageResponse } from "next/og";
import { getInviteSharePreview } from "@/lib/data/share";
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
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

  return new ImageResponse(
    preview ? <OgShareCard preview={preview} /> : <OgFallbackCard />,
    { ...size, fonts }
  );
}
