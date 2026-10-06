"use client";
/**
 * Admin console home — platform overview and the queues that need attention.
 *
 * Every number comes from admin_platform_stats(), which returns an empty
 * object to anyone who isn't an admin, so this page cannot leak counts even if
 * it is somehow rendered for the wrong person.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck, Building2, FileWarning, Loader2, MapPin,
  RefreshCw, Trophy, UserX, Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  STATUS_UI, listApplications, platformStats,
  type BusinessApplication,
} from "@/lib/data/businessVerification";

interface Stat {
  key: string;
  label: string;
  icon: typeof Users;
  href?: string;
  tone?: "default" | "warn";
}

const STATS: Stat[] = [
  { key: "total_users",         label: "Total users",       icon: Users },
  { key: "total_businesses",    label: "Businesses",        icon: Building2, href: "/admin/businesses" },
  { key: "verified_businesses", label: "Verified",          icon: BadgeCheck, href: "/admin/business-verification" },
  { key: "pending_businesses",  label: "Awaiting review",   icon: BadgeCheck, href: "/admin/business-verification", tone: "warn" },
  { key: "total_quests",        label: "Quests",            icon: MapPin },
  { key: "active_quests",       label: "Active quests",     icon: MapPin },
  { key: "total_challenges",    label: "Challenges",        icon: Trophy },
  { key: "pending_reports",     label: "Pending reports",   icon: FileWarning, href: "/admin/moderation", tone: "warn" },
  { key: "suspended_accounts",  label: "Suspended accounts", icon: UserX, tone: "warn" },
];

export default function AdminHomeClient() {
  const [supabase] = useState(() => createClient());
  const [stats, setStats] = useState<Record<string, number>>({});
  const [queue, setQueue] = useState<BusinessApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, q] = await Promise.all([
        platformStats(supabase),
        listApplications(supabase, "submitted"),
      ]);
      if (cancelled) return;
      setStats(s);
      setQueue(q);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const reload = async () => {
    setLoading(true);
    const [s, q] = await Promise.all([
      platformStats(supabase),
      listApplications(supabase, "submitted"),
    ]);
    setStats(s);
    setQueue(q);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-admin-chrome-high pb-24">
      <header className="sticky top-0 z-30 bg-admin-chrome-high border-b border-white/10">
        <div className="measure-console mx-auto px-5 lg:px-8 h-14 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-white">Platform Overview</h1>
            <p className="text-label-sm text-on-admin-chrome-variant">STRIVUP admin console</p>
          </div>
          <button onClick={() => void reload()} aria-label="Refresh"
            className="h-9 px-3 rounded-xl border border-white/15 hover:bg-white/5 text-xs font-semibold text-on-admin-chrome-variant flex items-center gap-1.5 transition-colors tap-target">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </header>

      <div className="measure-console mx-auto px-5 lg:px-8 py-6 flex flex-col gap-6">

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 size={24} className="text-admin-accent animate-spin" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {STATS.map((s) => {
                const value = stats[s.key] ?? 0;
                const warn = s.tone === "warn" && value > 0;
                const body = (
                  <div className={`rounded-2xl border px-4 py-4 h-full transition-colors ${
                    warn
                      ? "bg-warning/10 border-warning/30 hover:bg-warning/15"
                      : "bg-admin-chrome-high border-white/10 hover:bg-white/5"}`}>
                    <div className="flex items-center gap-2">
                      <s.icon size={14} className={warn ? "text-warning" : "text-white/35"} aria-hidden="true" />
                      <p className={`text-label-sm font-bold uppercase tracking-wider ${
                        warn ? "text-warning/90" : "text-on-admin-chrome-variant"}`}>
                        {s.label}
                      </p>
                    </div>
                    <p className={`text-3xl font-bold mt-1.5 ${warn ? "text-warning-container" : "text-white"}`}>
                      {value}
                    </p>
                  </div>
                );
                return s.href
                  ? <Link key={s.key} href={s.href} className="block">{body}</Link>
                  : <div key={s.key}>{body}</div>;
              })}
            </div>

            {/* Verification queue */}
            <section className="rounded-2xl bg-admin-chrome-high border border-white/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
                <BadgeCheck size={16} className="text-admin-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-bold text-white">Businesses awaiting verification</h2>
                  <p className="text-label-sm text-on-admin-chrome-variant">Approve, reject or request changes</p>
                </div>
                <Link href="/admin/business-verification"
                  className="text-xs font-semibold text-admin-accent hover:text-on-admin-chrome-variant shrink-0">
                  View all →
                </Link>
              </div>

              {queue.length === 0 ? (
                <p className="py-12 text-center text-sm text-on-admin-chrome-variant">
                  Nothing awaiting review.
                </p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {queue.slice(0, 6).map((r) => {
                    const ui = STATUS_UI[r.verification_status] ?? STATUS_UI.not_started;
                    return (
                      <li key={r.business_id}>
                        <Link href="/admin/business-verification"
                          className="px-5 py-3.5 flex items-center gap-4 hover:bg-white/5 transition-colors">
                          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                            <Building2 size={16} className="text-on-admin-chrome-variant" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">
                              {r.business_name ?? "Unnamed business"}
                            </p>
                            <p className="text-xs text-on-admin-chrome-variant truncate">
                              {[r.category, r.owner_email].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <span className="text-xs text-on-admin-chrome-variant shrink-0 hidden sm:block">
                            {r.document_count} doc{r.document_count === 1 ? "" : "s"}
                          </span>
                          <span className={`text-label-sm font-bold px-2 py-0.5 rounded-full border shrink-0 ${ui.cls}`}>
                            {ui.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Jump-off points */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { href: "/admin/business-verification", icon: BadgeCheck,  title: "Business Verification", body: "Review applications and documents" },
                { href: "/admin/moderation",            icon: FileWarning, title: "Content Moderation",    body: "Review reported and flagged content" },
                { href: "/admin/users",                 icon: Users,       title: "Users",                 body: "Search accounts and take action" },
              ].map((c) => (
                <Link key={c.href} href={c.href}
                  className="rounded-2xl bg-admin-chrome-high border border-white/10 hover:bg-white/5 px-5 py-4 transition-colors">
                  <c.icon size={18} className="text-admin-accent" aria-hidden="true" />
                  <p className="text-sm font-bold text-white mt-2.5">{c.title}</p>
                  <p className="text-xs text-on-admin-chrome-variant mt-0.5 leading-relaxed">{c.body}</p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
