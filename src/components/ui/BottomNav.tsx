"use client";

import { type HTMLAttributes } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, Briefcase, Compass, Home,
  Plus, Search, Trophy, Users,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import { useUnreadCount } from "./AlertsContext";

interface NavItem {
  href: string;
  icon: ComponentType<LucideProps>;
  label: string;
  showBadge?: boolean;
  /** Keep this item active for any pathname under this prefix. */
  activePrefix?: string;
}

const USER_ITEMS: NavItem[] = [
  { href: "/feed",           icon: Home,     label: "Home"    },
  { href: "/explore",        icon: Compass,  label: "Explore" },
  { href: "/challenges/new", icon: Plus,     label: "Create"  },
  { href: "/search",         icon: Search,   label: "Search"  },
  { href: "/alerts",         icon: Bell,     label: "Alerts", showBadge: true },
];

const BUSINESS_ITEMS: NavItem[] = [
  { href: "/feed",                 icon: Home,      label: "Home"       },
  { href: "/explore",              icon: Trophy,    label: "Challenges" },
  { href: "/business/quests/new",  icon: Plus,      label: "Create"     },
  { href: "/quests",               icon: Users,     label: "Quests"     },
  { href: "/business/dashboard",   icon: Briefcase, label: "Business", activePrefix: "/business" },
];

export type { NavItem };
type BottomNavProps = HTMLAttributes<HTMLElement>;

export function BottomNav({ className = "", ...props }: BottomNavProps) {
  const pathname = usePathname();
  const { unreadCount } = useUnreadCount();

  const isBusiness = pathname.startsWith("/business");
  const items = isBusiness ? BUSINESS_ITEMS : USER_ITEMS;

  return (
    <nav
      aria-label="Bottom navigation"
      className={[
        "fixed bottom-0 left-0 right-0 z-50",
        "flex h-[var(--bottom-nav-h)] items-stretch pb-safe",
        "bg-surface-container-lowest border-t border-outline-variant",
        "shadow-[0_-1px_0_0_rgba(0,0,0,0.05)]",
        "md:hidden",
        className,
      ].filter(Boolean).join(" ")}
      {...props}
    >
      {items.map(item => {
        const isCreate = item.href.endsWith("/new");
        const isActive = !isCreate && (
          pathname === item.href ||
          (item.activePrefix !== undefined && pathname.startsWith(item.activePrefix)) ||
          (item.href !== "/feed" && item.href !== "/business/dashboard" && pathname.startsWith(item.href))
        );
        const Icon = item.icon;
        const badge = item.showBadge ? unreadCount : 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            aria-label={isCreate ? item.label : undefined}
            className={[
              "flex flex-1 flex-col items-center justify-center gap-0.5 select-none transition-colors",
              isCreate ? "relative" : "",
              isActive ? "text-secondary" : "text-on-surface-variant hover:text-on-surface",
            ].join(" ")}
          >
            {isCreate ? (
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center shadow-md shadow-blue-200 -mt-6">
                <Icon size={22} strokeWidth={2.5} className="text-white" />
              </div>
            ) : (
              <>
                <span className="relative inline-flex">
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.75} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-label-sm font-bold leading-4 flex items-center justify-center">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className={`text-label-sm font-medium leading-none ${isActive ? "text-secondary" : ""}`}>
                  {item.label}
                </span>
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
