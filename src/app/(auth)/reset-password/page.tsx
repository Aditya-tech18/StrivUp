import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { AuthScreen } from "../AuthScreen";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthScreen showPanel={false}>
      <ResetPasswordForm />
    </AuthScreen>
  );
}
