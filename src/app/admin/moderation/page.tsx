import { requireModerator } from "@/lib/auth/requireRole";
import ModerationClient from "./ModerationClient";

export default async function ModerationPage() {
  const { supabase, user, role } = await requireModerator();
  const { data } = await supabase.from("profiles").select("moderator_role").eq("id", user.id).maybeSingle();
  const tier = (data as { moderator_role?: string } | null)?.moderator_role ?? "none";
  // Admins get the top moderator tier (can remove content); moderators keep theirs.
  return <ModerationClient moderatorRole={role.isAdmin && tier === "none" ? "super_admin" : tier} currentUserId={user.id} />;
}
