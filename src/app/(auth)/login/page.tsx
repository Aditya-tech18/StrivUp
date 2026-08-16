import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { ValuePropPanel } from "../ValuePropPanel";

export const metadata: Metadata = {
  title: "Login — STRIV",
  description: "Log in to your STRIV account and keep your streak alive.",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* ── Left: form panel — full width on mobile, half on desktop ── */}
      <section className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 lg:px-16">
        <LoginForm />
      </section>

      {/* ── Right: value-prop panel — desktop only ─────────────────── */}
      <ValuePropPanel />
    </div>
  );
}
