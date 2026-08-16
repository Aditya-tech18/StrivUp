"use client";

import { useEffect, useRef, useState } from "react";

interface UseIntersectionObserverOptions {
  threshold?: number;
  rootMargin?: string;
  /** Once visible, stay visible (don't re-hide on scroll-out). Default true. */
  once?: boolean;
}

/**
 * useIntersectionObserver — returns a [ref, isVisible] tuple.
 *
 * Attach `ref` to any DOM element; `isVisible` flips to true when the element
 * enters the viewport. With `once: true` (default) it never goes back to false,
 * which is the correct behaviour for scroll-triggered fade-in animations.
 *
 * Usage:
 *   const [ref, visible] = useIntersectionObserver({ threshold: 0.1 });
 *   return <div ref={ref} className={visible ? "opacity-100" : "opacity-0"} />;
 */
export function useIntersectionObserver<T extends Element = HTMLDivElement>(
  options: UseIntersectionObserverOptions = {}
): [React.RefObject<T | null>, boolean] {
  const { threshold = 0.12, rootMargin = "0px", once = true } = options;
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, isVisible];
}
