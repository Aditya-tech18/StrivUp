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
  if (raw.startsWith("//") || raw.includes("\\")) return DEFAULT_REDIRECT;

  // Validate the destination as a browser does: dot segments, tabs and
  // newlines can change the path or turn it into a protocol-relative URL.
  const origin = "https://strivup.invalid";
  let url: URL;
  let pathname: string;
  try {
    url = new URL(raw, origin);
    pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "");
  } catch {
    return DEFAULT_REDIRECT;
  }
  if (url.origin !== origin || url.pathname.startsWith("//")) return DEFAULT_REDIRECT;

  // Check the path even when the link includes a query string or fragment.
  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/")
  ) {
    return DEFAULT_REDIRECT;
  }
  return url.pathname + url.search + url.hash;
}
