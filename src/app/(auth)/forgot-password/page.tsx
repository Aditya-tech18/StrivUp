import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { AuthScreen } from "../AuthScreen";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Request a link to set a new StrivUp password.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthScreen>
      <ForgotPasswordForm />
    </AuthScreen>
  );
}
