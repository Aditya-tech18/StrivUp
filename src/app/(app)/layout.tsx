/**
 * (app) route-group layout — authenticated shell.
 *
 * Layout strategy:
 *   Mobile  → persistent bottom navigation bar (fixed, below content)
 *   Desktop → persistent sidebar (fixed, left of content)
 *
 * Navigation components will be implemented in Step 3.
 * This file is intentionally minimal — scaffolding only.
 */

import type { ReactNode } from "react";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* ── Desktop sidebar placeholder ────────────────────────────── */}
      {/* Visible md+ via Tailwind: hidden md:flex  */}
      <aside
        aria-label="Sidebar navigation"
        className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-neutral-200 md:bg-white"
      >
        {/* Sidebar nav items — Step 3 */}
      </aside>

      {/* ── Main content area ──────────────────────────────────────── */}
      <main className="flex-1 pb-16 md:pb-0">{children}</main>

      {/* ── Mobile bottom navigation placeholder ───────────────────── */}
      {/* Visible only below md breakpoint */}
      <nav
        aria-label="Bottom navigation"
        className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-neutral-200 bg-white md:hidden"
      >
        {/* Bottom nav items — Step 3 */}
      </nav>
    </div>
  );
}
