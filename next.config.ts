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
        // Supabase Storage CDN — covers thumbnails + proof media
        // from the proof-media bucket (project: cxujipeulvhreiryaptr)
        protocol: "https",
        hostname: "cxujipeulvhreiryaptr.supabase.co",
      },
    ],
  },
};

export default nextConfig;
