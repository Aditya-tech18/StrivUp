import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const { pathname, searchParams, origin } = request.nextUrl;

  // Intercept stray OAuth codes that land at root /?code=...
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

  // If authenticated user is on a protected app route, check deactivation state
  const isAppRoute = pathname.startsWith("/feed") ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/challenges") ||
    pathname.startsWith("/quests") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/alerts");

  if (user && isAppRoute && pathname !== "/deactivated") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_deactivated")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_deactivated) {
      return NextResponse.redirect(new URL("/deactivated", origin));
    }
  }

  // Redirect /deactivated back to feed if account is active
  if (user && pathname === "/deactivated") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_deactivated")
      .eq("id", user.id)
      .maybeSingle();

    if (profile && !profile.is_deactivated) {
      return NextResponse.redirect(new URL("/feed", origin));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
