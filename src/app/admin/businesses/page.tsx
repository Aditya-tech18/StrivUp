/** /admin/businesses — all business accounts and their verification state. */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireRole";
import { Empty, PageHeader, Panel, StatusChip, fmtDateTime } from "../ui";
import { BadgeAction } from "./BadgeAction";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "All" }, { key: "verified", label: "Verified" }, { key: "submitted", label: "Pending" },
  { key: "needs_more_info", label: "Needs info" }, { key: "rejected", label: "Rejected" }, { key: "suspended", label: "Suspended" },
];

export default async function AdminBusinessesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { supabase } = await requireAdmin();
  const { status = "", q = "" } = await searchParams;

  let query = supabase.from("business_profiles")
    .select("id, business_name, business_username, category, city, state, business_email, business_phone, verification_status, created_at")
    .order("created_at", { ascending: false }).limit(200);
  if (status) query = query.eq("verification_status", status);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`business_name.ilike.%${term}%,business_username.ilike.%${term}%,city.ilike.%${term}%,business_email.ilike.%${term}%`);
  const { data } = await query;
  const rows = (data ?? []) as {
    id: string; business_name: string | null; business_username: string | null; category: string | null; city: string | null;
    state: string | null; business_email: string | null; business_phone: string | null; verification_status: string; created_at: string;
  }[];

  return (
    <div className="mx-auto measure-console">
      <PageHeader title="Businesses" subtitle="Every business account, its verification state and contact details." />
      <form className="mb-4 flex flex-wrap gap-2" action="/admin/businesses">
        <input name="q" defaultValue={q} aria-label="Search businesses" placeholder="Name, username, city or email"
          className="h-11 min-w-[240px] flex-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-base focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30" />
        <input type="hidden" name="status" value={status} />
        <button className="h-11 rounded-xl bg-admin-chrome px-5 text-sm font-bold text-white">Search</button>
      </form>
      <nav aria-label="Filter by verification status" className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map(f => (
          <Link key={f.key} href={`/admin/businesses?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={status === f.key ? "page" : undefined}
            className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold leading-10 ${status === f.key ? "border-admin-chrome bg-admin-chrome text-white" : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"}`}>
            {f.label}
          </Link>
        ))}
      </nav>
      <Panel>
        {rows.length === 0 ? <Empty>No businesses match.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-outline-variant text-left text-xs text-on-surface-variant">
                  <th className="px-4 py-3 font-semibold">Business</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Verification</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 font-semibold">Badge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.map(b => (
                  <tr key={b.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-bold text-on-surface">{b.business_name ?? "Unnamed business"}</p>
                      <p className="text-xs text-on-surface-variant">{[b.business_username && `@${b.business_username}`, b.category].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3 text-on-surface">{[b.city, b.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-on-surface">
                      <p>{b.business_email ?? "—"}</p><p className="text-xs text-on-surface-variant">{b.business_phone ?? ""}</p>
                    </td>
                    <td className="px-4 py-3"><StatusChip status={b.verification_status} /></td>
                    <td className="px-4 py-3 text-on-surface">{fmtDateTime(b.created_at)}</td>
                    <td className="px-4 py-3"><BadgeAction businessId={b.id} name={b.business_name ?? "this business"} status={b.verification_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
