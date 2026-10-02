"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeCheck, Building2, Flame, LayoutDashboard, LogOut, ScrollText, ShieldAlert, Users,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import { createClient } from "@/lib/supabase/client";

interface Item { href: string; label: string; icon: ComponentType<LucideProps>; badge?: number; adminOnly?: boolean }

export function AdminSidebar({ email, isAdmin, pendingReports, pendingVerifications }: {
  email: string; isAdmin: boolean; pendingReports: number; pendingVerifications: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items: Item[] = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/moderation", label: "Content Moderation", icon: ShieldAlert, badge: pendingReports },
    { href: "/admin/business-verification", label: "Business Verification", icon: BadgeCheck, badge: pendingVerifications, adminOnly: true },
    { href: "/admin/users", label: "Users", icon: Users, adminOnly: true },
    { href: "/admin/businesses", label: "Businesses", icon: Building2, adminOnly: true },
    { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText, adminOnly: true },
  ].filter(i => isAdmin || !i.adminOnly);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside className="border-b border-white/10 bg-[#0d1c32] text-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:border-b-0">
      <div className="flex items-center gap-2.5 px-4 py-3 md:px-5 md:py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Flame size={18} aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="text-[15px] font-black tracking-wide">STRIVUP</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-200">Admin console</p>
        </div>
      </div>

      <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-2 pb-2 no-scrollbar md:flex-1 md:flex-col md:overflow-visible md:px-3">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={`flex h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${active ? "bg-white text-[#0d1c32]" : "text-blue-50 hover:bg-white/10"}`}>
              <Icon size={18} aria-hidden="true" />
              <span className="whitespace-nowrap md:flex-1">{label}</span>
              {!!badge && badge > 0 && (
                <span className="min-w-[22px] rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold leading-[22px] text-white" aria-label={`${badge} pending`}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-white/10 p-4 md:block">
        <p className="truncate text-xs text-blue-100" title={email}>{email}</p>
        <p className="text-[11px] text-blue-200">{isAdmin ? "Platform administrator" : "Moderator"}</p>
        <button type="button" onClick={signOut}
          className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/20 text-sm font-semibold text-white hover:bg-white/10">
          <LogOut size={15} aria-hidden="true" /> Sign out
        </button>
      </div>
    </aside>
  );
}
