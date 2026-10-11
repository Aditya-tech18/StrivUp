/** /admin/audit-logs — append-only record of admin actions. */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireRole";
import type { AuditLogRow } from "@/lib/data/admin";
import { Empty, PageHeader, Panel, fmtDateTime } from "../ui";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string }> }) {
  const { supabase } = await requireAdmin();
  const { page: p = "0", type = "" } = await searchParams;
  const page = Math.max(0, Number(p) || 0);

  let q = supabase.from("admin_audit_log").select("*").order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
  if (type) q = q.eq("target_type", type);
  const { data, error } = await q;
  const rows = (data ?? []) as AuditLogRow[];
  const hasMore = rows.length > PAGE;

  const adminIds = Array.from(new Set(rows.map(r => r.admin_id).filter(Boolean))) as string[];
  const targetIds = Array.from(new Set(rows.map(r => r.target_id).filter(Boolean))) as string[];
  const [{ data: admins }, { data: targets }, { data: bizTargets }] = await Promise.all([
    adminIds.length ? supabase.from("profiles").select("id, full_name").in("id", adminIds) : Promise.resolve({ data: [] }),
    targetIds.length ? supabase.from("profiles").select("id, full_name, username").in("id", targetIds) : Promise.resolve({ data: [] }),
    targetIds.length ? supabase.from("business_profiles").select("id, business_name").in("id", targetIds) : Promise.resolve({ data: [] }),
  ]);
  const name = new Map<string, string>();
  (targets ?? []).forEach((t: { id: string; full_name: string | null; username: string | null }) => name.set(t.id, t.full_name ?? t.username ?? t.id.slice(0, 8)));
  (bizTargets ?? []).forEach((t: { id: string; business_name: string | null }) => t.business_name && name.set(t.id, t.business_name));
  const adminName = new Map((admins ?? []).map((a: { id: string; full_name: string | null }) => [a.id, a.full_name ?? "Admin"]));

  return (
    <div className="mx-auto measure-console">
      <PageHeader title="Audit Logs" subtitle="Every admin action, append-only. Entries can't be edited or deleted from the app." />
      <nav aria-label="Filter by target" className="mb-4 flex gap-2">
        {[["", "All"], ["user", "Users"], ["business", "Businesses"]].map(([k, l]) => (
          <Link key={k} href={`/admin/audit-logs?type=${k}`} aria-current={type === k ? "page" : undefined}
            className={`h-10 rounded-full border px-4 text-sm font-semibold leading-10 ${type === k ? "border-admin-chrome bg-admin-chrome text-white" : "border-outline-variant bg-surface-container-lowest text-on-surface"} tap-target`}>{l}</Link>
        ))}
      </nav>
      <Panel>
        {error ? <Empty>The audit log isn&apos;t available yet. Apply the roles migration to enable it.</Empty>
        : rows.length === 0 ? <Empty>No admin actions recorded yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-outline-variant text-left text-xs text-on-surface-variant">
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Admin</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.slice(0, PAGE).map(r => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-on-surface">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-3 text-on-surface">{r.admin_id ? adminName.get(r.admin_id) ?? r.admin_id.slice(0, 8) : "System"}</td>
                    <td className="px-4 py-3 font-semibold capitalize text-on-surface">{r.action.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-on-surface">
                      <span className="capitalize">{r.target_type}</span>{r.target_id ? ` · ${name.get(r.target_id) ?? r.target_id.slice(0, 8)}` : ""}
                    </td>
                    <td className="px-4 py-3 text-on-surface">{r.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <div className="mt-4 flex justify-between">
        {page > 0 ? <Link href={`/admin/audit-logs?page=${page - 1}&type=${type}`} className="h-10 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 text-sm font-semibold leading-10 tap-target">Newer</Link> : <span />}
        {hasMore && <Link href={`/admin/audit-logs?page=${page + 1}&type=${type}`} className="h-10 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 text-sm font-semibold leading-10 tap-target">Older</Link>}
      </div>
    </div>
  );
}
