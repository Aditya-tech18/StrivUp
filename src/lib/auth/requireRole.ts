/**
 * Server-side guards for admin pages. A failed check renders a 404 so the
 * admin console's existence isn't revealed. Data access is additionally
 * protected by RLS and the SECURITY DEFINER admin functions.
 */
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewerRole, type ViewerRole } from "./roles";

async function load() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const role = await getViewerRole(supabase, user.id);
  if (role.accountStatus !== "active") notFound();
  return { supabase, user, role };
}

/** Admins and moderators (content moderation). */
export async function requireModerator(): Promise<Awaited<ReturnType<typeof load>> & { role: ViewerRole }> {
  const ctx = await load();
  if (!ctx.role.isModerator) notFound();
  return ctx;
}

/** Full admins only (business verification, accounts, audit log). */
export async function requireAdmin(): Promise<Awaited<ReturnType<typeof load>> & { role: ViewerRole }> {
  const ctx = await load();
  if (!ctx.role.isAdmin) notFound();
  return ctx;
}
