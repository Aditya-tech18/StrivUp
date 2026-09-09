/**
 * GatewayScreen — the STRIVUP entry screen.
 * Shown at both / (root) and the (auth) group index.
 *
 * Continue as User      → /login
 * Continue as Business  → /business-login (smart: existing biz → dashboard, new → onboarding)
 */
"use client";

import Link from "next/link";
import { ChevronRight, Store, User } from "lucide-react";

const fadeUpStyle = (delay: string): React.CSSProperties => ({
  animationName: "striv-fade-up",
  animationDuration: "0.5s",
  animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
  animationFillMode: "both",
  animationDelay: delay,
});

export function GatewayScreen() {
  return (
    <>
      <style>{`
        @keyframes striv-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="min-h-screen bg-surface flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm flex flex-col gap-8">

          {/* Logo + headline */}
          <header className="flex flex-col items-center text-center gap-4" style={fadeUpStyle("0ms")}>
            {/* STRIVUP wordmark — SVG arrow-up style */}
            <div className="flex flex-col items-center gap-1">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-label="STRIVUP logo">
                <rect width="48" height="48" rx="14" fill="#0F172A"/>
                <path d="M24 36V18M24 18L17 25M24 18L31 25" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="24" cy="13" r="3" fill="#3B82F6"/>
              </svg>
              <span className="text-[11px] font-black tracking-[0.2em] text-secondary uppercase">STRIVUP</span>
            </div>

            <h1 className="type-display-lg text-on-surface leading-tight font-black">
              India&apos;s Platform<br/>for Growth
            </h1>
            <p className="type-body-md text-on-surface-variant max-w-[260px]">
              Build discipline, join challenges, and grow with a community that holds you accountable.
            </p>
          </header>

          {/* Choice cards */}
          <div className="flex flex-col gap-3" style={fadeUpStyle("80ms")}>

            {/* ── Continue as User ── */}
            <Link
              href="/login"
              className="group flex items-center gap-4 rounded-2xl p-5 bg-surface-container-low border border-outline-variant hover:bg-surface-container hover:border-outline active:scale-[0.98] transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
            >
              <div className="w-11 h-11 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
                <User size={22} className="text-secondary" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="type-headline-sm text-on-surface font-bold">Continue as User</p>
                <p className="type-body-md text-on-surface-variant mt-0.5">
                  Join challenges, build streaks, grow with community.
                </p>
              </div>
              <ChevronRight size={20} className="text-on-surface-variant group-hover:text-on-surface group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
            </Link>

            {/* ── Continue as Business ── */}
            <Link
              href="/business-login"
              className="group flex items-center gap-4 rounded-2xl p-5 bg-surface-container-low border border-outline-variant hover:bg-surface-container hover:border-outline active:scale-[0.98] transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
            >
              <div className="w-11 h-11 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
                <Store size={22} className="text-secondary" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="type-headline-sm text-on-surface font-bold">Continue as Business</p>
                <p className="type-body-md text-on-surface-variant mt-0.5">
                  Create campaigns, verify participants and attract customers.
                </p>
              </div>
              <ChevronRight size={20} className="text-on-surface-variant group-hover:text-on-surface group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
            </Link>
          </div>

          {/* Footer */}
          <footer className="text-center" style={fadeUpStyle("160ms")}>
            <p className="type-body-md text-on-surface-variant">
              Already have an account?{" "}
              <Link href="/login" className="text-secondary font-semibold hover:underline">
                Login
              </Link>
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
