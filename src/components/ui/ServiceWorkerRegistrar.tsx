"use client";

/**
 * Registers /sw.js once the page is interactive.
 *
 * Mounted in the root layout, renders nothing. Registration is deferred to the
 * load event so it never competes with the first paint for bandwidth, and it is
 * skipped entirely in development, where a stale worker holding onto an old
 * build is a long and confusing debugging session.
 */

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* An unregistered worker costs offline support, nothing else. */
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
