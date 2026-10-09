"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, BadgeCheck, Building2, LayoutDashboard, LogOut, ScrollText,
  ShieldAlert, Users,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/ui";

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
    { href: "/admin/activity", label: "Activity Monitor", icon: Activity },
    { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText, adminOnly: true },
  ].filter(i => isAdmin || !i.adminOnly);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside className="border-b border-white/10 bg-admin-chrome text-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:border-b-0">
      <div className="flex items-center gap-2.5 px-4 py-3 md:px-5 md:py-5">
        {/* On the dark rail the logo needs a light plate behind it; the mark
            is drawn on white and would otherwise disappear. */}
        <span className="flex h-9 items-center justify-center rounded-xl bg-white px-2">
          <BrandMark variant="mark" height={20} />
        </span>
        <div className="min-w-0">
          <p className="text-body-lg font-black tracking-wide">STRIVUP</p>
          <p className="text-label-sm font-semibold uppercase tracking-wider text-on-admin-chrome-variant">Admin console</p>
        </div>
      </div>

      <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-2 pb-2 no-scrollbar md:flex-1 md:flex-col md:overflow-visible md:px-3">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={`flex h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${active ? "bg-surface-container-lowest text-admin-chrome" : "text-on-admin-chrome-variant hover:bg-white/10"}`}>
              <Icon size={18} aria-hidden="true" />
              <span className="whitespace-nowrap md:flex-1">{label}</span>
              {!!badge && badge > 0 && (
                <span className="min-w-[22px] rounded-full bg-error px-1.5 text-center text-label-sm font-bold leading-[22px] text-white" aria-label={`${badge} pending`}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-white/10 p-4 md:block">
        <p className="truncate text-xs text-on-admin-chrome-variant" title={email}>{email}</p>
        <p className="text-label-sm text-on-admin-chrome-variant">{isAdmin ? "Platform administrator" : "Moderator"}</p>
        <button type="button" onClick={signOut}
          className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/20 text-sm font-semibold text-white hover:bg-white/10 tap-target">
          <LogOut size={15} aria-hidden="true" /> Sign out
        </button>
      </div>
    </aside>
  );
}
