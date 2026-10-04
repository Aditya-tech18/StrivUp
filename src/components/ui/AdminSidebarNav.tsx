"use client";

/**
 * AdminSidebarNav — navigation for the STRIVUP admin console.
 *
 * Deliberately its own shell, visually distinct from both User and Business
 * mode: you should never be unsure which hat you are wearing while suspending
 * someone's account. Every destination re-checks authorisation server-side —
 * this nav only decides what to render.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck, BarChart3, Building2, FileWarning, LayoutDashboard,
  LogOut, ScrollText, ShieldCheck, Trophy, Users,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

interface NavItem {
  href: string;
  icon: ComponentType<LucideProps>;
  label: string;
}

const MAIN: NavItem[] = [
  { href: "/admin",                      icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/business-verification", icon: BadgeCheck,     label: "Business Verification" },
  { href: "/admin/moderation",           icon: FileWarning,     label: "Content Moderation" },
];

const MANAGE: NavItem[] = [
  { href: "/admin/users",      icon: Users,     label: "Users" },
  { href: "/admin/businesses", icon: Building2, label: "Businesses" },
  { href: "/admin/quests",     icon: BarChart3, label: "Quests" },
  { href: "/admin/challenges", icon: Trophy,    label: "Challenges" },
  { href: "/admin/audit",      icon: ScrollText, label: "Audit Log" },
];

export function AdminSidebarNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const item = ({ href, icon: Icon, label }: NavItem) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={[
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150",
          active
            ? "bg-blue-500/15 text-blue-300 font-semibold"
            : "text-white/55 hover:bg-white/5 hover:text-white font-medium",
        ].join(" ")}
      >
        <Icon size={19} strokeWidth={active ? 2.4 : 1.75} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  return (
    <nav className="flex-1 px-3 py-3 overflow-y-auto bg-[#0F1420]" aria-label="Admin navigation">
      <div className="mx-1 mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2">
        <ShieldCheck size={15} className="text-amber-400 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
            Admin mode
          </p>
          <p className="text-xs font-semibold text-white/90 truncate">STRIVUP Platform</p>
        </div>
      </div>

      {MAIN.map(item)}

      <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/30">
        Manage
      </p>
      {MANAGE.map(item)}

      <Link
        href="/feed"
        className="mt-5 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white transition-colors"
      >
        <LogOut size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
        Exit admin
      </Link>
    </nav>
  );
}
