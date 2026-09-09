"use client";

import { type HTMLAttributes } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Briefcase, Compass, Home, MapPin, Plus, User } from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import { useUnreadCount } from "./AlertsContext";

interface NavItem {
  href: string;
  icon: ComponentType<LucideProps>;
  label: string;
  showBadge?: boolean;
}

const USER_ITEMS: NavItem[] = [
  { href: "/feed",           icon: Home,      label: "Home"      },
  { href: "/explore",        icon: Compass,   label: "Explore"   },
  { href: "/challenges/new", icon: Plus,      label: "Create"    },
  { href: "/quests",         icon: MapPin,    label: "Quests"    },
  { href: "/alerts",         icon: Bell,      label: "Alerts",   showBadge: true },
];

const BUSINESS_ITEMS: NavItem[] = [
  { href: "/feed",                icon: Home,      label: "Home"       },
  { href: "/challenges",          icon: Compass,   label: "Challenges" },
  { href: "/challenges/new",      icon: Plus,      label: "Create"     },
  { href: "/quests",              icon: MapPin,    label: "Quests"     },
  { href: "/business/dashboard",  icon: Briefcase, label: "Business"   },
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
        "flex h-16 items-stretch",
        "bg-white border-t border-gray-100",
        "md:hidden",
        className,
      ].filter(Boolean).join(" ")}
      {...props}
    >
      {items.map(item => {
        const isActive = pathname === item.href || (item.href !== "/feed" && pathname.startsWith(item.href+"/"));
        const Icon = item.icon;
        const badge = item.showBadge ? unreadCount : 0;
        const isCreate = item.href === "/challenges/new";
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors select-none",
              isCreate ? "relative" : "",
              isActive ? "text-blue-600" : "text-gray-400 hover:text-gray-600",
            ].join(" ")}
          >
            {isCreate ? (
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200 -mt-5">
                <Icon size={24} strokeWidth={2.5} className="text-white" aria-hidden="true" />
              </div>
            ) : (
              <>
                <span className="relative inline-flex">
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 1.75} aria-hidden="true" />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-4 flex items-center justify-center">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] font-medium leading-none ${isActive ? "text-blue-600" : ""}`}>{item.label}</span>
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
