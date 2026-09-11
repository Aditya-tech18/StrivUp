import type { Metadata } from "next";
import { BusinessLoginForm } from "./BusinessLoginForm";

export const metadata: Metadata = {
  title: "Business Login — STRIVUP",
  description: "Log in to your STRIVUP Business account.",
};

export default function BusinessLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-[#F8F9FC]">
      <BusinessLoginForm />
    </div>
  );
}
