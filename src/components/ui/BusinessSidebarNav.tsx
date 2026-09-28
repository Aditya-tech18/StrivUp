"use client";

/**
 * BusinessSidebarNav — the left navigation for Business mode.
 *
 * Rendered on /business/* in place of the user SidebarNav, so a business is
 * not navigating its dashboard through Home / Explore / Profile.
 *
 * The Create section is the point of the sidebar: creating a Quest is the
 * thing a business comes here to do, so it gets its own block rather than
 * being buried in a list. It is gated on verification — the DB refuses to
 * publish a Quest for an unverified business either way (can_act_as_business),
 * and a locked item that says why beats a live button that fails on submit.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Building2, Compass, LayoutDashboard, Lock, MapPin,
  Plus, Receipt, Settings, ShieldCheck, Target, Trophy, Users,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  href: string;
  icon: ComponentType<LucideProps>;
  label: string;
  /** Needs a verified business. */
  gated?: boolean;
}

const MAIN: NavItem[] = [
  { href: "/business/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/business/quests",    icon: MapPin,          label: "My Quests" },
  { href: "/creator/challenges", icon: Trophy,          label: "My Challenges" },
  { href: "/business/participants", icon: Users,        label: "Participants" },
];

const CREATE: NavItem[] = [
  { href: "/business/quests/new", icon: Plus, label: "Create Quest",     gated: true },
  { href: "/challenges/new",      icon: Plus, label: "Create Challenge", gated: true },
];

const VERIFY: NavItem[] = [
  { href: "/business/order-verification", icon: Receipt,     label: "Order Verification", gated: true },
  { href: "/business/proof-verification", icon: ShieldCheck, label: "Proof Verification", gated: true },
];

const MANAGE: NavItem[] = [
  { href: "/business/analytics",    icon: BarChart3,  label: "Analytics", gated: true },
  { href: "/explore",               icon: Compass,    label: "Explore Quests" },
  { href: "/business/verification", icon: ShieldCheck, label: "Verify Business" },
  { href: "/business/profile",      icon: Building2,  label: "Business Profile" },
  { href: "/business/settings",     icon: Settings,   label: "Settings" },
];

export function BusinessSidebarNav() {
  const pathname = usePathname();
  const [canCreate, setCanCreate] = useState<boolean | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      // One server-side answer rather than reading a status string and
      // deciding here what it means.
      const { data, error } = await supabase.rpc("get_account_context");
      if (cancelled) return;
      if (error || !data?.[0]) { setCanCreate(false); return; }
      const ctx = data[0] as { can_use_business_mode: boolean; business_name: string | null };
      setCanCreate(ctx.can_use_business_mode);
      setBusinessName(ctx.business_name);
    })();

    return () => { cancelled = true; };
  }, []);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const renderItem = ({ href, icon: Icon, label, gated }: NavItem) => {
    // Unknown while loading: render the link rather than flashing a lock at a
    // business that is in fact verified.
    const locked = gated === true && canCreate === false;
    const active = isActive(href);

    if (locked) {
      return (
        <Link
          key={href}
          href="/business/verification"
          title="Verify your business to unlock this"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-on-surface-variant/50 hover:bg-surface-container transition-colors"
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          <span className="flex-1 truncate">{label}</span>
          <Lock size={13} aria-label="Verification required" className="shrink-0" />
        </Link>
      );
    }

    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={[
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150",
          active
            ? "bg-secondary/10 text-secondary font-semibold"
            : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium",
        ].join(" ")}
      >
        <Icon size={20} strokeWidth={active ? 2.5 : 1.75} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  const section = (title: string, items: NavItem[]) => (
    <div className="pt-3">
      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
        {title}
      </p>
      {items.map(renderItem)}
    </div>
  );

  return (
    <nav className="flex-1 px-3 py-3 overflow-y-auto" aria-label="Business navigation">
      {/* Which business you are acting as — a person may also have a user profile */}
      <div className="mx-1 mb-2 flex items-center gap-2 rounded-lg bg-surface-container px-3 py-2">
        <Target size={15} className="text-secondary shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">
            Business mode
          </p>
          <p className="text-xs font-semibold text-on-surface truncate">
            {businessName ?? "Your business"}
          </p>
        </div>
      </div>

      {MAIN.map(renderItem)}
      {section("Create", CREATE)}
      {section("Verification", VERIFY)}
      {section("Manage", MANAGE)}

      {canCreate === false && (
        <Link
          href="/business/verification"
          className="mt-4 mx-1 block rounded-xl border border-secondary/30 bg-secondary/5 px-3 py-3 hover:bg-secondary/10 transition-colors"
        >
          <p className="text-xs font-bold text-secondary">Verification required</p>
          <p className="text-[11px] text-on-surface-variant leading-relaxed mt-0.5">
            Verify your business to create and publish Quests.
          </p>
        </Link>
      )}

      <Link
        href="/feed"
        className="mt-4 mx-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
      >
        <Compass size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
        Switch to User mode
      </Link>
    </nav>
  );
}
