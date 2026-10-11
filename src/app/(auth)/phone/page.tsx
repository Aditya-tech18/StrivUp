import { Suspense } from "react";
import type { Metadata } from "next";
import { PhoneAuthForm } from "./PhoneAuthForm";
import { AuthScreen } from "../AuthScreen";

export const metadata: Metadata = {
  title: "Continue with mobile",
  description: "Sign in to StrivUp with your mobile number.",
  // Unlinked from login and signup while Supabase's phone provider is off.
  // Keeping it out of the index stops it being found before SMS is live.
  robots: { index: false, follow: false },
};

export default function PhoneAuthPage() {
  return (
    <AuthScreen>
      <Suspense
        fallback={
          <div
            className="h-[34rem] w-full max-w-sm animate-pulse rounded-2xl border border-outline-variant bg-surface-container-low"
            aria-hidden="true"
          />
        }
      >
        <PhoneAuthForm />
      </Suspense>
    </AuthScreen>
  );
}
