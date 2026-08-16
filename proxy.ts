import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * proxy.ts — Route protection for authenticated (app) routes.
 *
 * Guards every route matched below:
 *  - /feed and all sub-paths
 *  (Add further (app) routes here as they are built.)
 *
 * Excluded from the matcher (no proxy runs):
 *  - / (auth gateway)
 *  - /login, /signup, /forgot-password (auth pages)
 *  - /auth/callback (OAuth callback)
 *  - /dev/components (has its own runtime prod guard)
 *  - All Next.js internals (_next/static, _next/image, favicon, etc.)
 *
 * Session refresh: every matched request also refreshes the Supabase
 * session cookie so tokens stay alive on active users.
 */
export async function proxy(request: NextRequest) {
  // Build a response we can mutate (to write refreshed cookies).
  let supabaseResponse = NextResponse.next({ request });

  // Create a lightweight server client scoped to this proxy invocation.
  // Proxy cannot use the standard server.ts helper (it relies on next/headers
  // which is not available in the proxy edge context) so we inline the setup.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to both the request and the outgoing response so the
          // refreshed token is visible to the rest of the pipeline.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: always call getUser() — never getSession() — in proxy.
  // getUser() validates the token server-side; getSession() reads only the
  // cookie and can be spoofed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Unauthenticated — redirect to /login, preserving the intended URL so
    // the login page can redirect back after sign-in (future enhancement).
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // User is authenticated — return the (possibly cookie-refreshed) response.
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all (app) shell routes. Currently only /feed is built; extend
     * this list as new authenticated routes are added.
     *
     * Explicitly excluded (no proxy):
     *  - auth pages: /, /login, /signup, /forgot-password, /auth/*
     *  - dev tooling: /dev/components
     *  - Next.js internals: _next/*, favicon.ico, public assets
     */
    "/feed/:path*",
  ],
};
