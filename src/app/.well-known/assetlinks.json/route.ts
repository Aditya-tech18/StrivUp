import { NextResponse } from "next/server";

/**
 * /.well-known/assetlinks.json — Digital Asset Links.
 *
 * This is what tells Android that the Play package below is allowed to open
 * StrivUp URLs as a Trusted Web Activity. Without a matching file, the TWA
 * still runs but Chrome keeps a URL bar pinned to the top of it, which is both
 * ugly and a Play review risk.
 *
 * Served from a route rather than public/ because the fingerprint differs per
 * environment and belongs in env, not in the repo:
 *
 *   TWA_PACKAGE_NAME      e.g. app.strivup.twa
 *   TWA_SHA256_FINGERPRINT  the signing-key fingerprint, colon-separated.
 *                           Take it from Play Console → Setup → App signing →
 *                           "SHA-256 certificate fingerprint" of the *app
 *                           signing key*, not the upload key: Play re-signs
 *                           the bundle, so the upload key's fingerprint will
 *                           verify in testing and fail in production.
 *                           Several values can be given, comma-separated,
 *                           which is how you rotate a key without downtime.
 *
 * With neither set this returns an empty array, which is a valid document that
 * grants nothing. That keeps preview deployments from accidentally authorising
 * a package.
 */

export const dynamic = "force-dynamic";

export function GET() {
  const pkg = process.env.TWA_PACKAGE_NAME;
  const fingerprints = (process.env.TWA_SHA256_FINGERPRINT ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const statements =
    pkg && fingerprints.length > 0
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: pkg,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [];

  return NextResponse.json(statements, {
    headers: {
      "Content-Type": "application/json",
      // Android fetches this on install and caches it; a short TTL keeps a
      // fingerprint rotation from taking a day to land.
      "Cache-Control": "public, max-age=300",
    },
  });
}
