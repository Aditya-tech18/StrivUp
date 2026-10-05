"use client";

/**
 * ModeSwitcher — the way out of User mode.
 *
 * Sits under the user sidebar and shows only what this account can actually
 * reach: the admin console for an admin, Business mode for a verified
 * business, and otherwise an invitation to create or finish a business
 * profile. Without it there is no route from the user app into /business or
 * /admin at all, which is exactly how someone ends up on /quests wondering
 * where "Create Quest" went.
 *
 * Rendered as a sibling of SidebarNav rather than inside it, so the user
 * navigation file stays untouched.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Briefcase, Lock, Plus, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface AccountContext {
  is_admin: boolean;
  has_business: boolean;
  business_name: string | null;
  verification_status: string;
  can_use_business_mode: boolean;
}

export function ModeSwitcher() {
  const [ctx, setCtx] = useState<AccountContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      // One server-side answer. The client never decides what a status means.
      const { data, error } = await supabase.rpc("get_account_context");
      if (cancelled || error || !data?.[0]) return;
      setCtx(data[0] as AccountContext);
    })();

    return () => { cancelled = true; };
  }, []);

  // Signed out, or the account context could not be read — render nothing
  // rather than a misleading "verify your business" prompt.
  if (!ctx) return null;

  return (
    <div className="px-3 pb-4 mt-auto space-y-1.5">
      <p className="rail-label px-3 pb-0.5 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant/60">
        Account
      </p>

      {ctx.is_admin && (
        <Link
          href="/admin"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-on-warning-container bg-warning-container hover:bg-warning-container border border-warning-outline transition-colors"
        >
          <ShieldCheck size={18} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          <span className="rail-label truncate">Admin Console</span>
        </Link>
      )}

      {ctx.can_use_business_mode ? (
        <Link
          href="/business/dashboard"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-secondary bg-secondary/10 hover:bg-secondary/15 transition-colors"
        >
          <Briefcase size={18} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          <div className="rail-label min-w-0 flex-1">
            <p className="truncate">Business Mode</p>
            {ctx.business_name && (
              <p className="text-label-sm font-medium text-on-surface-variant truncate">
                {ctx.business_name}
              </p>
            )}
          </div>
        </Link>
      ) : ctx.has_business ? (
        // A business profile exists but isn't verified — the blue tick is the
        // gate, not the profile, so this goes to the application.
        <Link
          href="/business/verify-business"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <Lock size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          <div className="rail-label min-w-0 flex-1">
            <p className="truncate">Business Mode</p>
            <p className="text-label-sm text-on-surface-variant/70 truncate">
              Verification required
            </p>
          </div>
        </Link>
      ) : (
        <Link
          href="/business/onboarding"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <Plus size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          <span className="rail-label truncate">Create Business Profile</span>
        </Link>
      )}
    </div>
  );
}
