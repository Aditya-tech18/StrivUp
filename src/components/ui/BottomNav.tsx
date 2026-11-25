"use client";

import type { ComponentType, HTMLAttributes } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Compass,
  Home,
  MapPin,
  MessageSquare,
  Plus,
  Trophy,
  Users,
  type LucideProps,
} from "lucide-react";

interface NavItem {
  href: string;
  icon: ComponentType<LucideProps>;
  label: string;
  tourId?: string;
}

/* The tour uses the same targets on both sides of the mobile breakpoint. */
const USER_ITEMS: NavItem[] = [
  { href: "/feed", icon: Home, label: "Today", tourId: "nav-feed" },
  { href: "/explore", icon: Compass, label: "Explore", tourId: "nav-explore" },
  { href: "/challenges/new", icon: Plus, label: "Create", tourId: "nav-create" },
  { href: "/quests", icon: MapPin, label: "Quests", tourId: "nav-quests" },
  { href: "/feed/community", icon: MessageSquare, label: "Community" },
];

const BUSINESS_ITEMS: NavItem[] = [
  { href: "/business/dashboard", icon: Home, label: "Home" },
  { href: "/business/challenges", icon: Trophy, label: "Challenges" },
  { href: "/business/quests/new", icon: Plus, label: "Create" },
  { href: "/business/quests", icon: Users, label: "Quests" },
  { href: "/business/profile", icon: Briefcase, label: "Business" },
];

export type { NavItem };

export function BottomNav({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();
  const items = pathname.startsWith("/business") ? BUSINESS_ITEMS : USER_ITEMS;
  const active = items
    .filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      aria-label="Bottom navigation"
      className={`fixed inset-x-0 bottom-0 z-50 flex h-[var(--bottom-nav-h)] items-stretch border-t border-outline-variant bg-surface-container-lowest pb-safe md:hidden ${className}`}
      {...props}
    >
      {items.map(({ href, icon: Icon, label, tourId }) => {
        const isCreate = Icon === Plus;
        const isActive = href === active;

        return (
          <Link
            key={href}
            href={href}
            data-tour={tourId}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-label-sm select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-secondary ${isActive ? "font-bold text-secondary" : "font-medium text-on-surface-variant hover:text-on-surface"}`}
          >
            <span
              className={
                isCreate
                  ? "flex size-9 items-center justify-center rounded-xl bg-secondary text-on-secondary"
                  : `flex h-8 w-12 items-center justify-center rounded-full ${isActive ? "bg-secondary/12" : ""}`
              }
            >
              <Icon
                size={isCreate ? 22 : 20}
                strokeWidth={isActive || isCreate ? 2.4 : 1.8}
                aria-hidden="true"
              />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
