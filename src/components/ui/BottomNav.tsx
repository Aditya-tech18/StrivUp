"use client";

import { type HTMLAttributes } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Briefcase, Compass, Home, MapPin, PlusSquare, User } from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import { useUnreadCount } from "./AlertsContext";

interface NavItem {
  href: string;
  icon: ComponentType<LucideProps>;
  label: string;
  showBadge?: boolean;
}

const USER_NAV_ITEMS: NavItem[] = [
  { href: "/feed",           icon: Home,       label: "Home"      },
  { href: "/explore",        icon: Compass,    label: "Explore"   },
  { href: "/quests",         icon: MapPin,     label: "Quests"    },
  { href: "/challenges/new", icon: PlusSquare, label: "Create"    },
  { href: "/alerts",         icon: Bell,       label: "Alerts",   showBadge: true },
  { href: "/profile",        icon: User,       label: "Profile"   },
];

const BUSINESS_NAV_ITEMS: NavItem[] = [
  { href: "/feed",                    icon: Home,      label: "Home"       },
  { href: "/challenges",              icon: Compass,   label: "Challenges" },
  { href: "/challenges/new",          icon: PlusSquare,label: "Create"     },
  { href: "/quests",                  icon: MapPin,    label: "Quests"     },
  { href: "/business/dashboard",      icon: Briefcase, label: "Business"   },
];

export { USER_NAV_ITEMS as NAV_ITEMS };
export type { NavItem };

type BottomNavProps = HTMLAttributes<HTMLElement>;

export function BottomNav({ className = "", ...props }: BottomNavProps) {
  const pathname = usePathname();
  const { unreadCount } = useUnreadCount();

  const isBusinessRoute = pathname.startsWith("/business");
  const navItems = isBusinessRoute ? BUSINESS_NAV_ITEMS : USER_NAV_ITEMS;

  return (
    <nav
      aria-label="Bottom navigation"
      className={[
        "fixed bottom-0 left-0 right-0 z-50",
        "flex h-16 items-stretch",
        "bg-surface-container-low border-t border-outline-variant",
        "md:hidden",
        className,
      ].filter(Boolean).join(" ")}
      {...props}
    >
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        const badgeCount = item.showBadge ? unreadCount : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "flex flex-1 flex-col items-center justify-center gap-0.5",
              "transition-colors duration-150 select-none",
              isActive ? "text-secondary" : "text-on-surface-variant hover:text-on-surface",
            ].join(" ")}
          >
            <span className="relative inline-flex">
              <Icon size={24} strokeWidth={isActive ? 2.5 : 1.75} aria-hidden="true" />
              {badgeCount > 0 && (
                <span aria-label={`${badgeCount} unread`}
                  className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-[10px] font-bold leading-4 flex items-center justify-center">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
