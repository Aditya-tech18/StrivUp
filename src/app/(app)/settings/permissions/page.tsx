"use client";

/**
 * /settings/permissions — notifications and location, changeable after the
 * first-launch sheet.
 *
 * The same two rows the sheet shows, so there is one description of what each
 * permission is for and one implementation of turning it on.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PermissionControls } from "@/components/features/permissions/PermissionControls";

export default function PermissionsSettingsPage() {
  return (
    <div className="min-h-screen bg-surface pb-24">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-5 py-4 pt-safe">
        <Link href="/settings" aria-label="Back to settings">
          <ArrowLeft className="h-5 w-5 text-on-surface-variant" />
        </Link>
        <h1 className="flex-1 text-body-lg font-bold tracking-[-0.01em] text-on-surface">
          Permissions
        </h1>
      </header>

      <main className="mx-auto measure-form space-y-4 px-5 py-5">
        <PermissionControls variant="settings" />

        <p className="text-label-md leading-relaxed text-on-surface-variant">
          A browser will not let an app switch a permission off from inside the
          page. Turning notifications off here deletes this device&apos;s push
          registration, which genuinely stops them. Turning location off stops
          StrivUp asking for a fix and clears the one it had. To revoke the
          permissions themselves, use your browser or Android app settings.
        </p>
      </main>
    </div>
  );
}
