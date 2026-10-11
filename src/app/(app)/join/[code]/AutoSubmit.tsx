"use client";

import { useEffect, useRef } from "react";

/**
 * Submits the form it is dropped into, once, on mount.
 *
 * Used when someone taps Join while signed out: they go to /login, come back
 * with ?auto=1, and the accept fires without making them tap the same button
 * a second time. Rendering it only for that case is what keeps a plain visit
 * to an invite link from joining by itself.
 *
 * It submits a real form rather than calling the Server Action directly so
 * the no-JavaScript path still works: without this component the button is
 * simply there to be pressed.
 */
export function AutoSubmit() {
  const marker = useRef<HTMLSpanElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    marker.current?.closest("form")?.requestSubmit();
  }, []);

  return <span ref={marker} hidden aria-hidden="true" />;
}
