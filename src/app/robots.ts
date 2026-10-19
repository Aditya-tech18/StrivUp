import type { MetadataRoute } from "next";

// CHANGED: shared resolver. The old inline fallback meant an unset
// NEXT_PUBLIC_SITE_URL pointed this at localhost in production too.
import { getSiteUrl } from "@/lib/siteUrl";

const siteUrl = getSiteUrl();

/**
 * robots.txt.
 *
 * The signed-in app is disallowed rather than left to chance: those routes
 * redirect to /login for a crawler anyway, so indexing them only produces
 * login pages under a hundred different URLs. The admin console is disallowed
 * and also carries `robots: noindex` in its own metadata.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/delete-account", "/how-quests-work"],
      disallow: [
        "/admin",
        "/api/",
        "/auth/",
        "/feed",
        "/settings",
        "/alerts",
        "/creator",
        "/business",
        "/profile",
        "/u/",
        "/join/",
        "/activity",
        "/offline",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
