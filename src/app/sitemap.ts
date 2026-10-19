import type { MetadataRoute } from "next";

// CHANGED: shared resolver. The old inline fallback meant an unset
// NEXT_PUBLIC_SITE_URL pointed this at localhost in production too.
import { getSiteUrl } from "@/lib/siteUrl";

const siteUrl = getSiteUrl();

/**
 * sitemap.xml — the publicly reachable pages only.
 *
 * Everything else is behind the auth guard in proxy.ts, so listing it would
 * point crawlers at redirects.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/how-quests-work`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/delete-account`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
