import type { Metadata } from "next";
import { BusinessSignupForm } from "./BusinessSignupForm";

export const metadata: Metadata = {
  title: "Create Business Account — STRIVUP",
  description: "Start your STRIVUP business account and create challenge campaigns.",
};

export default function BusinessSignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10 bg-surface">
      <BusinessSignupForm />
    </div>
  );
}
