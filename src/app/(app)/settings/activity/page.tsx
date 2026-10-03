import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { allProviders } from "@/lib/activity/providers";
import { getActivityConnections, getActivityHistory } from "@/lib/data/activity";
import {
  ActivityProviderCard,
  ActivityHistory,
  LiveStepTracker,
} from "@/components/features/activity";
import type { ActivityProviderId } from "@/lib/activity/types";

/**
 * /settings/activity — connect, inspect and disconnect activity tracking
 * (spec §23, §22).
 *
 * Server component: `allProviders()` reads client secrets to decide what is
 * configured, so that decision has to happen on the server. Only the id,
 * label, description and a configured boolean cross to the client.
 */
export const dynamic = "force-dynamic";

export default async function ActivitySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; provider?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/settings/activity");

  const [connections, history] = await Promise.all([
    getActivityConnections(supabase, user.id),
    getActivityHistory(supabase, user.id, 20),
  ]);

  const byProvider = new Map(connections.map((c) => [c.provider as ActivityProviderId, c]));

  const providers = allProviders().map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    configured: p.isConfigured(),
  }));

  const errorMessage =
    params.error === "declined"
      ? "You declined access. Nothing was connected."
      : params.error === "state_mismatch"
        ? "That connection attempt could not be verified. Please try again."
        : params.error === "not_configured"
          ? "That provider is not set up on this deployment yet."
          : params.error
            ? "Something went wrong connecting that provider."
            : null;

  return (
    <div className="min-h-screen bg-surface pb-20">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-5 py-4">
        <Link href="/settings" aria-label="Back to settings">
          <ArrowLeft className="h-5 w-5 text-on-surface-variant" />
        </Link>
        <h1 className="text-base font-semibold text-on-surface">Activity tracking</h1>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-5 py-5">
        {params.connected && (
          <div className="rounded-xl bg-green-50 p-3 text-sm text-green-800">
            Connected. Your activity will now be counted toward physical quests automatically.
          </div>
        )}
        {errorMessage && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{errorMessage}</div>
        )}

        <section>
          <h2 className="mb-1 text-sm font-semibold text-on-surface">How this works</h2>
          <p className="mb-3 text-xs leading-relaxed text-on-surface-variant">
            StrivUp counts your steps using your phone&apos;s motion sensor while the app is
            open. Tap start, put the phone in your pocket, and walk — your physical quest
            tasks complete themselves, with no photo to upload and no other app to install.
          </p>

          {/* The in-app counter is the primary source: nothing to connect, and
              it works on any phone with a motion sensor. */}
          <LiveStepTracker />
        </section>

        <section>
          <h2 className="mb-1 text-sm font-semibold text-on-surface">Other sources</h2>
          <p className="mb-3 text-xs leading-relaxed text-on-surface-variant">
            Optional. Only needed if you want runs and rides from a service you already use.
          </p>

          <div className="space-y-2.5">
            {providers.map((p) => (
              <ActivityProviderCard
                key={p.id}
                id={p.id}
                label={p.label}
                description={p.description}
                configured={p.configured}
                connection={byProvider.get(p.id as ActivityProviderId) ?? null}
              />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface">
            <ShieldCheck className="h-4 w-4 text-green-600" /> Your privacy
          </h2>
          <ul className="space-y-1.5 text-xs leading-relaxed text-on-surface-variant">
            <li>• We read only the activity needed for quests you have joined.</li>
            <li>
              • Businesses see your progress toward their own quest — never your health history.
            </li>
            <li>• Disconnecting deletes our access immediately.</li>
            <li>
              • Activity already counted toward a completed quest is kept so rewards stay
              auditable.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-on-surface">Recent activity</h2>
          <ActivityHistory records={history} />
        </section>
      </main>
    </div>
  );
}
