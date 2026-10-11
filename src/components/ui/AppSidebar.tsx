"use client";

/**
 * AppSidebar — picks the sidebar that matches the section you are in.
 *
 * /business/* is Business mode, everything else is the user app. Route-driven
 * rather than stored-mode-driven on purpose: the nav always matches the page
 * actually on screen, so following a link into the user app never leaves a
 * business sidebar behind.
 *
 * On user routes the ModeSwitcher is appended below the nav — without it there
 * is no route from the user app into Business or Admin mode at all.
 *
 * /admin/* is not handled here. The admin console lives outside this route
 * group, at app/admin/, with its own layout and its own AdminSidebar, so it
 * never renders the app shell in the first place.
 */

import { usePathname } from "next/navigation";
import { SidebarNav } from "./SidebarNav";
import { BusinessSidebarNav } from "./BusinessSidebarNav";
import { ModeSwitcher } from "./ModeSwitcher";

export function AppSidebar() {
  const pathname = usePathname();

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
