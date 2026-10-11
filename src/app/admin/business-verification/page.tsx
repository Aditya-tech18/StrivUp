import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BusinessVerificationClient from "./BusinessVerificationClient";

/**
 * /admin/business-verification — the blue-tick review queue.
 *
 * Authorisation is checked server-side here AND again in the database: every
 * function this page calls re-checks is_platform_admin(auth.uid()), so a
 * forged client request gets nothing even if it reaches the RPC directly.
 * This check exists to render the right page, not to be the security boundary.
 */
export const dynamic = "force-dynamic";

export default async function AdminBusinessVerificationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: isAdmin } = await supabase.rpc("is_platform_admin", { p_user: user.id });
  if (!isAdmin) notFound();

  return <BusinessVerificationClient />;
}
