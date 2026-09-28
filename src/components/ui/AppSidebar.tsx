"use client";

/**
 * AppSidebar — picks the sidebar that matches the section you are in.
 *
 * /business/* is Business mode and gets the business navigation; everything
 * else keeps the user navigation. Route-driven rather than stored-mode-driven
 * on purpose: the nav always matches the page actually on screen, so a
 * business following a link into the user app does not end up reading a
 * business sidebar.
 */

import { usePathname } from "next/navigation";
import { SidebarNav } from "./SidebarNav";
import { BusinessSidebarNav } from "./BusinessSidebarNav";

export function AppSidebar() {
  const pathname = usePathname();
  const inBusiness = pathname === "/business" || pathname.startsWith("/business/");

  return inBusiness ? <BusinessSidebarNav /> : <SidebarNav />;
}
