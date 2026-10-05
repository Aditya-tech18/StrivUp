import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { AuthScreen } from "../AuthScreen";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your StrivUp account and keep your streak alive.",
};

export default function LoginPage() {
  return (
    <AuthScreen>
      {/* The form reads ?redirectTo via useSearchParams, which opts it into
          client-side rendering. Suspense keeps the rest of the page static
          instead of bailing the whole route out of prerendering. */}
      <Suspense
        fallback={
          <div
            className="h-[34rem] w-full max-w-sm animate-pulse rounded-2xl border border-white/10 bg-white/5"
            aria-hidden="true"
          />
        }
      >
        <LoginForm />
      </Suspense>
    </AuthScreen>
  );
}
