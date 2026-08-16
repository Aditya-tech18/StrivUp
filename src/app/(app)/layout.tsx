/**
 * (app) route-group layout — authenticated shell.
 *
 * Layout strategy:
 *   Mobile  → persistent BottomNav (client component, owns its own items)
 *   Desktop → persistent sidebar (md+)
 *
 * Icons in the sidebar are rendered directly here (server component context
 * is fine for lucide-react since they're just SVG functions — no hooks).
 * The BottomNav is a separate client component that owns its NAV_ITEMS
 * internally to avoid passing function props across the server→client boundary.
 */

import type { ReactNode } from "react";
import { Flame } from "lucide-react";
import { BottomNav, SidebarNav } from "@/components/ui";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface">

      {/* ── Desktop sidebar (md+) ───────────────────────────────────── */}
      <aside
        aria-label="Sidebar navigation"
        className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:border-r md:border-outline-variant md:bg-surface-container-low"
      >
        {/* Brand mark */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-outline-variant">
          <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center">
            <Flame size={18} className="text-on-primary" aria-hidden="true" />
          </div>
          <span className="type-label-caps text-secondary tracking-widest text-sm font-semibold">
            STRIV
          </span>
        </div>

        {/* Nav items — pathname-aware via SidebarNav client component */}
        <SidebarNav />
      </aside>

      {/* ── Main content ────────────────────────────────────────────── */}
      <main className="flex-1 md:ml-64 pb-16 md:pb-0">
        {children}
      </main>

      {/* ── Mobile bottom nav (client component, self-contained) ────── */}
      <BottomNav />
    </div>
  );
}
