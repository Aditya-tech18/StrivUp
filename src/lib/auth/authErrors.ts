/**
 * src/lib/auth/authErrors.ts
 *
 * Supabase's auth errors are accurate and unhelpful. "Invalid login
 * credentials" is the same string whether the password is wrong, the account
 * does not exist, or — the common case here — the account was created with
 * Google and has no password at all. Every account in the project today is
 * Google-only, so that last case is the one people will actually hit, and
 * telling them to press the Google button is the whole job.
 *
 * Matching is on `code` where Supabase sends one, because the human-readable
 * `message` is not a stable API.
 */

interface AuthErrorLike {
  code?: string;
  message: string;
  status?: number;
}

/** Copy for a failed sign-in / sign-up, in StrivUp's voice. */
export function friendlyAuthError(error: AuthErrorLike): string {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match an account. If you signed up with Google, use “Continue with Google” instead.";

    case "email_not_confirmed":
      return "Your email isn't confirmed yet. Check your inbox for the link we sent you.";

    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Log in instead.";

    case "weak_password":
      return "That password is too easy to guess. Mix in a few more characters.";

    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Wait a minute and try again.";

    case "over_sms_send_rate_limit":
      return "Too many codes requested. Wait a minute before asking for another.";

    case "otp_expired":
      return "That code has expired. Request a new one.";

    case "sms_send_failed":
      return "We couldn't send the code. Check the number and try again.";

    case "phone_provider_disabled":
      // Operator-facing truth, phrased so a user is not left blaming themselves.
      return "Phone sign-in isn't switched on yet. Use Google or email for now.";

    case "signup_disabled":
    case "email_provider_disabled":
      return "Sign-ups with email are switched off right now. Use Google instead.";

    case "validation_failed":
      return "Check the details you entered and try again.";

    default:
      // Unknown codes still have to say something, and Supabase's message is
      // better than a generic shrug.
      return error.message;
  }
}

/**
 * Does this sign-up response describe an account that already exists?
 *
 * Supabase deliberately does not tell you outright, to avoid handing an
 * attacker a list of registered addresses. What it does instead is return a
 * user whose `identities` array is empty. That is the only signal available,
 * and it is the documented one.
 */
export function isExistingUserSignup(user: { identities?: unknown[] | null } | null): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}
