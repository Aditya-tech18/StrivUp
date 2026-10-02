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
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Businesses" subtitle="Every business account, its verification state and contact details." />
      <form className="mb-4 flex flex-wrap gap-2" action="/admin/businesses">
        <input name="q" defaultValue={q} aria-label="Search businesses" placeholder="Name, username, city or email"
          className="h-11 min-w-[240px] flex-1 rounded-xl border border-gray-300 bg-white px-3 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        <input type="hidden" name="status" value={status} />
        <button className="h-11 rounded-xl bg-[#0d1c32] px-5 text-sm font-bold text-white">Search</button>
      </form>
      <nav aria-label="Filter by verification status" className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map(f => (
          <Link key={f.key} href={`/admin/businesses?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={status === f.key ? "page" : undefined}
            className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold leading-10 ${status === f.key ? "border-[#0d1c32] bg-[#0d1c32] text-white" : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"}`}>
            {f.label}
          </Link>
        ))}
      </nav>
      <Panel>
        {rows.length === 0 ? <Empty>No businesses match.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-600">
                  <th className="px-4 py-3 font-semibold">Business</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Verification</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 font-semibold">Badge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(b => (
                  <tr key={b.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{b.business_name ?? "Unnamed business"}</p>
                      <p className="text-xs text-gray-600">{[b.business_username && `@${b.business_username}`, b.category].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-800">{[b.city, b.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-gray-800">
                      <p>{b.business_email ?? "—"}</p><p className="text-xs text-gray-600">{b.business_phone ?? ""}</p>
                    </td>
                    <td className="px-4 py-3"><StatusChip status={b.verification_status} /></td>
                    <td className="px-4 py-3 text-gray-800">{fmtDateTime(b.created_at)}</td>
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
