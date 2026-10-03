/**
 * CreatorPlans — Creator Pro plan cards + comparison table.
 *
 * Shared by /creator/pro and the "Personal Branding" tab of /challenges/new.
 * Payments are not live yet, so the CTAs are disabled "Coming soon" buttons —
 * prices are illustrative product concepts, not a checkout.
 */

import { Award, CheckCircle2, Rocket, Star } from "lucide-react";

const STARTER_FEATURES = [
  "Premium challenge card design",
  "Featured placement in Explore",
  "Reach up to 2,000 people nearby",
  "Social media links on your challenges",
  "Basic analytics",
];

const GROWTH_FEATURES = [
  "Everything in Starter",
  "Reach up to 10,000 active users",
  "Homepage recommendation",
  "Custom website link & CTA",
  "Advanced analytics",
];

const COMPARISON: { feature: string; starter: string; growth: string }[] = [
  { feature: "User reach",         starter: "2,000",    growth: "10,000"   },
  { feature: "Analytics",          starter: "Basic",    growth: "Advanced" },
  { feature: "Explore placement",  starter: "Featured", growth: "Featured" },
  { feature: "Homepage spot",      starter: "—",        growth: "✓"        },
  { feature: "Custom website link", starter: "—",       growth: "✓"        },
];

function ComingSoonButton({ dark }: { dark?: boolean }) {
  return (
    <button
      type="button"
      disabled
      className={[
        "w-full h-11 rounded-xl text-sm font-bold tracking-wide cursor-not-allowed",
        dark ? "bg-amber-400 text-on-surface opacity-90" : "bg-primary text-white opacity-90",
      ].join(" ")}
    >
      Coming soon
    </button>
  );
}

export function CreatorPlans({ showComparison = true }: { showComparison?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Starter */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-secondary bg-surface-container-lowest p-5">
        <div className="flex items-start justify-between">
          <div>
            <span className="inline-block rounded-md bg-secondary-fixed px-2 py-0.5 text-[10px] font-bold tracking-wider text-secondary">
              STARTER
            </span>
            <p className="mt-2 text-3xl font-black text-on-surface">
              ₹99<span className="text-sm font-medium text-on-surface-variant">/month</span>
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-fixed">
            <Rocket size={20} className="text-secondary" aria-hidden="true" />
          </div>
        </div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {STARTER_FEATURES.map(f => (
            <li key={f} className="flex items-start gap-2 text-sm text-on-surface-variant">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-secondary" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-5"><ComingSoonButton /></div>
      </div>

      {/* Growth */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/60 bg-gray-950 p-5">
        <span className="absolute right-0 top-0 rounded-bl-xl bg-amber-400 px-3 py-1 text-[10px] font-bold tracking-wider text-on-surface">
          POPULAR
        </span>
        <div className="flex items-start justify-between">
          <div>
            <span className="inline-block rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-bold tracking-wider text-on-surface">
              GROWTH
            </span>
            <p className="mt-2 text-3xl font-black text-white">
              ₹299<span className="text-sm font-medium text-on-surface-variant">/month</span>
            </p>
          </div>
          <div className="mt-6 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-lowest/10">
            <Award size={20} className="text-amber-400" aria-hidden="true" />
          </div>
        </div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {GROWTH_FEATURES.map(f => (
            <li key={f} className="flex items-start gap-2 text-sm text-on-surface-variant">
              <Star size={16} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-5"><ComingSoonButton dark /></div>
      </div>

      <p className="px-1 text-center text-xs text-on-surface-variant">
        Paid plans are launching soon. Creating challenges stays free.
      </p>

      {showComparison && (
        <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
          <p className="px-4 pt-4 text-[15px] font-black text-on-surface">Plan comparison</p>
          <div className="overflow-x-auto no-scrollbar">
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="bg-surface-container-low text-left text-xs text-on-surface-variant">
                  <th className="px-4 py-2.5 font-semibold">Feature</th>
                  <th className="px-4 py-2.5 font-semibold">Starter</th>
                  <th className="px-4 py-2.5 font-semibold text-secondary">Growth</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(row => (
                  <tr key={row.feature} className="border-t border-outline-variant">
                    <td className="px-4 py-3 font-medium text-on-surface">{row.feature}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{row.starter}</td>
                    <td className="px-4 py-3 font-semibold text-secondary">{row.growth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
