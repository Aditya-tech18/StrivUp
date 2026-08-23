import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * proxy.ts — unified edge middleware for StrivUp.
 *
 * Responsibilities (in order):
 *  1. Session refresh: re-validates the Supabase auth token on every matched
 *     request so that server components can call getUser() and get a real user.
 *  2. Auth guard: unauthenticated visitors are redirected to /login
 *     (preserving the intended URL as ?redirectTo=…).
 *  3. Profile-completion gate: authenticated users whose profile is not yet
 *     complete are redirected to /profile/setup until they finish onboarding.
 *
 * Excluded from ALL checks (no proxy runs):
 *  - / and /login, /signup, /forgot-password, /auth/* (auth pages)
 *  - /profile/setup (avoid redirect loop)
 *  - /dev/components (dev tooling, has its own runtime guard)
 *  - All Next.js internals (_next/static, _next/image, favicon, etc.)
 *
 * NOTE: In Next.js 16 the file must be named proxy.ts (not middleware.ts).
 * middleware.ts is deprecated and, if present alongside proxy.ts, takes
 * precedence and breaks all routing. Delete src/middleware.ts if it exists.
 */

// Routes that bypass every check in this file entirely.
const EXCLUDED_PREFIXES = [
  "/profile/setup",
  "/login",
  "/signup",
  "/forgot-password",
  "/auth",
  "/dev/components",
  "/_next",
  "/favicon.ico",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fast-path: excluded routes pass straight through.
  if (EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Build a mutable response so we can write refreshed auth cookies.
  let supabaseResponse = NextResponse.next({ request });

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

  // ── 1. Auth guard ─────────────────────────────────────────────────────────
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 2. Profile-completion gate ────────────────────────────────────────────
  // Allow /profile itself through so users are never stuck
  if (pathname !== "/profile" && !pathname.startsWith("/profile/")) {
    // profiles is publicly readable — only non-PII columns live here
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, profile_completed")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.warn(
        "[proxy] profiles query failed — has 20260823_profile_completion.sql been run?",
        profileError.message
      );
      return supabaseResponse;
    }

    // profile_private holds PII (age, phone_verified) — owner-only RLS
    const { data: priv, error: privError } = await supabase
      .from("profile_private")
      .select("age, phone_verified")
      .eq("id", user.id)
      .maybeSingle();

    if (privError) {
      console.warn(
        "[proxy] profile_private query failed — has the profile_private migration been run?",
        privError.message
      );
      return supabaseResponse;
    }

    const { count: interestCount, error: interestError } = await supabase
      .from("user_interests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (interestError) {
      console.warn(
        "[proxy] user_interests check failed — has 20260823_profile_completion.sql been run?",
        interestError.message
      );
      return supabaseResponse;
    }

    const complete =
      profile?.profile_completed &&
      Boolean(profile.full_name?.trim()) &&
      Boolean(priv?.age) &&
      Boolean(user.email_confirmed_at) &&
      (interestCount ?? 0) >= 3;

    if (!complete) {
      const setupUrl = request.nextUrl.clone();
      setupUrl.pathname = "/profile/setup";
      return NextResponse.redirect(setupUrl);
    }
  }

  // ── 3. Pass through with refreshed session cookies ────────────────────────
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all (app) shell routes so the session is always refreshed before
     * server components render — this is what allows getUser() to return a
     * real user in server components like ExplorePage.
     *
     * Explicitly excluded (no proxy runs on these):
     *  - auth pages: /, /login, /signup, /forgot-password, /auth/*
     *  - profile setup: /profile/setup (handled by EXCLUDED_PREFIXES above)
     *  - dev tooling: /dev/components
     *  - Next.js internals: _next/*, favicon.ico, public assets
     */
    "/feed/:path*",
    "/explore/:path*",
    "/explore",
    "/challenges/:path*",
    "/creator/:path*",
    "/alerts/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/profile",
  ],
};
