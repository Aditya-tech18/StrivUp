/**
 * /dev/sidebar-preview — dev-only harness for the desktop rail.
 *
 * The real sidebar only renders inside the authenticated (app) shell, so the
 * collapsed and expanded states could not otherwise be reviewed without a
 * session. Mirrors the aside markup from (app)/layout.tsx exactly.
 *
 * 404s in production, like the other /dev routes. ModeSwitcher renders nothing
 * without a signed-in account, which is its own correct behaviour.
 */

import { notFound } from "next/navigation";
import { Flame } from "lucide-react";
import { AlertsProvider, SidebarNav } from "@/components/ui";

export default function SidebarPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <AlertsProvider>
      <div className="flex min-h-screen bg-surface">
        <aside
          aria-label="Sidebar navigation"
          className="rail z-40 hidden md:fixed md:inset-y-0 md:flex md:flex-col md:border-r md:border-outline-variant md:bg-surface-container-low"
        >
          <div className="flex items-center gap-3 border-b border-outline-variant px-5 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-container">
              <Flame size={18} className="text-on-primary" aria-hidden="true" />
            </div>
            <span className="rail-label text-overline text-sm font-semibold tracking-widest text-secondary">
              STRIVUP
            </span>
          </div>
          <SidebarNav />
        </aside>

        <main className="min-w-0 flex-1 p-10 md:ml-[var(--rail-collapsed)]">
          <h1 className="text-headline-lg text-on-surface">Sidebar preview</h1>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Hover the rail, or tab into it, to expand.
          </p>
        </main>
      </div>
    </AlertsProvider>
  );
}
