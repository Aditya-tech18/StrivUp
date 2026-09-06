"use client";

/**
 * SidebarNav — desktop sidebar navigation with pathname-aware active state
 * and unread alert badge from AlertsContext.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Compass, Home, MapPin, PlusSquare, User } from "lucide-react";
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
  { href: "/quests",         icon: MapPin,     label: "Quests"  },
  { href: "/challenges/new", icon: PlusSquare, label: "Create"  },
  { href: "/alerts",         icon: Bell,       label: "Alerts", showBadge: true },
  { href: "/profile",        icon: User,       label: "Profile" },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { unreadCount } = useUnreadCount();

  return (
    <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main navigation">
      {NAV_ITEMS.map(({ href, icon: Icon, label, showBadge }) => {
        const isActive =
          pathname === href || pathname.startsWith(`${href}/`);
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
                  className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-[10px] font-bold leading-4 flex items-center justify-center"
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
