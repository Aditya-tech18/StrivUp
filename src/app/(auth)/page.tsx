/**
 * (auth)/page.tsx — STRIVUP Gateway / Entry screen.
 * Continue as User  → /login
 * Continue as Business → /business/onboarding (checks existing profile first)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Flame, Store, User } from "lucide-react";

export const metadata: Metadata = {
  title: "STRIVUP — Join the Growth Revolution",
  description: "Build Communities, Create Challenges, and Grow with Consistency on STRIVUP.",
};

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
      <style>{`
        @keyframes striv-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>

      <div className="min-h-screen flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm flex flex-col gap-8">

          <header className="flex flex-col items-center text-center gap-4" style={fadeUpStyle("0ms")}>
            <div className="w-16 h-16 rounded-xl bg-primary-container flex items-center justify-center" aria-label="STRIVUP logo">
              <Flame size={32} className="text-on-primary" aria-hidden="true" />
            </div>
            <p className="type-label-caps text-secondary tracking-widest">STRIVUP</p>
            <h1 className="type-display-lg text-on-background leading-tight">India&apos;s Platform<br />for Growth</h1>
            <p className="type-body-md text-on-surface-variant max-w-[260px]">
              Unlock your peak performance through systematic discipline and community-driven quests.
            </p>
          </header>

          <div className="flex flex-col gap-3">
            {/* Continue as User */}
            <div style={fadeUpStyle("80ms")}>
              <Link href="/login"
                className="group flex items-center gap-4 rounded-xl p-5 bg-surface-container-low border border-outline-variant hover:bg-surface-container hover:border-outline active:scale-[0.98] transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
              >
                <div className="w-11 h-11 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                  <User size={22} className="text-secondary" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="type-headline-sm text-on-surface">Continue as User</p>
                  <p className="type-body-md text-on-surface-variant mt-0.5">Build Communities, Create Challenges, Grow with consistency</p>
                </div>
                <ChevronRight size={20} className="text-on-surface-variant group-hover:text-on-surface group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0" aria-hidden="true" />
              </Link>
            </div>

            {/* Continue as Business — full auth flow */}
            <div style={fadeUpStyle("160ms")}>
              <Link href="/business-signup"
                className="group flex items-center gap-4 rounded-xl p-5 bg-surface-container-low border border-outline-variant hover:bg-surface-container hover:border-outline active:scale-[0.98] transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
              >
                <div className="w-11 h-11 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                  <Store size={22} className="text-secondary" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="type-headline-sm text-on-surface">Continue as Business</p>
                  <p className="type-body-md text-on-surface-variant mt-0.5">
                    Create challenge campaigns, attract customers and build loyal communities.
                  </p>
                </div>
                <ChevronRight size={20} className="text-on-surface-variant group-hover:text-on-surface group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <footer className="text-center" style={fadeUpStyle("240ms")}>
            <p className="type-body-md text-on-surface-variant">
              Already have an account?{" "}
              <Link href="/login" className="text-secondary font-semibold hover:text-secondary-container underline underline-offset-2 transition-colors duration-150">
                Login
              </Link>
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
