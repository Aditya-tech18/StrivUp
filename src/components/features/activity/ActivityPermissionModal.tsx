"use client";

import { X, Activity, Lock, Eye } from "lucide-react";
import { Button } from "@/components/ui";
import { activityLabel } from "@/lib/activity/types";
import type { ActivityType } from "@/lib/activity/types";

/**
 * ActivityPermissionModal — the explanation screen behind "Start tracking"
 * (spec §7, §22).
 *
 * Two rules this encodes:
 *
 *  1. Ask only for what this quest needs. The list below is derived from the
 *     task's own activity type, not a fixed superset — a steps quest does not
 *     get to ask for cycling data.
 *  2. Say plainly what is read, who sees it, and how to revoke it. Physical
 *     activity is sensitive personal data and this is the screen where the
 *     user decides, so it should not be a wall of legal text.
 */
export function ActivityPermissionModal({
  open,
  onClose,
  onAllow,
  activityType,
  questTitle,
  businessName,
  connecting = false,
}: {
  open: boolean;
  onClose: () => void;
  onAllow: () => void;
  activityType: ActivityType;
  questTitle?: string;
  businessName?: string | null;
  connecting?: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-permission-title"
    >
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 id="activity-permission-title" className="text-lg font-bold text-gray-900">
                Track your activity
              </h2>
              <p className="text-xs text-gray-500">
                {questTitle ? `For "${questTitle}"` : "For this quest"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-gray-600">
          STRIVUP needs to read your activity data to verify this quest automatically, so you
          don&apos;t have to upload anything.
        </p>

        <div className="mb-4 rounded-xl bg-gray-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            What we read
          </p>
          <ul className="space-y-1.5 text-sm text-gray-700">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              {activityLabel(activityType)} data only
            </li>
          </ul>
        </div>

        <div className="mb-5 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <p className="text-xs leading-relaxed text-gray-600">
              {businessName ?? "The business"} sees only your progress toward this task — never
              your health history.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <p className="text-xs leading-relaxed text-gray-600">
              You can disconnect at any time from Settings → Activity tracking.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button variant="primary" fullWidth onClick={onAllow} disabled={connecting}>
            {connecting ? "Connecting…" : "Allow activity access"}
          </Button>
          <Button variant="outline" fullWidth onClick={onClose} disabled={connecting}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
