import { Suspense } from "react";
import type { Metadata } from "next";
import { PhoneAuthForm } from "./PhoneAuthForm";
import { ValuePropPanel } from "../ValuePropPanel";

export const metadata: Metadata = {
  title: "Continue with mobile",
  description: "Sign in to StrivUp with your mobile number.",
};

export default function PhoneAuthPage() {
  return (
    <div className="flex min-h-screen">
      <section className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        {/* The form reads ?redirectTo, which opts it into client rendering.
            Suspense keeps the rest of the route static. */}
        <Suspense
          fallback={
            <div
              className="h-[32rem] w-full max-w-sm animate-pulse rounded-xl bg-surface-container-low"
              aria-hidden="true"
            />
          }
        >
          <PhoneAuthForm />
        </Suspense>
      </section>
      <ValuePropPanel />
    </div>
  );
}
