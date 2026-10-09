import type { MetadataRoute } from "next";

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * This is what makes StrivUp installable, and it is also what Bubblewrap reads
 * when it generates the Play Store package (see docs/play-store.md). The fields
 * below are the ones that build actually depends on, so changing them changes
 * the Android app:
 *
 *   name / short_name   the launcher label. short_name is what Android shows
 *                       under the icon, where anything past ~12 characters is
 *                       truncated.
 *   id                  pins the app's identity across start_url changes. Once
 *                       published, changing it makes Play treat it as a new app.
 *   display             "standalone" is what removes the browser chrome. The
 *                       TWA requires it; "browser" would ship a glorified tab.
 *   icons               Play needs a 512 "any" and Android launchers need a
 *                       maskable, or the icon gets a white badge around it.
 *   screenshots         Play Console requires at least one phone screenshot to
 *                       publish; these are generated, see docs/play-store.md.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "StrivUp — Build Better. Every Day.",
    short_name: "StrivUp",
    description:
      "Join challenges, prove your progress, and build streaks with a community that shows up daily.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#fbf9f9",
    categories: ["lifestyle", "health", "education", "social"],
    lang: "en-IN",
    dir: "ltr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Quests", short_name: "Quests", url: "/quests", description: "Local quests from businesses near you" },
      { name: "Explore", short_name: "Explore", url: "/explore", description: "Find a challenge to join" },
      { name: "Feed", short_name: "Feed", url: "/feed", description: "What your community did today" },
    ],
  };
}
