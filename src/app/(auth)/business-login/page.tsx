import type { Metadata } from "next";
import { BusinessLoginForm } from "./BusinessLoginForm";

export const metadata: Metadata = {
  title: "Business Login — STRIVUP",
  description: "Log in to your STRIVUP Business account.",
};

export default function BusinessLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10 bg-surface">
      <BusinessLoginForm />
    </div>
  );
}
