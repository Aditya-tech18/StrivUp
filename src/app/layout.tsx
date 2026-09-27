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

export const metadata: Metadata = {
  title: "STRIVUP",
  description: "STRIVUP — India's Platform for Growth",
};

/** viewportFit "cover" exposes env(safe-area-inset-*) on notched phones. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
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
