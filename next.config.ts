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
    ],
  },
  // Silence known safe build warnings
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
