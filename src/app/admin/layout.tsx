/**
 * /admin — STRIVUP admin console. Separate from the user app and the business
 * dashboard. Access is checked here on the server (moderators and admins);
 * admin-only sections re-check with requireAdmin(), and all data is protected
 * by RLS and admin-only database functions.
 */
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { requireModerator } from "@/lib/auth/requireRole";
import { AdminSidebar } from "./AdminSidebar";

export const metadata: Metadata = { title: "Admin — STRIVUP", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { supabase, user, role } = await requireModerator();

  // Pending counts for the sidebar — real queue sizes, not decoration.
  const [{ count: pendingReports }, verif] = await Promise.all([
    supabase.from("proof_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
    role.isAdmin
      ? supabase.from("business_verification_submissions").select("id", { count: "exact", head: true }).eq("status", "pending_review")
      : Promise.resolve({ count: 0 }),
  ]);

  return (
    <div className="min-h-screen bg-[#F4F6FA] md:flex">
      <AdminSidebar
        email={user.email ?? ""}
        isAdmin={role.isAdmin}
        pendingReports={pendingReports ?? 0}
        pendingVerifications={verif.count ?? 0}
      />
      <main className="min-w-0 flex-1 px-4 pb-10 pt-4 md:px-8 md:pt-6">{children}</main>
    </div>
  );
}
