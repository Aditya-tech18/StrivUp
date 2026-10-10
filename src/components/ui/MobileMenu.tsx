"use client";

/**
 * MobileMenu — the hamburger and its drawer, for phones.
 *
 * The sidebar is md+ only, and BottomNav carries five destinations, so on a
 * phone the other half of the app (Quests, My Challenges, Profile, Business
 * mode, the admin console) had no route at all. This is that route.
 *
 * It renders the same NAV_ITEMS the sidebar does, imported rather than
 * re-listed, so a destination added to one appears in the other. The account
 * section at the foot is the same ModeSwitcher, which already decides for
 * itself what this account may reach.
 *
 * Drop <MobileMenu /> as the first child of a page's sticky header. It is
 * `md:hidden`, so it costs nothing on desktop where the rail is present.
 *
 * The drawer is portalled to <body>. A sticky header carrying `backdrop-blur`
 * becomes the containing block for `position: fixed` descendants, so an
 * in-place drawer was clipped to the height of the header bar: the panel
 * rendered as a 56px strip and `flex-1` on the nav collapsed to nothing. The
 * portal measures it against the viewport instead.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NAV_ITEMS, BUSINESS_NAV_ITEMS } from "./SidebarNav";
import { ModeSwitcher } from "./ModeSwitcher";
import { BrandMark } from "./BrandMark";
import { useUnreadCount } from "./AlertsContext";

export function MobileMenu() {
  const pathname = usePathname();
  const { unreadCount } = useUnreadCount();
  const [open, setOpen] = useState(false);

  /* Each destination closes the drawer on tap rather than an effect watching
     the pathname: navigation here is always user-initiated, and setState
     straight from an effect body is the cascading-render pattern
     react-hooks/set-state-in-effect rejects. */
  const items = pathname.startsWith("/business") ? BUSINESS_NAV_ITEMS : NAV_ITEMS;
  // Longest matching href wins, so /business/quests/new does not also light up
  // "My Quests".
  const activeHref = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  /* Escape dismisses, and the page behind does not scroll while it is open. */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-on-surface transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary md:hidden"
      >
        <Menu size={22} strokeWidth={2} aria-hidden="true" />
      </button>

      {open && createPortal((
        <div
          className="fixed inset-0 z-[70] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          id="mobile-nav-drawer"
        >
          {/* Scrim. A button so a tap anywhere outside closes the drawer, and
              so the gesture is reachable from a keyboard too. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full bg-primary/50 backdrop-blur-sm"
          />

          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col border-r border-outline-variant bg-surface-container-lowest pt-safe elev-5">
            <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-outline-variant px-4">
              <BrandMark variant="wordmark" height={20} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <nav
              aria-label="All destinations"
              className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-3 pb-safe"
            >
              {items.map(({ href, icon: Icon, label, showBadge }) => {
                const isActive = href === activeHref;
                const badge = showBadge ? unreadCount : 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={[
                      "flex h-12 items-center gap-3 rounded-xl px-3 text-body-md transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
                      isActive
                        ? "bg-secondary/10 font-semibold text-secondary"
                        : "font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                    ].join(" ")}
                  >
                    <span className="relative inline-flex shrink-0">
                      <Icon size={20} strokeWidth={isActive ? 2.5 : 1.75} aria-hidden="true" />
                      {badge > 0 && (
                        <span
                          aria-label={`${badge} unread`}
                          className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-error px-1 text-label-sm font-bold leading-4 text-white"
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </span>
                    {label}
                  </Link>
                );
              })}

              {/* Admin / Business mode, on the same terms as the sidebar.
                  The close is captured on the wrapper rather than passed down:
                  ModeSwitcher builds its own links and should not have to know
                  it is inside a drawer. */}
              <div className="pt-2" onClick={() => setOpen(false)}>
                <ModeSwitcher />
              </div>
            </nav>
          </div>
        </div>
      ), document.body)}
    </>
  );
}
