/** Small presentational pieces shared by admin pages. */
import type { ReactNode } from "react";
import { AlertTriangle, Ban, CheckCircle2, Clock, HelpCircle, PauseCircle, XCircle } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-headline-lg-mobile font-black tracking-tight text-on-surface">{title}</h1>
        {subtitle && <p className="text-sm text-on-surface-variant">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-outline-variant bg-surface-container-lowest ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
          <h2 className="text-body-lg font-black text-on-surface">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-on-surface-variant">{children}</p>;
}

const CHIP: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending_review:  { label: "Pending review",  cls: "bg-warning-container text-on-warning-container border-warning-outline", icon: Clock },
  submitted:       { label: "Pending review",  cls: "bg-warning-container text-on-warning-container border-warning-outline", icon: Clock },
  under_review:    { label: "Under review",    cls: "bg-warning-container text-on-warning-container border-warning-outline", icon: Clock },
  needs_more_info: { label: "Needs info",      cls: "bg-secondary-fixed text-on-secondary-fixed border-secondary-fixed-dim", icon: HelpCircle },
  approved:        { label: "Approved",        cls: "bg-success-container text-on-success-container border-success-outline", icon: CheckCircle2 },
  verified:        { label: "Verified",        cls: "bg-success-container text-on-success-container border-success-outline", icon: CheckCircle2 },
  rejected:        { label: "Rejected",        cls: "bg-error-container text-on-error-container border-error-outline", icon: XCircle },
  withdrawn:       { label: "Withdrawn",       cls: "bg-surface-container-low text-on-surface border-outline-variant", icon: XCircle },
  draft:           { label: "Not submitted",   cls: "bg-surface-container-low text-on-surface border-outline-variant", icon: HelpCircle },
  incomplete:      { label: "Not submitted",   cls: "bg-surface-container-low text-on-surface border-outline-variant", icon: HelpCircle },
  suspended:       { label: "Suspended",       cls: "bg-error-container text-on-error-container border-error-outline", icon: PauseCircle },
  active:          { label: "Active",          cls: "bg-success-container text-on-success-container border-success-outline", icon: CheckCircle2 },
  deactivated:     { label: "Deactivated",     cls: "bg-surface-container-low text-on-surface border-outline-variant", icon: PauseCircle },
  banned:          { label: "Banned",          cls: "bg-error-container text-on-error-container border-error-outline", icon: Ban },
  pending:         { label: "Pending",         cls: "bg-warning-container text-on-warning-container border-warning-outline", icon: Clock },
};

export function StatusChip({ status }: { status: string }) {
  const c = CHIP[status] ?? { label: status, cls: "bg-surface-container-low text-on-surface border-outline-variant", icon: AlertTriangle };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-label-sm font-bold ${c.cls}`}>
      <c.icon size={12} aria-hidden="true" /> {c.label}
    </span>
  );
}

export const fmtDateTime = (d: string | null) => d
  ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  : "—";
