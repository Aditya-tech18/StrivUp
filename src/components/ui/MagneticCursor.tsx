"use client";

import { useEffect, useRef } from "react";

/**
 * MagneticCursor — the trailing blob that stretches with speed and snaps onto
 * anything marked `data-magnetic`.
 *
 * NO GSAP. The reference builds this on gsap + vecteur, roughly 70 KB gzipped,
 * for an effect that is switched off on touch devices — so every phone pays
 * the download and sees nothing. What the library is actually doing here is a
 * lerp, a spring and some trigonometry, which is the code below. One
 * requestAnimationFrame loop, no dependencies.
 *
 * It never replaces the real cursor. The blob is painted on top with
 * pointer-events: none and the system cursor stays exactly where it was, so
 * nobody loses the affordance they rely on — which is the usual failure of
 * custom cursors.
 *
 * Switched off entirely for coarse pointers and for prefers-reduced-motion. In
 * both cases the component renders its children and nothing else.
 */

interface Spring {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** How hard a magnetic element is pulled toward the pointer. */
const MAGNET_FACTOR = 0.32;
/** Pointer-follow smoothing. Lower is laggier. */
const LERP = 0.16;
/** Spring constants for a magnetic element returning to rest. */
const STIFFNESS = 0.14;
const DAMPING = 0.72;
/** Resting blob diameter, px. */
const SIZE = 28;
/** Speed-to-stretch conversion, and its caps. */
const SPEED_SCALE = 0.022;
const MAX_STRETCH = 0.55;
const MAX_SQUASH = 0.3;

export function MagneticCursor({
  children,
  /** Selector for elements the blob snaps onto and that lean toward the pointer. */
  attribute = "data-magnetic",
}: {
  children: React.ReactNode;
  attribute?: string;
}) {
  const blobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const blob = blobRef.current;
    if (!blob) return;

    // A coarse pointer means a finger: there is no cursor to decorate, and the
    // blob would sit frozen wherever the last tap landed.
    if (window.matchMedia("(pointer: coarse)").matches) return;

    // Reduced motion does not mean "no cursor". The pointer is already moving;
    // what that setting is protecting against is the *extra* motion — the lag,
    // the stretch, the spring overshoot. So the blob stays, pinned exactly to
    // the pointer with no easing and no deformation. Switching the feature off
    // entirely, as the first version did, left anyone with animation effects
    // disabled wondering why nothing happened.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lerp = reduced ? 1 : LERP;

    blob.style.opacity = "0";

    const pointer = { x: -200, y: -200 };
    const current = { x: -200, y: -200 };
    const previous = { x: -200, y: -200 };
    let hovered: HTMLElement | null = null;
    let seenPointer = false;

    // Each magnetic element gets its own spring, driven by the same loop.
    const magnets = new Map<HTMLElement, Spring>();
    document.querySelectorAll<HTMLElement>(`[${attribute}]`).forEach((el) => {
      magnets.set(el, { x: 0, y: 0, vx: 0, vy: 0 });
    });

    function onPointerMove(event: PointerEvent) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!seenPointer) {
        // Jump to the first known position instead of flying in from -200.
        seenPointer = true;
        current.x = previous.x = pointer.x;
        current.y = previous.y = pointer.y;
        if (blob) blob.style.opacity = "1";
      }
    }

    const onPointerLeave = () => {
      if (blob) blob.style.opacity = "0";
    };
    const onPointerEnter = () => {
      if (blob && seenPointer) blob.style.opacity = "1";
    };

    function frame() {
      raf = requestAnimationFrame(frame);
      if (!blob) return;

      if (hovered) {
        // Pinned to the element: sit on its centre at its size, no stretch.
        const b = hovered.getBoundingClientRect();
        current.x = b.left + b.width / 2;
        current.y = b.top + b.height / 2;
        previous.x = current.x;
        previous.y = current.y;
        blob.style.transform = `translate(${current.x}px, ${current.y}px) translate(-50%, -50%)`;
      } else {
        current.x += (pointer.x - current.x) * lerp;
        current.y += (pointer.y - current.y) * lerp;

        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        previous.x = current.x;
        previous.y = current.y;

        if (reduced) {
          blob.style.transform = `translate(${current.x}px, ${current.y}px) translate(-50%, -50%)`;
        } else {
          // Stretch along the direction of travel — the "liquid" part.
          const speed = Math.hypot(dx, dy) * SPEED_SCALE;
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          const sx = 1 + Math.min(speed, MAX_STRETCH);
          const sy = 1 - Math.min(speed, MAX_SQUASH);

          blob.style.transform =
            `translate(${current.x}px, ${current.y}px) translate(-50%, -50%) ` +
            `rotate(${angle}deg) scale(${sx}, ${sy})`;
        }
      }

      // Magnetic elements lean toward the pointer and spring back on release.
      magnets.forEach((spring, el) => {
        const b = el.getBoundingClientRect();
        const isHovered = el === hovered;
        // Reduced motion keeps the snap-on highlight but drops the lean, which
        // is the part that moves something the person did not move themselves.
        const pull = reduced ? 0 : MAGNET_FACTOR;
        const targetX = isHovered ? (pointer.x - (b.left + b.width / 2)) * pull : 0;
        const targetY = isHovered ? (pointer.y - (b.top + b.height / 2)) * pull : 0;

        spring.vx = (spring.vx + (targetX - spring.x) * STIFFNESS) * DAMPING;
        spring.vy = (spring.vy + (targetY - spring.y) * STIFFNESS) * DAMPING;
        spring.x += spring.vx;
        spring.y += spring.vy;

        // Park exactly at rest rather than jittering forever at sub-pixel
        // amplitudes, which keeps the compositor idle once nothing is moving.
        if (!isHovered && Math.abs(spring.x) < 0.01 && Math.abs(spring.y) < 0.01) {
          spring.x = 0;
          spring.y = 0;
          spring.vx = 0;
          spring.vy = 0;
          el.style.translate = "";
          return;
        }
        el.style.translate = `${spring.x}px ${spring.y}px`;
      });
    }

    const enterHandlers = new Map<HTMLElement, () => void>();
    const leaveHandlers = new Map<HTMLElement, () => void>();

    magnets.forEach((_spring, el) => {
      const onEnter = () => {
        hovered = el;
        const b = el.getBoundingClientRect();
        const radius = window.getComputedStyle(el).borderRadius;
        if (!blob) return;
        // Morph to the element's own shape. Transitioned in CSS, so the blob
        // grows into the button rather than snapping.
        blob.style.width = `${b.width + 16}px`;
        blob.style.height = `${b.height + 16}px`;
        blob.style.borderRadius = radius;
      };
      const onLeave = () => {
        hovered = null;
        if (!blob) return;
        blob.style.width = `${SIZE}px`;
        blob.style.height = `${SIZE}px`;
        blob.style.borderRadius = "9999px";
      };
      enterHandlers.set(el, onEnter);
      leaveHandlers.set(el, onLeave);
      el.addEventListener("pointerenter", onEnter);
      el.addEventListener("pointerleave", onLeave);
    });

    let raf = requestAnimationFrame(frame);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("pointerenter", onPointerEnter);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("pointerenter", onPointerEnter);
      enterHandlers.forEach((handler, el) => el.removeEventListener("pointerenter", handler));
      leaveHandlers.forEach((handler, el) => el.removeEventListener("pointerleave", handler));
      // Leave no transform behind on elements this decorated.
      magnets.forEach((_s, el) => {
        el.style.translate = "";
      });
    };
  }, [attribute]);

  return (
    <>
      <div
        ref={blobRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: SIZE,
          height: SIZE,
          borderRadius: 9999,
          // Exclusion against a light page resolves to near-black, so the blob
          // stays visible over the mesh background and inverts cleanly over
          // the dark logo tile and the cards.
          backgroundColor: "#ffffff",
          mixBlendMode: "exclusion",
          pointerEvents: "none",
          zIndex: 60,
          willChange: "transform, width, height",
          transition:
            "width 300ms cubic-bezier(0.22, 1, 0.36, 1), height 300ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms linear",
        }}
      />
      {children}
    </>
  );
}
