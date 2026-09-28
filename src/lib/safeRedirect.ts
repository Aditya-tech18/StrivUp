/**
 * src/lib/safeRedirect.ts
 *
 * One rule for "where should we send this person after they sign in", used by
 * proxy.ts, the login/signup forms and the OAuth callback so they cannot drift
 * apart.
 *
 * `redirectTo` / `next` arrive from the query string and are therefore
 * attacker-controllable, so only same-origin absolute paths are allowed. A
 * value starting with "//" or "/\" is protocol-relative and would send the
 * browser off-site once concatenated onto an origin.
 */

/** Where people land when there is no valid destination to return to. */
export const DEFAULT_REDIRECT = "/feed";

export function safeRedirect(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_REDIRECT;
  if (!raw.startsWith("/")) return DEFAULT_REDIRECT;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_REDIRECT;
  // Never bounce back to an auth screen — that loops.
  if (raw === "/login" || raw === "/signup" || raw.startsWith("/auth/")) {
    return DEFAULT_REDIRECT;
  }
  return raw;
}
