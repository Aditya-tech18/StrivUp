/**
 * GatewayScreen — the STRIVUP entry screen.
 * Shown at both / (root) and the (auth) group index.
 *
 * Continue as User      → /login
 * Continue as Business  → /business-login (smart: existing biz → dashboard, new → onboarding)
 */
import Link from "next/link";
import { ChevronRight, Store, User } from "lucide-react";

/* The choice cards are the only two things on this screen, so they sit a step
   further off the page than a resting card and lift on hover. */
const choiceCard = [
  "group flex items-center gap-4 rounded-2xl border border-outline-variant p-5",
  "bg-surface-container-lowest elev-2 surface-raised lift",
  "hover:border-outline",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
].join(" ");

export function GatewayScreen() {
  return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-gutter py-10">
        <div className="w-full max-w-sm flex flex-col gap-8">

          {/* Logo + headline */}
          <header className="flex flex-col items-center gap-4 text-center fade-up">
            {/* STRIVUP wordmark — SVG arrow-up style */}
            <div className="flex flex-col items-center gap-1">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-label="STRIVUP logo">
                <rect width="48" height="48" rx="14" fill="#0F172A"/>
                <path d="M24 36V18M24 18L17 25M24 18L31 25" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="24" cy="13" r="3" fill="#3B82F6"/>
              </svg>
              <span className="text-label-sm font-black tracking-[0.2em] text-secondary uppercase">STRIVUP</span>
            </div>

            <h1 className="text-display-mobile text-on-surface leading-tight font-black">
              India&apos;s Platform<br/>for Growth
            </h1>
            <p className="text-body-md text-on-surface-variant max-w-[260px]">
              Build discipline, join challenges, and grow with a community that holds you accountable.
            </p>
          </header>

          {/* Choice cards */}
          <div className="flex flex-col gap-3 fade-up fade-up-1">

            {/* ── Continue as User ── */}
            <Link
              href="/login"
              className={choiceCard}
            >
              <div className="w-11 h-11 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
                <User size={22} className="text-secondary" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-headline-md text-on-surface font-bold">Continue as User</p>
                <p className="text-body-md text-on-surface-variant mt-0.5">
                  Join challenges, build streaks, grow with community.
                </p>
              </div>
              <ChevronRight size={20} className="text-on-surface-variant group-hover:text-on-surface group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
            </Link>

            {/* ── Continue as Business ── */}
            <Link
              href="/business-login"
              className={choiceCard}
            >
              <div className="w-11 h-11 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
                <Store size={22} className="text-secondary" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-headline-md text-on-surface font-bold">Continue as Business</p>
                <p className="text-body-md text-on-surface-variant mt-0.5">
                  Create campaigns, verify participants and attract customers.
                </p>
              </div>
              <ChevronRight size={20} className="text-on-surface-variant group-hover:text-on-surface group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
            </Link>
          </div>

          {/* Footer */}
          <footer className="text-center fade-up fade-up-2">
            <p className="text-body-md text-on-surface-variant">
              Already have an account?{" "}
              <Link href="/login" className="text-secondary font-semibold hover:underline">
                Login
              </Link>
            </p>
          </footer>
        </div>
      </div>
  );
}
