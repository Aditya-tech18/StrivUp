import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ActivityMonitorClient from "./ActivityMonitorClient";

/**
 * /admin/activity — activity monitoring for moderators (spec §30, §54).
 *
 * Guarded exactly like /admin/moderation: a `moderator_role` of "none" 404s.
 *
 * Note the two different admin checks in this feature, and why they differ:
 * this page gates on `moderator_role` to match the existing admin surface,
 * while admin_review_activity_record() gates on `profiles.is_admin` because a
 * SECURITY DEFINER function must not trust anything the client sends. Both
 * have to pass for a moderator to actually change a record.
 */
export default async function AdminActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("moderator_role, is_admin")
    .eq("id", user.id)
    .single();

  const role = (profile as { moderator_role?: string })?.moderator_role || "none";
  if (role === "none") notFound();

  return (
    <ActivityMonitorClient
      moderatorRole={role}
      canReview={Boolean((profile as { is_admin?: boolean })?.is_admin)}
    />
  );
}
