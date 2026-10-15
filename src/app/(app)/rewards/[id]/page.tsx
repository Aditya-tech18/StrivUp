import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Award, Coins, FileText, Info, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  formatMoney,
  getRewardById,
  rewardHistory,
  statusExplanation,
} from "@/lib/data/rewards";
import { StatusPill } from "@/components/features/rewards/StatusPill";

/**
 * /rewards/[id] — one reward, in full.
 *
 * Read with .eq("user_id", user.id) on top of the RLS policy, so a guessed id
 * belonging to somebody else is a 404 rather than a disclosure. Nothing on
 * this page is writable: the status, the amount and the history all come from
 * the row, and the row can only be changed server-side.
 *
 * The claim action is not on this page yet. The server-side claim function is
 * the next piece of work, and a button that collects a UPI ID with nothing to
 * hand it to would be worse than no button, so the page states what the claim
 * step will ask for instead of pretending to offer it.
 */
export const dynamic = "force-dynamic";

const TYPE_ICON = { cash: Coins, coupon: Ticket, badge: Award } as const;

function dateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function RewardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/rewards/${id}`);

  const reward = await getRewardById(supabase, user.id, id);
  if (!reward) notFound();

  const Icon = TYPE_ICON[reward.type] ?? Coins;
  const history = rewardHistory(reward);

  const headline =
    reward.type === "cash"
      ? formatMoney(reward.amountMinor, reward.currency)
      : reward.type === "coupon"
        ? (reward.couponTitle ?? "Coupon reward")
        : (reward.badgeCode ?? "Badge");

  const sourceHref =
    reward.sourceKind && reward.sourceId
      ? `/${reward.sourceKind === "quest" ? "quests" : "challenges"}/${reward.sourceId}`
      : null;

  return (
    <div className="min-h-screen bg-surface pb-24">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-5 py-4">
        <Link href="/rewards" aria-label="Back to my rewards">
          <ArrowLeft className="h-5 w-5 text-on-surface-variant" />
        </Link>
        <h1 className="flex-1 text-body-lg font-bold tracking-[-0.01em] text-on-surface">
          Reward details
        </h1>
      </header>

      <main className="mx-auto measure-page space-y-4 px-5 py-5">
        {/* ── Headline ──────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 elev-1 surface-raised">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/10">
              <Icon size={24} className="text-secondary" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-headline-md font-bold tracking-[-0.02em] text-on-surface">
                {headline}
              </p>
              <p className="mt-0.5 text-body-sm text-on-surface-variant">
                {reward.campaignName ?? "StrivUp reward"}
              </p>
            </div>
            <StatusPill status={reward.status} />
          </div>

          {sourceHref && reward.sourceTitle && (
            <Link
              href={sourceHref}
              className="mt-4 inline-flex text-body-md font-semibold text-secondary hover:underline"
            >
              {reward.sourceTitle}
            </Link>
          )}
        </div>

        {/* ── What this status means ────────────────────────────────────── */}
        <div className="flex gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised">
          <Info size={18} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-body-md leading-relaxed text-on-surface">
              {statusExplanation(reward.status)}
            </p>
            {reward.decisionReason && (
              <p className="mt-2 text-body-sm leading-relaxed text-on-surface-variant">
                Reason recorded: {reward.decisionReason}
              </p>
            )}
            {reward.expiresAt && (
              <p className="mt-2 text-body-sm text-on-surface-variant">
                Expires {dateTimeLabel(reward.expiresAt)}
              </p>
            )}
          </div>
        </div>

        {/* ── History ───────────────────────────────────────────────────── */}
        <section
          aria-labelledby="reward-history-heading"
          className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised"
        >
          <h2
            id="reward-history-heading"
            className="mb-3 text-body-lg font-bold tracking-[-0.01em] text-on-surface"
          >
            History
          </h2>
          <ol className="space-y-3">
            {history.map((e) => (
              <li key={`${e.label}-${e.at}`} className="flex items-baseline gap-3">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-body-md font-semibold text-on-surface">
                    {e.label}
                  </span>
                  <span className="block text-body-sm text-on-surface-variant">
                    {dateTimeLabel(e.at)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Terms ─────────────────────────────────────────────────────── */}
        <Link
          href="/rewards/terms"
          className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 transition-colors hover:bg-surface-container elev-1 surface-raised tap-target"
        >
          <FileText size={18} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
          <span className="flex-1 text-body-md font-semibold text-on-surface">
            Reward terms and conditions
          </span>
        </Link>
      </main>
    </div>
  );
}
