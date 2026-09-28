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

  // Protected routes (user app, business dashboard, admin console)
  const isAppRoute =
    pathname.startsWith("/feed") ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/challenges") ||
    pathname.startsWith("/quests") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/alerts") ||
    pathname.startsWith("/creator") ||
    pathname.startsWith("/business") ||
    pathname.startsWith("/admin");

  // Unauthenticated → login
  if (!user && isAppRoute) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  // Account state: self-deactivation (is_deactivated) or admin enforcement
  // (account_status). account_status arrives with the roles migration; if it
  // isn't applied yet, fall back to the self-deactivation check alone.
  if (user && (isAppRoute || pathname === "/deactivated")) {
    let blocked = false;
    try {
      const first = await supabase
        .from("profiles").select("is_deactivated, account_status").eq("id", user.id).maybeSingle();
      const profile = first.error
        ? (await supabase.from("profiles").select("is_deactivated").eq("id", user.id).maybeSingle()).data
        : first.data;
      const p = profile as { is_deactivated?: boolean; account_status?: string } | null;
      blocked = p?.is_deactivated === true || (!!p?.account_status && p.account_status !== "active");
    } catch {
      blocked = false;
    }
    if (blocked && pathname !== "/deactivated") return NextResponse.redirect(new URL("/deactivated", origin));
    if (!blocked && pathname === "/deactivated") return NextResponse.redirect(new URL("/feed", origin));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
