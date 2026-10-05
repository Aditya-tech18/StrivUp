import type { Metadata } from "next";
import { BusinessLoginForm } from "./BusinessLoginForm";
import { AuthScreen } from "../AuthScreen";
import { authCardCls } from "../AuthCard";

export const metadata: Metadata = {
  title: "Business Login — STRIVUP",
  description: "Log in to your STRIVUP Business account.",
};

export default function BusinessLoginPage() {
  // Same shell and same card as the user screens — a visual change only. The
  // form itself, and everything it does, is untouched.
  return (
    <AuthScreen>
      <div className={authCardCls}>
        <BusinessLoginForm />
      </div>
    </AuthScreen>
  );
}
