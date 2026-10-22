import type { Metadata } from "next";
import { ResetPasswordForm } from "../reset-password/ResetPasswordForm";
import { AuthScreen } from "../AuthScreen";

/**
 * /set-password — where a new account chooses its first password.
 *
 * Signup collects a name and an email and nothing else; the password is set
 * here, after the emailed link or code has proved the address belongs to the
 * person. That ordering is the point: it means an address cannot be
 * registered with a password by somebody who does not own it.
 *
 * The form is the same component the recovery screen uses, in "create" mode.
 * One form, so the password rules, the strength meter and the confirm field
 * can never drift apart between the two routes.
 */
export const metadata: Metadata = {
  title: "Set your password",
  robots: { index: false, follow: false },
};

export default function SetPasswordPage() {
  return (
    <AuthScreen>
      <ResetPasswordForm mode="create" />
    </AuthScreen>
  );
}
