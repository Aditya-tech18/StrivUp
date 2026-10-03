"use client";

/**
 * SidebarNav — desktop sidebar navigation with pathname-aware active state
 * and unread alert badge from AlertsContext.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck, BarChart3, Bell, Compass, Home, LayoutDashboard, ListChecks, MapPin, PlusSquare, ReceiptText,
  Search, Settings, Store, Trophy, User,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import { useUnreadCount } from "./AlertsContext";

interface NavItem {
  href: string;
  icon: ComponentType<LucideProps>;
  label: string;
  showBadge?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/feed",           icon: Home,       label: "Home"    },
  { href: "/explore",        icon: Compass,    label: "Explore" },
  { href: "/search",         icon: Search,     label: "Search"  },
  { href: "/quests",         icon: MapPin,     label: "Quests"  },
  { href: "/challenges/new", icon: PlusSquare, label: "Create"  },
  { href: "/creator/challenges", icon: Trophy, label: "My Challenges" },
  { href: "/alerts",         icon: Bell,       label: "Alerts", showBadge: true },
  { href: "/profile",        icon: User,       label: "Profile" },
];

// Business dashboard navigation (shown on /business/*).
const BUSINESS_NAV_ITEMS: NavItem[] = [
  { href: "/business/dashboard",       icon: LayoutDashboard, label: "Dashboard" },
  { href: "/business/explore",         icon: Compass,         label: "Explore Quests" },
  { href: "/business/quests/new",      icon: PlusSquare,      label: "Create Quest" },
  { href: "/business/quests",          icon: ListChecks,      label: "My Quests" },
  { href: "/business/analytics",       icon: BarChart3,       label: "Analytics" },
  { href: "/business/verification",    icon: ReceiptText,     label: "Verify Customers" },
  { href: "/business/verify-business", icon: BadgeCheck,      label: "Verify Business" },
  { href: "/business/profile",         icon: Store,           label: "Business Profile" },
  { href: "/alerts",                   icon: Bell,            label: "Notifications", showBadge: true },
  { href: "/business/settings",        icon: Settings,        label: "Settings" },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { unreadCount } = useUnreadCount();
  const items = pathname.startsWith("/business") ? BUSINESS_NAV_ITEMS : NAV_ITEMS;
  // Longest matching href wins, so /business/quests/new doesn't also light up "My Quests".
  const activeHref = items
    .filter(i => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main navigation">
      {items.map(({ href, icon: Icon, label, showBadge }) => {
        const isActive = href === activeHref;
        const badgeCount = showBadge ? unreadCount : 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "flex items-center gap-3 px-3 py-2.5 rounded-lg",
              "text-sm transition-colors duration-150",
              isActive
                ? "bg-secondary/10 text-secondary font-semibold"
                : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium",
            ].join(" ")}
          >
            <span className="relative inline-flex shrink-0">
              <Icon
                size={20}
                strokeWidth={isActive ? 2.5 : 1.75}
                aria-hidden="true"
              />
              {badgeCount > 0 && (
                <span
                  aria-label={`${badgeCount} unread`}
                  className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-label-sm font-bold leading-4 flex items-center justify-center"
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
