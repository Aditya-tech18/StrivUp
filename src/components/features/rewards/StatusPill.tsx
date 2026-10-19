/**
 * StatusPill — the one place a reward status becomes a colour and a word.
 *
 * Both the list and the detail screen render through this, so a reward can
 * never read "Paid" in one place and "Processing" in the other. The tone
 * mapping lives in src/lib/data/rewards.ts beside the status definitions.
 *
 * Colour is never the only signal: the word is always present, which is what
 * keeps the status legible to someone who cannot distinguish the hues.
 */

import { statusLabel, statusTone, type RewardStatus } from "@/lib/data/rewards";

const TONE_CLASS: Record<string, string> = {
  neutral: "bg-surface-container text-on-surface-variant",
  info: "bg-secondary/10 text-secondary",
  action: "bg-warning-container text-warning",
  success: "bg-success/15 text-success",
  danger: "bg-error/10 text-error",
};

export function StatusPill({ status }: { status: RewardStatus }) {
  const tone = statusTone(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-label-sm font-bold ${
        TONE_CLASS[tone] ?? TONE_CLASS.neutral
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}
