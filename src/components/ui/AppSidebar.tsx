"use client";

/**
 * AppSidebar — picks the sidebar that matches the section you are in.
 *
 * /admin/* is the admin console, /business/* is Business mode, everything else
 * is the user app. Route-driven rather than stored-mode-driven on purpose: the
 * nav always matches the page actually on screen, so following a link into the
 * user app never leaves a business or admin sidebar behind.
 *
 * On user routes the ModeSwitcher is appended below the nav — without it there
 * is no route from the user app into Business or Admin mode at all.
 */

import { usePathname } from "next/navigation";
import { SidebarNav } from "./SidebarNav";
import { BusinessSidebarNav } from "./BusinessSidebarNav";
import { AdminSidebarNav } from "./AdminSidebarNav";
import { ModeSwitcher } from "./ModeSwitcher";

export function AppSidebar() {
  const pathname = usePathname();

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <AdminSidebarNav />;
  }

  if (pathname === "/business" || pathname.startsWith("/business/")) {
    return <BusinessSidebarNav />;
  }

  return (
    <>
      <SidebarNav />
      <ModeSwitcher />
    </>
  );
}
