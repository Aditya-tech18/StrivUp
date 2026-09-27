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
        dark ? "bg-amber-400 text-gray-900 opacity-90" : "bg-gray-900 text-white opacity-90",
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
      <div className="relative overflow-hidden rounded-2xl border-2 border-blue-600 bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-blue-700">
              STARTER
            </span>
            <p className="mt-2 text-3xl font-black text-gray-900">
              ₹99<span className="text-sm font-medium text-gray-500">/month</span>
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <Rocket size={20} className="text-blue-600" aria-hidden="true" />
          </div>
        </div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {STARTER_FEATURES.map(f => (
            <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-5"><ComingSoonButton /></div>
      </div>

      {/* Growth */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/60 bg-gray-950 p-5">
        <span className="absolute right-0 top-0 rounded-bl-xl bg-amber-400 px-3 py-1 text-[10px] font-bold tracking-wider text-gray-900">
          POPULAR
        </span>
        <div className="flex items-start justify-between">
          <div>
            <span className="inline-block rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-bold tracking-wider text-gray-900">
              GROWTH
            </span>
            <p className="mt-2 text-3xl font-black text-white">
              ₹299<span className="text-sm font-medium text-gray-600">/month</span>
            </p>
          </div>
          <div className="mt-6 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <Award size={20} className="text-amber-400" aria-hidden="true" />
          </div>
        </div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {GROWTH_FEATURES.map(f => (
            <li key={f} className="flex items-start gap-2 text-sm text-gray-200">
              <Star size={16} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-5"><ComingSoonButton dark /></div>
      </div>

      <p className="px-1 text-center text-xs text-gray-600">
        Paid plans are launching soon. Creating challenges stays free.
      </p>

      {showComparison && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <p className="px-4 pt-4 text-[15px] font-black text-gray-900">Plan comparison</p>
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-600">
                  <th className="px-4 py-2.5 font-semibold">Feature</th>
                  <th className="px-4 py-2.5 font-semibold">Starter</th>
                  <th className="px-4 py-2.5 font-semibold text-blue-600">Growth</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(row => (
                  <tr key={row.feature} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.feature}</td>
                    <td className="px-4 py-3 text-gray-600">{row.starter}</td>
                    <td className="px-4 py-3 font-semibold text-blue-600">{row.growth}</td>
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
