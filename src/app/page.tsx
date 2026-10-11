/**
 * Root page — /
 *
 * Renders the STRIVUP gateway (Continue as User / Continue as Business).
 *
 * There used to be a second page for this at app/(auth)/page.tsx. Both
 * resolved to /, so one of them was dead and which one Next served was not
 * something you could tell by reading the tree. This is the one that survives,
 * because it also forwards a stray OAuth ?code= (see OAuthCodeForwarder), and
 * it is a server component now so it can carry the metadata the other one had.
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import { GatewayScreen } from "./(auth)/GatewayScreen";
import { OAuthCodeForwarder } from "./OAuthCodeForwarder";

export const metadata: Metadata = {
  title: "India's Platform for Growth",
  description:
    "Build discipline, join challenges, and grow with a community that holds you accountable.",
};

export default function RootPage() {
  return (
    <>
      {/* useSearchParams opts this subtree into client rendering; the Suspense
          boundary keeps the gateway below it static. */}
      <Suspense fallback={null}>
        <OAuthCodeForwarder />
      </Suspense>
      <GatewayScreen />
    </>
  );
}
