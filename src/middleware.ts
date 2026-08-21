import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Redirects authenticated users with an incomplete profile to
 * /profile/setup, on every route EXCEPT the excluded list below (to avoid
 * a redirect loop and to leave auth/static routes untouched).
 */
const EXCLUDED_PREFIXES = [
  "/profile/setup",
  "/login",
  "/signup",
  "/auth",
  "/_next",
  "/favicon.ico",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthenticated visitors are handled by each page's own auth check.
  if (!user) return response;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, age, phone_verified, profile_completed")
    .eq("id", user.id)
    .maybeSingle();

  const { count: interestCount } = await supabase
    .from("user_interests")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const complete =
    profile?.profile_completed &&
    Boolean(profile.full_name?.trim()) &&
    Boolean(profile.age) &&
    Boolean(user.email_confirmed_at) &&
    Boolean(profile.phone_verified) &&
    (interestCount ?? 0) >= 3;

  if (!complete) {
    const url = request.nextUrl.clone();
    url.pathname = "/profile/setup";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and Next internals,
     * so the profile-completion check runs on real app pages.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
