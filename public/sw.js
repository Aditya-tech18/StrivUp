/**
 * StrivUp service worker.
 *
 * Deliberately small. A Trusted Web Activity on Play needs the site to be
 * installable, which needs a fetch handler, and it needs the app not to show
 * Chrome's dinosaur when the phone drops off the network mid-session. It does
 * not need an offline-first cache of user data, and shipping one here would be
 * actively wrong: quest codes, proof state and verification status are the
 * whole product, and serving a stale copy of those from a cache is worse than
 * showing the user that they are offline.
 *
 * So the policy is:
 *
 *   navigations   network first, falling back to /offline when the network
 *                 fails. Never serve a cached page while online.
 *   static build  cache first, for /_next/static/* and the icons, which are
 *                 content-hashed or versioned and so can never go stale.
 *   everything    (API calls, Supabase, images from storage) untouched. They
 *                 go straight to the network every time.
 */

const VERSION = "strivup-v1";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/brand/wordmark.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // addAll rejects the whole batch if any one request fails, which would
      // leave the worker uninstalled; add individually and tolerate misses.
      await Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => undefined))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Auth callbacks and anything carrying a one-time code must never be cached
  // or replayed.
  if (url.pathname.startsWith("/auth/") || url.searchParams.has("code")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL);
          return (
            (await cache.match(OFFLINE_URL)) ||
            new Response("You are offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })()
    );
    return;
  }

  const isImmutable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/");

  if (!isImmutable) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })()
  );
});
