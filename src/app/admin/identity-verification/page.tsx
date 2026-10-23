import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import IdentityVerificationClient from "./IdentityVerificationClient";

/**
 * /admin/identity-verification — the blue-seal review queue.
 *
 * The check here decides which page to render. It is NOT the security
 * boundary: admin_list_identity_requests and admin_review_identity_request
 * both re-check is_platform_admin(auth.uid()) inside the database, so a
 * request forged straight at the RPC gets nothing even if it never passes
 * through this file.
 */
export const dynamic = "force-dynamic";

export default async function AdminIdentityVerificationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: isAdmin } = await supabase.rpc("is_platform_admin", { p_user: user.id });
  if (!isAdmin) notFound();

  return <IdentityVerificationClient />;
}
