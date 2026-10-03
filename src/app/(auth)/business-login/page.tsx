import type { Metadata } from "next";
import { BusinessLoginForm } from "./BusinessLoginForm";

export const metadata: Metadata = {
  title: "Business Login — STRIVUP",
  description: "Log in to your STRIVUP Business account.",
};

export default function BusinessLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-gutter py-10">
      <BusinessLoginForm />
    </div>
  );
}
