/**
 * src/lib/siteUrl.ts — the origin every absolute URL in this app is built on.
 *
 * This exists because of a specific, shipped bug. Three files each carried
 * their own copy of
 *
 *     process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
 *
 * NEXT_PUBLIC_SITE_URL was never set in Vercel, so production silently used
 * the localhost fallback. metadataBase became http://localhost:3000, and
 * every URL-valued tag Next resolved against it went out pointing at
 * localhost:
 *
 *     og:image   http://localhost:3000/challenges/<id>/opengraph-image-...
 *     og:url     http://localhost:3000/challenges/<id>
 *
 * Titles and descriptions are literal strings, so they were fine. That is
 * exactly what the broken previews showed: correct heading, correct subtitle,
 * correct domain line, and no picture, because WhatsApp resolved og:image
 * against its own loopback and found nothing.
 *
 * The fix is not "remember to set the variable". It is to stop depending on
 * somebody remembering. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every
 * deployment, to the project's own production domain, with no configuration
 * at all, so the default is now correct and NEXT_PUBLIC_SITE_URL is only an
 * override for the day a custom domain arrives.
 *
 * Order, and why:
 *   1. NEXT_PUBLIC_SITE_URL        an explicit custom domain always wins.
 *   2. VERCEL_PROJECT_PRODUCTION_URL   the project's production domain. Stable
 *      across deployments and publicly reachable, which the per-deployment URL
 *      is not when Deployment Protection is on.
 *   3. VERCEL_URL                  this exact deployment. Used on previews, so
 *      a preview's card comes from the preview.
 *   4. http://localhost:3000       development.
 *
 * Vercel's variables carry no scheme, so https is added. The result never has
 * a trailing slash, because callers concatenate paths onto it.
 */

function clean(value: string | undefined, withScheme = false): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol =
    withScheme || /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

/**
 * The canonical origin, e.g. "https://striv-up.vercel.app". No trailing slash.
 *
 * Read at call time rather than captured at module load, so a test or a
 * script can set the environment and get the answer it expects.
 */
export function getSiteUrl(): string {
  const explicit = clean(process.env.NEXT_PUBLIC_SITE_URL, true);
  if (explicit) return explicit;

  // On a production deployment, prefer the project's production domain over
  // the deployment-specific one: that is the host people actually share, and
  // the one a crawler can reach without a bypass token.
  if (process.env.VERCEL_ENV === "production") {
    const prod = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL);
    if (prod) return prod;
  }

  const deployment = clean(process.env.VERCEL_URL);
  if (deployment) return deployment;

  const prod = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (prod) return prod;

  return "http://localhost:3000";
}

/** An absolute URL for a path, for the og: and twitter: tags. */
export function absoluteUrl(path: string): string {
  return `${getSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * True when the resolved origin can actually be fetched by a social crawler.
 *
 * Used to make the failure loud instead of silent: a build that would ship
 * localhost in its og: tags logs a warning naming the variable to set, rather
 * than shipping previews with no image and no explanation.
 */
export function isPubliclyFetchable(url = getSiteUrl()): boolean {
  return url.startsWith("https://") && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
}
