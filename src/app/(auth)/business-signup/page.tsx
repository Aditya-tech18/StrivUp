import type { Metadata } from "next";
import { BusinessSignupForm } from "./BusinessSignupForm";

export const metadata: Metadata = {
  title: "Create Business Account — STRIVUP",
  description: "Start your STRIVUP business account.",
};

export default function BusinessSignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-gutter py-10">
      <BusinessSignupForm />
    </div>
  );
}
