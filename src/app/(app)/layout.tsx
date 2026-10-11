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
import { AppSidebar, BottomNav, AlertsProvider, BrandMark } from "@/components/ui";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <AlertsProvider>
      <div className="flex min-h-screen bg-surface">

        {/* ── Desktop sidebar (md+) ───────────────────────────────────── */}
        <aside
          aria-label="Sidebar navigation"
          className="rail hidden md:fixed md:inset-y-0 md:flex md:flex-col md:border-r md:border-outline-variant md:bg-surface-container-low"
        >
          {/* Brand mark. The square mark is what shows in the collapsed rail,
              so it keeps the nav items' padding; the wordmark appears beside it
              once the rail expands. */}
          <div className="flex items-center gap-3 border-b border-outline-variant px-5 py-4">
            <BrandMark variant="mark" height={22} priority className="shrink-0" />
            <span className="rail-label">
              <BrandMark variant="wordmark" height={18} />
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
