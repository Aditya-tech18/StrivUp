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
import { AppSidebar, BottomNav, AlertsProvider } from "@/components/ui";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <AlertsProvider>
      <div className="flex min-h-screen bg-surface">

        {/* ── Desktop sidebar (md+) ───────────────────────────────────── */}
        <aside
          aria-label="Sidebar navigation"
          className="rail z-40 hidden md:fixed md:inset-y-0 md:flex md:flex-col md:border-r md:border-outline-variant md:bg-surface-container-low"
        >
          {/* Brand mark. The icon is centred in the collapsed rail, so its
              padding matches the nav items' rather than the old wider inset. */}
          <div className="flex items-center gap-3 border-b border-outline-variant px-5 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-container">
              <Flame size={18} className="text-on-primary" aria-hidden="true" />
            </div>
            <span className="rail-label text-overline text-sm font-semibold tracking-widest text-secondary">
              STRIVUP
            </span>
          </div>

          {/* Nav items — AppSidebar serves business navigation on /business/* */}
          <AppSidebar />
        </aside>

        {/* ── Main content ────────────────────────────────────────────────
            Reserves the collapsed rail width only. The rail overlays this
            column when it expands, so hovering the nav never reflows the
            page behind it. */}
        <main className="min-w-0 flex-1 pb-bottom-nav md:ml-[var(--rail-collapsed)]">
          {children}
        </main>

        {/* ── Mobile bottom nav (client component, self-contained) ────── */}
        <BottomNav />
      </div>
    </AlertsProvider>
  );
}
