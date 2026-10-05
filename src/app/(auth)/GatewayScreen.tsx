/**
 * GatewayScreen — the STRIVUP entry screen, shown at /.
 *
 * Continue as User      → /login
 * Continue as Business  → /business-login (existing biz → dashboard, new → onboarding)
 *
 * Laid out as a centred hero with a rotating word in the headline, per the
 * supplied reference. The palette stays white-and-blue — surface, on-surface
 * and secondary from the token set — rather than the dark treatment the auth
 * screens use, because this is the first thing anyone sees and it should read
 * as bright and open.
 *
 * Both role cards are kept exactly as they were, including where they link.
 * Nothing about the business flow changes here; this is a restyle.
 */
import Link from "next/link";
import { ChevronRight, MoveRight, Store, User } from "lucide-react";
import { MagneticCursor } from "@/components/ui/MagneticCursor";
import { MeshBackground } from "@/components/ui/MeshBackground";
import { RotatingWord } from "@/components/ui/RotatingWord";

/* The words the headline cycles. Each one is something the product actually
   does, so the line stays true whichever word is showing. */
const HEADLINE_WORDS = ["Growth", "Discipline", "Streaks", "Challenges", "Consistency"];

const choiceCard = [
  "group relative flex items-center gap-4 rounded-2xl border border-outline-variant p-5 text-left",
  "bg-surface-container-lowest elev-2 surface-raised lift",
  "hover:border-secondary/40",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
].join(" ");

/* Kept at the card's trailing edge rather than inline after the title: inline,
   a two-line title pushes it to the end of the wrapped line and the two cards
   stop agreeing with each other. */
const chevronCls = [
  "shrink-0 text-on-surface-variant transition-all duration-200",
  "group-hover:translate-x-0.5 group-hover:text-secondary",
].join(" ");

function StrivUpMark() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="#0F172A" />
      <path
        d="M24 36V18M24 18L17 25M24 18L31 25"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="13" r="3" fill="#3B82F6" />
    </svg>
  );
}

export function GatewayScreen() {
  return (
    <MagneticCursor>
      <div className="relative isolate min-h-screen overflow-hidden bg-surface">
        <MeshBackground />

        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-10 px-gutter py-16 md:gap-12">
          {/* ── Eyebrow pill ──────────────────────────────────────────────── */}
          <div className="fade-up flex flex-col items-center gap-5">
            <StrivUpMark />
            <span className="inline-flex items-center gap-2 rounded-full border border-secondary/20 bg-secondary/8 px-4 py-1.5 text-label-sm font-semibold uppercase tracking-[0.18em] text-secondary">
              Build better. Every day.
              <MoveRight size={14} aria-hidden="true" />
            </span>
          </div>

          {/* ── Headline ──────────────────────────────────────────────────── */}
          <header className="fade-up fade-up-1 flex flex-col items-center gap-5 text-center">
            <h1 className="text-hero-mobile text-on-surface md:text-hero">
              <span className="block font-semibold text-on-surface-variant">
                India&apos;s platform for
              </span>
              <RotatingWord words={HEADLINE_WORDS} className="mt-1 w-full text-secondary" />
            </h1>

            <p className="max-w-xl text-balance text-body-lg leading-relaxed text-on-surface-variant">
              Join challenges with a start date and a finish line, prove the work you did, and keep
              the chain unbroken alongside people doing the same.
            </p>
          </header>

          {/* ── Role selection ────────────────────────────────────────────── */}
          <div className="fade-up fade-up-2 grid w-full max-w-2xl gap-3 md:grid-cols-2">
            <Link href="/login" data-magnetic className={choiceCard}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10">
                <User size={22} className="text-secondary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-headline-md font-bold text-on-surface">Continue as User</p>
                <p className="mt-0.5 text-body-md text-on-surface-variant">
                  Join challenges, build streaks, grow with community.
                </p>
              </div>
              <ChevronRight size={20} aria-hidden="true" className={chevronCls} />
            </Link>

            <Link href="/business-login" data-magnetic className={choiceCard}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10">
                <Store size={22} className="text-secondary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-headline-md font-bold text-on-surface">Continue as Business</p>
                <p className="mt-0.5 text-body-md text-on-surface-variant">
                  Create campaigns, verify participants and attract customers.
                </p>
              </div>
              <ChevronRight size={20} aria-hidden="true" className={chevronCls} />
            </Link>
          </div>

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <footer className="fade-up fade-up-2 text-center">
            <p className="text-body-md text-on-surface-variant">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-secondary transition-colors hover:underline"
              >
                Log in
              </Link>
            </p>
          </footer>
        </main>
      </div>
    </MagneticCursor>
  );
}
