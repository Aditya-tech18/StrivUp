"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AccountStatus } from "@/lib/auth/roles";
import { ACCOUNT_STATUS_LABEL, searchUsers, setAccountStatus, type AdminUserRow } from "@/lib/data/admin";
import { Empty, Panel, StatusChip, fmtDateTime } from "../ui";

const ACTIONS: { to: AccountStatus; label: string; consequence: string; cls: string }[] = [
  { to: "deactivated", label: "Deactivate", consequence: "Temporarily disables access. Data is kept; you can restore it anytime.", cls: "border-outline-variant text-on-surface hover:bg-surface-container-low" },
  { to: "suspended",   label: "Suspend",    consequence: "Blocks sign-in to the app while a policy issue is reviewed. They can't post, join or submit proof.", cls: "border-warning-outline text-on-warning-container hover:bg-warning-container" },
  { to: "banned",      label: "Ban",        consequence: "Strong enforcement for serious or repeated violations. Access is blocked; data is kept for audit.", cls: "border-error-outline text-on-error-container hover:bg-error-container" },
  { to: "active",      label: "Restore",    consequence: "Returns the account to normal access.", cls: "border-success-outline text-on-success-container hover:bg-success-container" },
];

export function UsersClient({ currentAdminId, initialStatus, initialQuery }: { currentAdminId: string; initialStatus: string; initialQuery: string }) {
  const [supabase] = useState(() => createClient());
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<AccountStatus | "">((initialStatus as AccountStatus) || "");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ user: AdminUserRow; to: AccountStatus } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchRows = useCallback(() => searchUsers(supabase, query.trim(), status || null), [supabase, query, status]);

  // Debounced search; state is applied in the promise callback.
  useEffect(() => {
    const t = setTimeout(() => { fetchRows().then(r => { setRows(r); setLoading(false); }); }, 300);
    return () => clearTimeout(t);
  }, [fetchRows]);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true); setError(null);
    const res = await setAccountStatus(supabase, pending.user.id, pending.to, reason.trim());
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setNotice(`${pending.user.full_name ?? pending.user.username ?? "Account"} is now ${ACCOUNT_STATUS_LABEL[pending.to].toLowerCase()}.`);
    setPending(null); setReason("");
    setRows(await fetchRows());
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <label className="flex h-11 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/30">
          <Search size={16} className="text-on-surface-variant" aria-hidden="true" />
          <input value={query} onChange={e => { setLoading(true); setQuery(e.target.value); }} aria-label="Search users"
            placeholder="Name, username, email or user ID" className="flex-1 bg-transparent text-base text-on-surface focus:outline-none" />
        </label>
        <select value={status} onChange={e => { setLoading(true); setStatus(e.target.value as AccountStatus | ""); }} aria-label="Filter by account status"
          className="h-11 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-sm font-semibold text-on-surface">
          <option value="">All statuses</option>
          {(Object.keys(ACCOUNT_STATUS_LABEL) as AccountStatus[]).map(s => <option key={s} value={s}>{ACCOUNT_STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {notice && <p role="status" className="rounded-xl border border-success-outline bg-success-container px-3 py-2 text-sm text-on-success-container">{notice}</p>}

      <Panel>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-on-surface-variant"><Loader2 size={16} className="animate-spin" /> Searching…</div>
        ) : rows.length === 0 ? <Empty>No users match this search.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-outline-variant text-left text-xs text-on-surface-variant">
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Reports</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.map(u => (
                  <tr key={u.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-bold text-on-surface">{u.full_name ?? "—"}{u.is_admin && <span className="ml-1.5 rounded bg-admin-chrome px-1.5 py-0.5 text-label-sm font-bold text-white">ADMIN</span>}</p>
                      <p className="text-xs text-on-surface-variant">{u.username ? `@${u.username}` : u.id.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3 text-on-surface">{u.email ?? "—"}</td>
                    <td className="px-4 py-3 capitalize text-on-surface">{u.account_type}</td>
                    <td className="px-4 py-3">
                      <StatusChip status={u.account_status} />
                      {u.is_deactivated && u.account_status === "active" && <p className="mt-1 text-label-sm text-on-surface-variant">Self-deactivated</p>}
                      {u.account_status_reason && u.account_status !== "active" && <p className="mt-1 max-w-[200px] text-label-sm text-on-surface">“{u.account_status_reason}”</p>}
                    </td>
                    <td className="px-4 py-3 text-on-surface">{u.report_count}</td>
                    <td className="px-4 py-3 text-on-surface">{fmtDateTime(u.created_at)}</td>
                    <td className="px-4 py-3">
                      {u.is_admin || u.id === currentAdminId ? <span className="text-xs text-on-surface-variant">Protected</span> : (
                        <div className="flex flex-wrap gap-1.5">
                          {ACTIONS.filter(a => a.to !== u.account_status && (a.to !== "active" || u.account_status !== "active")).map(a => (
                            <button key={a.to} type="button" onClick={() => { setPending({ user: u, to: a.to }); setReason(""); setError(null); setNotice(null); }}
                              className={`h-8 rounded-lg border px-2.5 text-xs font-bold ${a.cls}`}>{a.label}</button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-admin-chrome/50 p-4 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="status-dialog-title" className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-5 shadow-2xl">
            {(() => { const a = ACTIONS.find(x => x.to === pending.to)!; return (
              <>
                <h2 id="status-dialog-title" className="text-lg font-black text-on-surface">
                  {a.label} {pending.user.full_name ?? pending.user.username ?? "this account"}?
                </h2>
                <p className="mt-1 text-sm text-on-surface">{a.consequence}</p>
                <label className="mt-4 flex flex-col gap-1 text-sm font-semibold text-on-surface">
                  Reason (shown to the user and logged)
                  <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3}
                    className="rounded-xl border border-outline-variant px-3 py-2 text-base font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30" />
                </label>
                {error && <p role="alert" className="mt-2 rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setPending(null)} disabled={busy}
                    className="h-11 flex-1 rounded-xl border border-outline-variant text-sm font-semibold text-on-surface">Cancel</button>
                  <button type="button" onClick={confirm} disabled={busy || !reason.trim()}
                    className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 ${pending.to === "active" ? "bg-success" : pending.to === "banned" ? "bg-error" : "bg-admin-chrome"}`}>
                    {busy && <Loader2 size={14} className="animate-spin" />} Confirm {a.label.toLowerCase()}
                  </button>
                </div>
              </>
            ); })()}
          </div>
        </div>
      )}
    </div>
  );
}
