import { BadgeCheck, ShieldAlert, ShieldQuestion, Smartphone } from "lucide-react";
import type { ActivitySource, VerificationStatus, ActivityStatus } from "@/lib/activity/types";

/**
 * ActivityVerificationStatus — the trust chip.
 *
 * Spec §11 turns on this distinction being visible: HEALTHKIT + VERIFIED is a
 * different claim from MANUAL + SELF_REPORTED, and the user should never have
 * to guess which one they are looking at. This component is the only place
 * that renders that, so the wording stays consistent everywhere.
 */

const SOURCE_LABEL: Record<ActivitySource, string> = {
  FITBIT: "Fitbit",
  STRAVA: "Strava",
  GOOGLE_FIT: "Google Fit",
  HEALTH_CONNECT: "Health Connect",
  HEALTHKIT: "Apple Health",
  DEVICE_SENSOR: "This device",
  STRIVUP_NATIVE: "STRIVUP app",
  MANUAL: "Entered by hand",
};

export function sourceLabel(source: ActivitySource): string {
  return SOURCE_LABEL[source] ?? source;
}

export function ActivityVerificationStatus({
  source,
  verification,
  activityStatus = "VALID",
  className = "",
}: {
  source: ActivitySource;
  verification: VerificationStatus;
  activityStatus?: ActivityStatus;
  className?: string;
}) {
  if (activityStatus !== "VALID") {
    const label =
      activityStatus === "REJECTED"
        ? "Rejected"
        : activityStatus === "UNDER_REVIEW"
          ? "Under review"
          : "Flagged for review";
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-warning-container px-2 py-0.5 text-[11px] font-medium text-on-warning-container ${className}`}
      >
        <ShieldAlert className="h-3 w-3" /> {label}
      </span>
    );
  }

  if (verification === "VERIFIED") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-success-container px-2 py-0.5 text-[11px] font-medium text-on-success-container ${className}`}
      >
        <BadgeCheck className="h-3 w-3" /> Verified by {sourceLabel(source)}
      </span>
    );
  }

  if (verification === "SELF_REPORTED") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-secondary-fixed px-2 py-0.5 text-[11px] font-medium text-secondary ${className}`}
      >
        <Smartphone className="h-3 w-3" /> Self-reported · {sourceLabel(source)}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-medium text-on-surface-variant ${className}`}
    >
      <ShieldQuestion className="h-3 w-3" /> Unverified
    </span>
  );
}
