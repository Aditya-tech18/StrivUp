import type { Metadata } from "next";
import { BusinessSignupForm } from "./BusinessSignupForm";
import { AuthScreen } from "../AuthScreen";
import { authCardCls } from "../AuthCard";

export const metadata: Metadata = {
  title: "Create Business Account — STRIVUP",
  description: "Start your STRIVUP business account.",
};

export default function BusinessSignupPage() {
  // Same shell and same card as the user screens — a visual change only. The
  // form itself, and everything it does, is untouched.
  return (
    <AuthScreen>
      <div className={authCardCls}>
        <BusinessSignupForm />
      </div>
    </AuthScreen>
  );
}
