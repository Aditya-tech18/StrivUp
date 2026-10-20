/*
 * STRIVY push service worker.
 *
 * Only handles push notifications: it shows STRIVY's pushes, opens the
 * right page on click and keeps the subscription fresh when the browser
 * rotates it. It doesn't cache pages or intercept requests.
 * Registered by the Strivy panel when the person turns notifications on.
 */

function safeUrl(url) {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || url.includes("\\")) {
    return "/feed";
  }
  return url;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 60) : "STRIVY 👀";
  const body = typeof data.body === "string" ? data.body.slice(0, 200) : "";
  if (!body) return;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof data.tag === "string" ? data.tag : "strivy",
      icon: "/favicon.ico",
      data: { url: safeUrl(data.url) },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(safeUrl(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url === url && "focus" in w) return w.focus();
      }
      for (const w of wins) {
        if ("navigate" in w && new URL(w.url).origin === self.location.origin) {
          return w.navigate(url).then((c) => (c ? c.focus() : undefined));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

/*
 * The browser can replace a subscription on its own (keys rotated, push
 * service moved). Re-subscribe with the same server key and save the new
 * endpoint for the signed-in user; the old endpoint is removed by the server
 * the first time it answers 404/410.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  const old = event.oldSubscription;
  const key = old && old.options ? old.options.applicationServerKey : null;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((sub) =>
        fetch("/api/strivy/push/subscribe", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        })
      )
      .catch(() => undefined)
  );
});
