import { Lock } from "lucide-react";

export function ClosedBadge() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-2.5 py-1 text-xs font-bold text-on-surface">
      <Lock size={13} aria-hidden="true" /> Closed
    </span>
  );
}
