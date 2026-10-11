"use client";
/**
 * VerificationStepper — "How Verification Works" for order_verification tasks.
 *
 * Written from the participant's side. The business side of the loop — the
 * business receiving the order, searching the code, verifying it, and STRIVUP
 * minting the bill code — all still happens, but it is work the participant
 * neither does nor waits on a screen for. Listing those steps made a four-step
 * job look like a twelve-step one, so they collapse into the single moment the
 * participant actually experiences: the bill arrives with a code on it.
 *
 * STRIVUP does not integrate with Zomato or Swiggy, so the copy never implies
 * an API handshake — the first code is typed into the order description by
 * hand, and the second is written on the bill by the restaurant.
 */

import { Building2, ReceiptText, Smartphone } from "lucide-react";

interface StepDef {
  n: number;
  text: string;
  actor: "user" | "business" | "strivup";
}

const STEPS: StepDef[] = [
  { n: 1, text: "Select eligible item",                         actor: "user" },
  { n: 2, text: "Click Upload Proof",                           actor: "user" },
  { n: 3, text: "STRIVUP generates a unique order code",        actor: "strivup" },
  { n: 4, text: "Add the code to your order description",       actor: "user" },
  { n: 5, text: "Your bill arrives with a code written on it",  actor: "business" },
  { n: 6, text: "Enter the bill code in STRIVUP",               actor: "user" },
  { n: 7, text: "Task completed",                               actor: "strivup" },
  { n: 8, text: "Quest progress updated",                       actor: "strivup" },
];

const ACTOR_STYLE: Record<StepDef["actor"], { chip: string; ring: string }> = {
  user:     { chip: "bg-blue-50 text-blue-700 border-blue-100",    ring: "bg-blue-600" },
  business: { chip: "bg-amber-50 text-amber-700 border-amber-100", ring: "bg-amber-500" },
  strivup:  { chip: "bg-gray-100 text-gray-600 border-gray-200",   ring: "bg-gray-900" },
};

const LEGEND: { actor: StepDef["actor"]; label: string; Icon: typeof Smartphone }[] = [
  { actor: "user",     label: "You",         Icon: Smartphone },
  { actor: "business", label: "Restaurant",  Icon: Building2 },
  { actor: "strivup",  label: "STRIVUP",     Icon: ReceiptText },
];

export default function VerificationStepper() {
  return (
    <section
      id="how-verification-works"
      aria-labelledby="verification-heading"
      className="bg-white rounded-2xl border border-gray-200 p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="verification-heading" className="text-[17px] font-bold text-gray-900">
            How Verification Works
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Two codes keep every order honest — one before, one on the bill.
          </p>
        </div>
        <ul className="flex items-center gap-3">
          {LEGEND.map(({ actor, label, Icon }) => (
            <li key={actor} className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${ACTOR_STYLE[actor].ring}`}
                aria-hidden="true"
              />
              <Icon size={12} className="text-gray-400" aria-hidden="true" />
              <span className="text-[11px] font-medium text-gray-500">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <ol className="mt-5 grid gap-x-6 gap-y-0 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s.n} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Connector, hidden on the last row — which is the final two
                items once the grid splits into columns. */}
            {i < STEPS.length - 2 && (
              <span
                aria-hidden="true"
                className="absolute left-[13px] top-7 bottom-0 w-px bg-gray-100"
              />
            )}
            <span
              className={`relative z-10 w-[26px] h-[26px] rounded-full border text-[11px] font-bold flex items-center justify-center shrink-0 ${ACTOR_STYLE[s.actor].chip}`}
            >
              {s.n}
            </span>
            <span className="text-sm text-gray-600 leading-relaxed pt-0.5">
              {s.text}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-2 text-xs text-gray-400 leading-relaxed border-t border-gray-100 pt-4">
        Works whether you order through Zomato or Swiggy or straight from the
        restaurant — the bill code is written on your bill either way. STRIVUP
        is not integrated with Zomato or Swiggy, so your first code travels in
        the order description you type.
      </p>
    </section>
  );
}
