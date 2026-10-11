import { Suspense } from "react";
import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";
import { AuthScreen } from "../AuthScreen";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your StrivUp account and start building better habits today.",
};

export default function SignupPage() {
  return (
    <AuthScreen>
      {/* The form reads ?redirectTo via useSearchParams, which opts it into
          client-side rendering. Suspense keeps the rest of the page static
          instead of bailing the whole route out of prerendering. */}
      <Suspense
        fallback={
          <div
            className="h-[34rem] w-full max-w-sm animate-pulse rounded-2xl border border-outline-variant bg-surface-container-low"
            aria-hidden="true"
          />
        }
      >
        <SignupForm />
      </Suspense>
    </AuthScreen>
  );
}
