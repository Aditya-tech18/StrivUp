"use client";

/**
 * /dev/quest-otp — dev-only harness for OrderVerificationModal.
 *
 * The real modal needs a signed-in participant, a live Quest and a business
 * sitting at a console marking orders verified, so the one thing that could
 * never be checked by opening the app was the flow itself. This drives it
 * against a stub Supabase client: no network, no database, nothing real.
 *
 * Four scenarios, which are the four the state machine can be in:
 *   fresh     no row. The sheet should issue a code and land on it with no
 *             question asked, which is the change this harness exists for.
 *   issued    code_issued. Section 2 typable, order not confirmed yet.
 *   verified  order_verified. Section 2 live, submitting completes the task.
 *   error     the RPC refuses, e.g. not joined to the Quest.
 *
 * 404s in production, like /dev/components.
 */

import { useState } from "react";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import OrderVerificationModal from "@/components/features/quest/OrderVerificationModal";
import type { OrderVerification } from "@/lib/data/questOrderVerification";

type Scenario = "fresh" | "issued" | "verified" | "error";

function row(status: OrderVerification["status"]): OrderVerification {
  return {
    id: "stub-row",
    quest_id: "stub-quest",
    task_id: "stub-task",
    user_id: "stub-user",
    business_id: "stub-business",
    order_code: "SV7421",
    bill_code: status === "order_verified" ? "SV9034" : null,
    platform: "zomato",
    status,
    issued_on: new Date().toISOString().slice(0, 10),
    expires_at: new Date(Date.now() + 86_400_000 * 30).toISOString(),
    order_verified_at: status === "order_verified" ? new Date().toISOString() : null,
    bill_code_issued_at: status === "order_verified" ? new Date().toISOString() : null,
    completed_at: null,
    bill_code_attempts: 0,
    created_at: new Date().toISOString(),
  };
}

/**
 * The stub. Only .rpc is reached: issueOrderCode and
 * completeTaskWithBillCode are the two calls the modal makes, and both go
 * through it. A deliberate 400ms delay, so the loading step is visible
 * rather than a flash.
 */
function stubClient(scenario: Scenario): SupabaseClient {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      await new Promise((r) => setTimeout(r, 400));

      if (name === "issue_quest_order_code") {
        if (scenario === "error") {
          return { data: null, error: { message: "Join the Quest before starting a task" } };
        }
        return { data: row(scenario === "verified" ? "order_verified" : "code_issued"), error: null };
      }

      if (name === "complete_task_with_bill_code") {
        const given = String(args.p_bill_code ?? "").toUpperCase();
        if (given !== "SV9034") {
          return { data: null, error: { message: "That bill code does not match" } };
        }
        return { data: { ...row("order_verified"), status: "completed" }, error: null };
      }

      return { data: null, error: { message: `unstubbed rpc: ${name}` } };
    },
  } as unknown as SupabaseClient;
}

const SCENARIOS: { key: Scenario; label: string; hint: string }[] = [
  { key: "fresh",    label: "Fresh task",      hint: "No row. Should go straight to the code." },
  { key: "issued",   label: "Code issued",     hint: "Order not confirmed by the business yet." },
  { key: "verified", label: "Order verified",  hint: "Bill code SV9034 completes the task." },
  { key: "error",    label: "Cannot issue",    hint: "RPC refuses. Retry and How it works." },
];

export default function QuestOtpHarness() {
  if (process.env.NODE_ENV === "production") notFound();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [scenario, setScenario] = useState<Scenario | null>(null);

  return (
    <div className="min-h-screen bg-surface p-5">
      <main className="mx-auto flex max-w-md flex-col gap-4">
        <header>
          <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
            Dev harness
          </p>
          <h1 className="text-headline-lg-mobile text-on-surface">Quest OTP sheet</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Stubbed Supabase. Nothing here reaches the database.
          </p>
        </header>

        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            type="button"
            data-testid={`open-${s.key}`}
            onClick={() => setScenario(s.key)}
            className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 text-left elev-1 surface-raised"
          >
            <span className="block text-body-lg font-bold text-on-surface">{s.label}</span>
            <span className="block text-body-sm text-on-surface-variant">{s.hint}</span>
          </button>
        ))}

        {scenario && (
          <OrderVerificationModal
            key={scenario}
            open
            onClose={() => setScenario(null)}
            supabase={stubClient(scenario)}
            questId="stub-quest"
            taskId="stub-task"
            taskTitle="Order the Malai Chaap"
            userName="Adi"
            businessName="Veer Ji Malai Chaap"
            existing={
              scenario === "issued"
                ? row("code_issued")
                : scenario === "verified"
                  ? row("order_verified")
                  : null
            }
            onIssued={() => {}}
            onCompleted={() => {}}
          />
        )}
      </main>
    </div>
  );
}
