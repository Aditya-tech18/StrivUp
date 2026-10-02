/** Small presentational pieces shared by admin pages. */
import type { ReactNode } from "react";
import { AlertTriangle, Ban, CheckCircle2, Clock, HelpCircle, PauseCircle, XCircle } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[24px] font-black tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <h2 className="text-[15px] font-black text-gray-900">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-gray-600">{children}</p>;
}

const CHIP: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending_review:  { label: "Pending review",  cls: "bg-amber-50 text-amber-900 border-amber-200", icon: Clock },
  submitted:       { label: "Pending review",  cls: "bg-amber-50 text-amber-900 border-amber-200", icon: Clock },
  under_review:    { label: "Under review",    cls: "bg-amber-50 text-amber-900 border-amber-200", icon: Clock },
  needs_more_info: { label: "Needs info",      cls: "bg-blue-50 text-blue-900 border-blue-200", icon: HelpCircle },
  approved:        { label: "Approved",        cls: "bg-green-50 text-green-900 border-green-200", icon: CheckCircle2 },
  verified:        { label: "Verified",        cls: "bg-green-50 text-green-900 border-green-200", icon: CheckCircle2 },
  rejected:        { label: "Rejected",        cls: "bg-red-50 text-red-900 border-red-200", icon: XCircle },
  withdrawn:       { label: "Withdrawn",       cls: "bg-gray-100 text-gray-800 border-gray-200", icon: XCircle },
  draft:           { label: "Not submitted",   cls: "bg-gray-100 text-gray-800 border-gray-200", icon: HelpCircle },
  incomplete:      { label: "Not submitted",   cls: "bg-gray-100 text-gray-800 border-gray-200", icon: HelpCircle },
  suspended:       { label: "Suspended",       cls: "bg-red-50 text-red-900 border-red-200", icon: PauseCircle },
  active:          { label: "Active",          cls: "bg-green-50 text-green-900 border-green-200", icon: CheckCircle2 },
  deactivated:     { label: "Deactivated",     cls: "bg-gray-100 text-gray-800 border-gray-200", icon: PauseCircle },
  banned:          { label: "Banned",          cls: "bg-red-100 text-red-900 border-red-300", icon: Ban },
  pending:         { label: "Pending",         cls: "bg-amber-50 text-amber-900 border-amber-200", icon: Clock },
};

export function StatusChip({ status }: { status: string }) {
  const c = CHIP[status] ?? { label: status, cls: "bg-gray-100 text-gray-800 border-gray-200", icon: AlertTriangle };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${c.cls}`}>
      <c.icon size={12} aria-hidden="true" /> {c.label}
    </span>
  );
}

export const fmtDateTime = (d: string | null) => d
  ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  : "—";
