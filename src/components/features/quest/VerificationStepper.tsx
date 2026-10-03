"use client";
/**
 * VerificationStepper — "How Verification Works" for order_verification tasks.
 *
 * Describes the real loop: two codes, both carried by hand. STRIVUP does not
 * integrate with Zomato or Swiggy, so the copy never implies an API handshake
 * — the user types the first code into the order description, and the business
 * writes the second on the printed bill.
 */

import { Building2, ReceiptText, Smartphone } from "lucide-react";

interface StepDef {
  n: number;
  text: string;
  actor: "user" | "business" | "strivup";
}

const STEPS: StepDef[] = [
  { n: 1,  text: "Select eligible item",                        actor: "user" },
  { n: 2,  text: "Click Upload Proof",                          actor: "user" },
  { n: 3,  text: "STRIVUP generates unique order OTP",          actor: "strivup" },
  { n: 4,  text: "Add OTP to Zomato/Swiggy order description",  actor: "user" },
  { n: 5,  text: "Business receives the order",                 actor: "business" },
  { n: 6,  text: "Business searches OTP in STRIVUP",            actor: "business" },
  { n: 7,  text: "Business verifies the order",                 actor: "business" },
  { n: 8,  text: "STRIVUP generates a new bill verification OTP", actor: "strivup" },
  { n: 9,  text: "Business writes the new OTP on the bill",     actor: "business" },
  { n: 10, text: "User enters the bill OTP in STRIVUP",         actor: "user" },
  { n: 11, text: "Task completed",                              actor: "strivup" },
  { n: 12, text: "Quest progress updated",                      actor: "strivup" },
];

const ACTOR_STYLE: Record<StepDef["actor"], { chip: string; ring: string }> = {
  user:     { chip: "bg-secondary-fixed text-secondary border-secondary-fixed-dim",   ring: "bg-secondary" },
  business: { chip: "bg-warning-container text-on-warning-container border-warning-outline", ring: "bg-warning" },
  strivup:  { chip: "bg-surface-container text-on-surface-variant border-outline-variant",  ring: "bg-primary" },
};

const LEGEND: { actor: StepDef["actor"]; label: string; Icon: typeof Smartphone }[] = [
  { actor: "user",     label: "You",      Icon: Smartphone },
  { actor: "business", label: "Business", Icon: Building2 },
  { actor: "strivup",  label: "STRIVUP",  Icon: ReceiptText },
];

export default function VerificationStepper() {
  return (
    <section
      id="how-verification-works"
      aria-labelledby="verification-heading"
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 elev-1 surface-raised"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="verification-heading" className="text-body-lg font-bold text-on-surface">
            How Verification Works
          </h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
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
              <Icon size={12} className="text-on-surface-variant" aria-hidden="true" />
              <span className="text-label-sm font-medium text-on-surface-variant">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <ol className="mt-5 grid gap-x-6 gap-y-0 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s.n} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Connector — hidden on the final row of each column. */}
            {i !== STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[13px] top-7 bottom-0 w-px bg-surface-container"
              />
            )}
            <span
              className={`relative z-10 w-[26px] h-[26px] rounded-full border text-label-sm font-bold flex items-center justify-center shrink-0 ${ACTOR_STYLE[s.actor].chip}`}
            >
              {s.n}
            </span>
            <span className="text-sm text-on-surface-variant leading-relaxed pt-0.5">
              {s.text}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-2 text-xs text-on-surface-variant leading-relaxed border-t border-outline-variant pt-4">
        STRIVUP is not integrated with Zomato or Swiggy. Your verification code
        travels in the order description you type, and the bill code is written
        on your bill by the business.
      </p>
    </section>
  );
}
