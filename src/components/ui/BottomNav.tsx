"use client";

import { type HTMLAttributes } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface BottomNavItem {
  href: string;
  /** Material Symbols codepoint name, e.g. "home", "search", "person" */
  icon: string;
  label: string;
}

interface BottomNavProps extends HTMLAttributes<HTMLElement> {
  items: BottomNavItem[];
}

/**
 * BottomNav — persistent mobile navigation bar (visible below md breakpoint).
 *
 * Uses Material Symbols Outlined (variable icon font loaded in globals.css).
 * Active state is derived from the current pathname.
 *
 * Usage:
 *   <BottomNav items={[
 *     { href: "/feed",    icon: "home",   label: "Feed"    },
 *     { href: "/search",  icon: "search", label: "Search"  },
 *     { href: "/profile", icon: "person", label: "Profile" },
 *   ]} />
 *
 * Place inside the (app) layout; the nav is hidden on md+ screens via
 * the parent shell layout's md:hidden class.
 */
export function BottomNav({ items, className = "", ...props }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Bottom navigation"
      className={[
        "fixed bottom-0 left-0 right-0 z-50",
        "flex h-16 items-stretch",
        "bg-surface-container-low border-t border-outline-variant",
        "md:hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "flex flex-1 flex-col items-center justify-center gap-0.5",
              "transition-colors duration-150 select-none",
              isActive
                ? "text-secondary"
                : "text-on-surface-variant hover:text-on-surface",
            ].join(" ")}
          >
            {/* Material Symbol icon — variable FILL animates on active */}
            <span
              className="material-symbols-outlined text-[24px] leading-none transition-all duration-200"
              style={{
                fontVariationSettings: isActive
                  ? "'FILL' 1, 'wght' 500"
                  : "'FILL' 0, 'wght' 400",
              }}
              aria-hidden="true"
            >
              {item.icon}
            </span>
            <span className="type-label-caps normal-case tracking-normal text-[10px]">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
