/**
 * (auth)/page.tsx — STRIV Gateway / Entry screen.
 *
 * Two-card selection:
 *  • "Continue as User"     → /login  (active)
 *  • "Continue as Business" → disabled, Coming Soon badge
 *
 * Background: bg-surface (light) from the auth layout shell.
 * The primary-container dark navy is used only as the logo-mark accent square.
 * Icons: lucide-react (Flame, User, Store, ChevronRight).
 * Animation: staggered fade-up on mount via CSS keyframes defined inline.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Flame, Store, User } from "lucide-react";
import { Badge } from "@/components/ui";

export const metadata: Metadata = {
  title: "STRIV — Join the Growth Revolution",
  description:
    "Build Communities, Create Challenges, and Grow with Consistency on STRIV.",
};

/* ── Inline keyframe animation helpers ─────────────────────────────────── */
const fadeUpStyle = (delay: string): React.CSSProperties => ({
  animationName: "striv-fade-up",
  animationDuration: "0.5s",
  animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
  animationFillMode: "both",
  animationDelay: delay,
});

export default function GatewayPage() {
  return (
    <>
      {/* Keyframe definition — SSR-safe */}
      <style>{`
        @keyframes striv-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>

      <div className="min-h-screen flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm flex flex-col gap-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header
          className="flex flex-col items-center text-center gap-4"
          style={fadeUpStyle("0ms")}
        >
          {/* Logo mark — dark navy accent square with flame icon */}
          <div
            className="w-16 h-16 rounded-xl bg-primary-container flex items-center justify-center"
            aria-label="STRIV logo"
          >
            <Flame size={32} className="text-on-primary" aria-hidden="true" />
          </div>

          {/* Brand name */}
          <p className="type-label-caps text-secondary tracking-widest">
            STRIV
          </p>

          {/* Headline */}
          <h1 className="type-display-lg text-on-background leading-tight">
            India&apos;s Platform<br />for Growth
          </h1>

          {/* Subtext */}
          <p className="type-body-md text-on-surface-variant max-w-[260px]">
            Unlock your peak performance through systematic discipline and
            community-driven quests.
          </p>
        </header>

        {/* ── Selection cards ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">

          {/* Card 1 — Continue as User (active) */}
          <div style={fadeUpStyle("80ms")}>
            <Link
              href="/login"
              className={[
                "group flex items-center gap-4 rounded-xl p-5",
                "bg-surface-container-low border border-outline-variant",
                "hover:bg-surface-container hover:border-outline",
                "active:scale-[0.98]",
                "transition-all duration-200 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
              ].join(" ")}
            >
              {/* Icon */}
              <div className="w-11 h-11 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                <User size={22} className="text-secondary" aria-hidden="true" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="type-headline-sm text-on-surface">
                  Continue as User
                </p>
                <p className="type-body-md text-on-surface-variant mt-0.5">
                  Build Communities, Create Challenges, Grow with consistency
                </p>
              </div>

              {/* Chevron */}
              <ChevronRight
                size={20}
                className="text-on-surface-variant group-hover:text-on-surface group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0"
                aria-hidden="true"
              />
            </Link>
          </div>

          {/* Card 2 — Continue as Business (disabled / Coming Soon) */}
          <div style={fadeUpStyle("160ms")}>
            <div
              className={[
                "flex items-center gap-4 rounded-xl p-5",
                "bg-surface-container-low border border-outline-variant",
                "opacity-50 cursor-not-allowed select-none",
              ].join(" ")}
              aria-disabled="true"
              role="button"
              tabIndex={-1}
              aria-label="Continue as Business — coming soon"
            >
              {/* Icon */}
              <div className="w-11 h-11 rounded-lg bg-surface-variant flex items-center justify-center flex-shrink-0">
                <Store size={22} className="text-on-surface-variant" aria-hidden="true" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="type-headline-sm text-on-surface">
                    Continue as Business
                  </p>
                  <Badge variant="outline" className="shrink-0">
                    Coming soon
                  </Badge>
                </div>
                <p className="type-body-md text-on-surface-variant mt-0.5">
                  Create challenge campaigns, attract customers and build loyal
                  communities.
                </p>
              </div>

              {/* Chevron */}
              <ChevronRight
                size={20}
                className="text-on-surface-variant flex-shrink-0"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <footer className="text-center" style={fadeUpStyle("240ms")}>
          <p className="type-body-md text-on-surface-variant">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-secondary font-semibold hover:text-secondary-container underline underline-offset-2 transition-colors duration-150"
            >
              Login
            </Link>
          </p>
        </footer>

      </div>
      </div>
    </>
  );
}
