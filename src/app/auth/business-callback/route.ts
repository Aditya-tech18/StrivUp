import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Set account_type to business on profile
      await supabase
        .from("profiles")
        .update({ account_type: "business" })
        .eq("id", data.user.id);

      // Create business_profile row if not exists
      await supabase
        .from("business_profiles")
        .upsert({
          id: data.user.id,
          business_name: data.user.user_metadata?.full_name ?? null,
          onboarding_step: 1,
          onboarding_done: false,
          verification_status: "draft",
        }, { onConflict: "id", ignoreDuplicates: true });

      // Check if onboarding is done
      const { data: bp } = await supabase
        .from("business_profiles")
        .select("onboarding_done")
        .eq("id", data.user.id)
        .single();

      if (bp?.onboarding_done) {
        return NextResponse.redirect(`${origin}/business/dashboard`);
      }
      return NextResponse.redirect(`${origin}/business/onboarding`);
    }
  }

  return NextResponse.redirect(`${origin}/business-login?error=oauth_failed`);
}
