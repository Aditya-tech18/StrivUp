import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { ValuePropPanel } from "../ValuePropPanel";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your StrivUp account and keep your streak alive.",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* ── Left: form panel — full width on mobile, half on desktop ── */}
      <section className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 lg:px-16">
        {/* The form reads ?redirectTo via useSearchParams, which opts it into
            client-side rendering. Suspense keeps the rest of the page static
            instead of bailing the whole route out of prerendering. */}
        <Suspense
          fallback={
            <div
              className="h-[32rem] w-full max-w-sm animate-pulse rounded-xl bg-surface-container-low"
              aria-hidden="true"
            />
          }
        >
          <LoginForm />
        </Suspense>
      </section>

      {/* ── Right: value-prop panel — desktop only ─────────────────── */}
      <ValuePropPanel />
    </div>
  );
}
