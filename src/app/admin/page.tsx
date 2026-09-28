/**
 * /admin — Platform overview. Every number is a live count from the database
 * (admin_platform_stats); nothing is estimated or illustrative.
 */
import Link from "next/link";
import {
  BadgeCheck, Ban, Building2, ChevronRight, Flag, PauseCircle, ScrollText, Target, Trophy, Users,
} from "lucide-react";
import { requireModerator } from "@/lib/auth/requireRole";
import { getPlatformStats, SUBMISSION_SELECT, type AuditLogRow, type VerificationSubmission } from "@/lib/data/admin";
import { Empty, PageHeader, Panel, StatusChip, fmtDateTime } from "./ui";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const { supabase, role } = await requireModerator();

  const [stats, queue, audit, reports] = await Promise.all([
    getPlatformStats(supabase),
    role.isAdmin
      ? supabase.from("business_verification_submissions").select(SUBMISSION_SELECT)
          .eq("status", "pending_review").order("submitted_at", { ascending: true }).limit(5)
      : Promise.resolve({ data: [] }),
    role.isAdmin
      ? supabase.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),
    supabase.from("proof_reports").select("id, reason, created_at").eq("status", "pending")
      .order("created_at", { ascending: false }).limit(5),
  ]);

  const kpis = stats ? [
    { label: "Total users", value: stats.total_users, sub: `${stats.new_users_30d} new in 30 days`, icon: Users, tone: "bg-blue-50 text-blue-700" },
    { label: "Businesses", value: stats.businesses, sub: `${stats.verified_businesses} verified`, icon: Building2, tone: "bg-violet-50 text-violet-700" },
    { label: "Pending verifications", value: stats.pending_verifications, sub: "Awaiting review", icon: BadgeCheck, tone: "bg-amber-50 text-amber-800", href: "/admin/business-verification" },
    { label: "Active quests", value: stats.active_quests, sub: "Live or published", icon: Target, tone: "bg-green-50 text-green-700" },
    { label: "Challenges", value: stats.challenges, sub: "All visibility", icon: Trophy, tone: "bg-orange-50 text-orange-700" },
    { label: "Pending reports", value: stats.pending_reports, sub: "Content moderation", icon: Flag, tone: "bg-red-50 text-red-700", href: "/admin/moderation" },
    { label: "Suspended", value: stats.suspended_accounts, sub: "Accounts", icon: PauseCircle, tone: "bg-gray-100 text-gray-800", href: "/admin/users?status=suspended" },
    { label: "Banned", value: stats.banned_accounts, sub: "Accounts", icon: Ban, tone: "bg-gray-100 text-gray-800", href: "/admin/users?status=banned" },
  ].filter(k => role.isAdmin || !k.href || k.href === "/admin/moderation") : [];

  const submissions = (queue.data ?? []) as VerificationSubmission[];
  const logs = (audit.data ?? []) as AuditLogRow[];
  const pendingReports = (reports.data ?? []) as { id: string; reason: string; created_at: string }[];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Platform Overview" subtitle="Monitor and manage STRIVUP's community, businesses and content." />

      {!stats ? (
        <Panel><Empty>Platform statistics aren&apos;t available yet. Apply the roles migration to enable them.</Empty></Panel>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map(({ label, value, sub, icon: Icon, tone, href }) => {
            const body = (
              <>
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={20} aria-hidden="true" /></span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-600">{label}</p>
                  <p className="text-2xl font-black text-gray-900">{value.toLocaleString("en-IN")}</p>
                  <p className="truncate text-[11px] text-gray-600">{sub}</p>
                </div>
              </>
            );
            const cls = "flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4";
            return href
              ? <Link key={label} href={href} className={`${cls} transition-colors hover:border-blue-300`}>{body}</Link>
              : <div key={label} className={cls}>{body}</div>;
          })}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {role.isAdmin && (
          <Panel title="Business verification queue"
            action={<Link href="/admin/business-verification" className="text-sm font-semibold text-blue-700 hover:underline">View all</Link>}>
            {submissions.length === 0 ? <Empty>No business verification requests.</Empty> : (
              <ul className="divide-y divide-gray-100">
                {submissions.map(s => (
                  <li key={s.id}>
                    <Link href={`/admin/business-verification/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-sm font-bold text-gray-700">
                        {s.business?.logo_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={s.business.logo_url} alt="" className="h-full w-full object-cover" />
                          : (s.business?.business_name ?? s.legal_name).charAt(0)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-gray-900">{s.business?.business_name ?? s.legal_name}</p>
                        <p className="truncate text-xs text-gray-600">{[s.business?.category, s.city].filter(Boolean).join(" · ") || s.legal_name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <StatusChip status={s.status} />
                        <p className="mt-1 text-[11px] text-gray-600">{fmtDateTime(s.submitted_at)}</p>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <Panel title="Content moderation queue"
          action={<Link href="/admin/moderation" className="text-sm font-semibold text-blue-700 hover:underline">Open queue</Link>}>
          {pendingReports.length === 0 ? <Empty>No moderation items.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {pendingReports.map(r => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <Flag size={16} className="shrink-0 text-red-600" aria-hidden="true" />
                  <p className="min-w-0 flex-1 truncate text-sm text-gray-900">{r.reason}</p>
                  <span className="shrink-0 text-[11px] text-gray-600">{fmtDateTime(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {role.isAdmin && (
          <Panel title="Recent admin actions" className="lg:col-span-2"
            action={<Link href="/admin/audit-logs" className="text-sm font-semibold text-blue-700 hover:underline">Audit log</Link>}>
            {logs.length === 0 ? <Empty>No admin actions recorded yet.</Empty> : (
              <ul className="divide-y divide-gray-100">
                {logs.map(l => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                    <ScrollText size={15} className="text-gray-500" aria-hidden="true" />
                    <span className="font-semibold text-gray-900">{l.action.replace(/_/g, " ")}</span>
                    <span className="text-gray-600">{l.target_type}</span>
                    {l.reason && <span className="min-w-0 flex-1 truncate text-gray-700">“{l.reason}”</span>}
                    <span className="ml-auto text-[11px] text-gray-600">{fmtDateTime(l.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}
