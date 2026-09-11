import type { Metadata } from "next";
import { BusinessSignupForm } from "./BusinessSignupForm";

export const metadata: Metadata = {
  title: "Create Business Account — STRIVUP",
  description: "Start your STRIVUP business account.",
};

export default function BusinessSignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-surface">
      <BusinessSignupForm />
    </div>
  );
}
