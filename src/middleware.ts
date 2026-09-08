import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Middleware — runs on every request before page rendering.
 *
 * KEY JOB: Supabase OAuth sometimes redirects to the site root with ?code=
 * (when the redirect URL isn't exactly whitelisted). This middleware catches
 * those codes at ANY path and hands them to /auth/callback to exchange them.
 *
 * It also refreshes the Supabase session cookie on every request so that
 * server components always see a fresh session.
 */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams, origin } = request.nextUrl;

  // ── Intercept stray OAuth codes at the root (e.g. localhost:3000/?code=xxx)
  // Supabase sends ?code= when the redirect URL matches the site root.
  const code = searchParams.get("code");
  if (code && (pathname === "/" || pathname === "")) {
    // Detect business flow: check if there's a pending business intent cookie
    const isBusinessFlow = request.cookies.get("strivup_business_intent")?.value === "1";
    const next = isBusinessFlow ? "/business" : "/feed";

    const callbackUrl = new URL(`${origin}/auth/callback`);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("next", next);
    return NextResponse.redirect(callbackUrl);
  }

  // ── Refresh Supabase session cookie on every request ─────────────────────
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

  // Refresh session — important for keeping auth alive
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
