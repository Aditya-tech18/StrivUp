import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ModerationClient from "./ModerationClient";

export default async function ModerationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("moderator_role")
    .eq("id", user.id)
    .single();

  const role = (profile as { moderator_role?: string })?.moderator_role || "none";

  if (role === "none") {
    notFound();
  }

  return <ModerationClient moderatorRole={role} currentUserId={user.id} />;
}
