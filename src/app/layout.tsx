import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { InstallAppPrompt, ServiceWorkerRegistrar } from "@/components/ui";
import "./globals.css";
import { getSiteUrl, isPubliclyFetchable } from "@/lib/siteUrl";

/**
 * Inter — loaded via next/font/google for automatic self-hosting.
 * Exposed as a CSS variable so globals.css @theme can reference it.
 * Inter is not a variable-weight font on Google Fonts, so we specify
 * the exact weights we use.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Canonical origin, used to resolve Open Graph / Twitter image URLs.
 *
 * CHANGED: this used to be
 *   process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
 * and NEXT_PUBLIC_SITE_URL was never set in Vercel, so production shipped
 * metadataBase = http://localhost:3000. Every og:image and og:url Next
 * resolved against it pointed at localhost, which is why link previews showed
 * the title and the description but no picture. getSiteUrl() defaults to the
 * deployment's own production domain, so this is correct with no environment
 * variable set at all. See src/lib/siteUrl.ts.
 */
const siteUrl = getSiteUrl();

/* A build that would ship localhost in its og: tags says so, once, at the
   point the value is read. The previous failure was silent for weeks. */
if (!isPubliclyFetchable(siteUrl) && process.env.NODE_ENV === "production") {
  console.warn(
    `[metadata] metadataBase resolved to ${siteUrl}, which no social crawler can fetch. ` +
      "Link previews will have no image. Set NEXT_PUBLIC_SITE_URL to the public origin."
  );
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "StrivUp — Build Better. Every Day.",
    // Child routes set only their own title; this appends the brand.
    template: "%s · StrivUp",
  },
  description:
    "India's platform for growth. Join challenges, prove your progress, and build streaks across fitness, coding, reading, entrepreneurship and more — with a community that shows up daily.",
  applicationName: "StrivUp",
  keywords: [
    "challenges",
    "habit tracking",
    "streaks",
    "accountability",
    "student community",
    "personal growth",
  ],
  manifest: "/manifest.webmanifest",
  /* Declared explicitly rather than relying on src/app/icon.png alone, so a
     browser asking for a 32px tab icon gets a 32px file instead of downscaling
     a 512px one. The lockup is 3.6:1 in a square box, so it is small at 16px
     by construction; offering the exact sizes is what keeps it crisp. */
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/favicon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    title: "StrivUp",
    capable: true,
    // "default" leaves an opaque status bar, which is what we want: the app is
    // light and the shell already paints to the safe-area edges.
    statusBarStyle: "default",
  },
  // Stops iOS Safari from turning numbers in proof captions into phone links.
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "StrivUp",
    title: "StrivUp — Build Better. Every Day.",
    description:
      "Join challenges, prove your progress, and build streaks with a community that shows up daily.",
    url: siteUrl,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "StrivUp" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "StrivUp — Build Better. Every Day.",
    description:
      "Join challenges, prove your progress, and build streaks with a community that shows up daily.",
    images: ["/og.png"],
  },
};

/**
 * themeColor must live on the `viewport` export — it was deprecated in
 * `metadata` back in Next 13.2. Single value, not a light/dark pair, because
 * globals.css currently defines no dark-mode tokens; a media-query array here
 * would promise a dark theme the stylesheet cannot deliver.
 *
 * `viewportFit: "cover"` lets the app paint into the notch and home-indicator
 * areas, which is what makes it read as an installed app rather than a page in
 * a browser. It is only safe because the shell already accounts for the insets:
 * BottomNav carries `pb-safe`, page content carries `pb-bottom-nav`, and
 * `--bottom-nav-h` folds `env(safe-area-inset-bottom)` into the nav height.
 * Without those three, the nav would sit under the home indicator.
 *
 * `userScalable` is deliberately left at its default (true). Locking zoom would
 * look more "native" but breaks pinch-to-zoom for low-vision users, and that is
 * not a trade worth making.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf9f9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/*
          Sets the theme before anything paints.

          This has to be a blocking inline script in <head>: React has not run
          yet at this point, and anything that waits for it means a dark-mode
          user gets a full white screen on every single navigation before the
          theme is reapplied. That flash is the reason this pattern exists.

          Dark ONLY when the person picked dark in Settings. It used to fall
          back to prefers-color-scheme for anyone who had never chosen, which
          meant a phone with system dark mode on turned the app dark on the
          very first visit, without anyone asking for it. Light is the app's
          look; dark is a choice, so the absence of a choice is light.

          Wrapped in try/catch because localStorage throws outright in some
          private modes, and a theme is not worth a blank page.
        */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("strivup:theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
        <ServiceWorkerRegistrar />
        {/* Shows 30s after landing, on every page, signed in or not.
            Renders nothing inside the installed app. */}
        <InstallAppPrompt />
      </body>
    </html>
  );
}
