"use client";

/**
 * SidebarNav — desktop sidebar navigation with pathname-aware active state.
 *
 * Mirrors the same NAV_ITEMS used by BottomNav.tsx but renders as a vertical
 * list of links. Defined as a separate client component so the parent
 * AppShellLayout can remain a server component.
 *
 * Active state: matched by exact path or prefix (same logic as BottomNav).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Compass, Home, PlusSquare, User } from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

interface NavItem {
  href: string;
  icon: ComponentType<LucideProps>;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/feed",    icon: Home,       label: "Home"    },
  { href: "/explore", icon: Compass,    label: "Explore" },
  { href: "/challenges/new", icon: PlusSquare, label: "Create"  },
  { href: "/alerts",  icon: Bell,       label: "Alerts"  },
  { href: "/profile", icon: User,       label: "Profile" },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main navigation">
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const isActive =
          pathname === href || pathname.startsWith(`${href}/`);
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
            <Icon
              size={20}
              strokeWidth={isActive ? 2.5 : 1.75}
              aria-hidden="true"
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
