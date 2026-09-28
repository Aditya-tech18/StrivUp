import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
 * Set NEXT_PUBLIC_SITE_URL in Vercel to the production domain; the localhost
 * fallback keeps dev and preview builds working without extra config.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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
  appleWebApp: {
    title: "StrivUp",
    capable: true,
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
  },
  twitter: {
    card: "summary_large_image",
    title: "StrivUp — Build Better. Every Day.",
    description:
      "Join challenges, prove your progress, and build streaks with a community that shows up daily.",
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
    <html lang="en" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
