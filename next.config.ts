import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
      {
        // Supabase Storage — proof-media + avatars buckets
        // project: cxujipeulvhreiryaptr (StrivUp)
        protocol: "https",
        hostname: "cxujipeulvhreiryaptr.supabase.co",
      },
      {
        /* Google account pictures. Most people sign in with Google and never
           upload an avatar, so this is where the majority of profile images
           actually live. It was missing, and next/image refuses a host that
           is not listed, which is why those avatars rendered as the broken
           image glyph rather than falling back to anything. */
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
    /* AVIF first, WebP second. Covers and avatars are the bulk of the bytes
       on every list and detail screen, and AVIF is roughly 20-30% smaller
       than WebP at the same quality. Next falls back down the list by what
       the browser sends in Accept, so nothing breaks on older clients. */
    formats: ["image/avif", "image/webp"],
    /* Covers are immutable once uploaded: a new cover is a new Storage path,
       never a rewrite of an existing one. The default 60s TTL meant the
       optimizer re-fetched and re-encoded the same bytes all day. */
    minimumCacheTTL: 31536000,
  },
  // Fail the build on type errors — keep this honest.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
