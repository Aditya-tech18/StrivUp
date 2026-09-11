import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const { pathname, searchParams, origin } = request.nextUrl;

  // Intercept stray OAuth codes landing at root /?code=...
  const code = searchParams.get("code");
  if (code && pathname === "/") {
    const isBusinessFlow = request.cookies.get("strivup_business_intent")?.value === "1";
    const next = isBusinessFlow ? "/business" : "/feed";
    const callbackUrl = new URL(`${origin}/auth/callback`);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("next", next);
    return NextResponse.redirect(callbackUrl);
  }

  // Refresh Supabase session on every request
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Protected app routes
  const isAppRoute =
    pathname.startsWith("/feed") ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/challenges") ||
    pathname.startsWith("/quests") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/alerts") ||
    pathname.startsWith("/creator");

  // Unauthenticated → login
  if (!user && isAppRoute) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  // Deactivation check — only if column exists (fails silently if migration not run)
  if (user && isAppRoute && pathname !== "/deactivated") {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_deactivated")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.is_deactivated === true) {
        return NextResponse.redirect(new URL("/deactivated", origin));
      }
    } catch {
      // Column not yet added — skip check, allow access
    }
  }

  // If deactivated page accessed by active user → redirect home
  if (user && pathname === "/deactivated") {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_deactivated")
        .eq("id", user.id)
        .maybeSingle();

      if (profile && profile.is_deactivated !== true) {
        return NextResponse.redirect(new URL("/feed", origin));
      }
    } catch {
      // Column missing — redirect to feed
      return NextResponse.redirect(new URL("/feed", origin));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
