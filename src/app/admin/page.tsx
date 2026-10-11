import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminHomeClient from "./AdminHomeClient";

/**
 * /admin — the admin console home.
 *
 * Authorisation is checked here to decide what to render, and again inside
 * every function this page calls (admin_platform_stats and
 * admin_list_business_applications both re-check is_platform_admin). A
 * non-admin who reaches this URL gets a 404 rather than a "forbidden" page,
 * so the console's existence isn't advertised.
 */
export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: isAdmin } = await supabase.rpc("is_platform_admin", { p_user: user.id });
  if (!isAdmin) notFound();

  return <AdminHomeClient />;
}
