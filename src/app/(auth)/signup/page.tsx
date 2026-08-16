import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";
import { ValuePropPanel } from "../ValuePropPanel";

export const metadata: Metadata = {
  title: "Sign Up — STRIV",
  description: "Create your STRIV account and start building better habits today.",
};

export default function SignupPage() {
  return (
    <div className="min-h-screen flex">
      {/* ── Left: form panel — full width on mobile, half on desktop ── */}
      <section className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 lg:px-16">
        <SignupForm />
      </section>

      {/* ── Right: value-prop panel — desktop only ─────────────────── */}
      <ValuePropPanel />
    </div>
  );
}
