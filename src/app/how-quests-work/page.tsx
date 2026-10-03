/**
 * /how-quests-work — public explainer for the STRIVUP Quest system and its
 * two-stage Order Verification flow. No sign-in required, so it can be shared
 * with businesses, participants, mentors and investors.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, ClipboardCheck, Eye, Flag, Gift,
  ListChecks, Receipt, Search, ShieldCheck, Smartphone, Store, Trophy, User, XCircle,
} from "lucide-react";

export const metadata: Metadata = {
  title: "How Quests Work — STRIVUP",
  description:
    "STRIVUP Quests turn business promotions into verified real-world actions with two-stage order verification.",
};

type Actor = "user" | "strivup" | "business";

const ACTOR: Record<Actor, { label: string; cls: string; icon: typeof User }> = {
  user:     { label: "Participant", cls: "bg-secondary-fixed text-on-secondary-fixed border-secondary-fixed-dim",   icon: User },
  strivup:  { label: "STRIVUP",     cls: "bg-primary text-on-primary border-primary",     icon: ShieldCheck },
  business: { label: "Business",    cls: "bg-warning-container text-on-warning-container border-warning-outline", icon: Store },
};

const FLOW: { actor: Actor; title: string; body: string; code?: { label: string; value: string; tone: "sv" | "bv" } }[] = [
  { actor: "user",     title: "Join the Quest",               body: "Discover a Quest, read the task, reward and rules, then tap Join Quest. Progress starts at 0." },
  { actor: "user",     title: "Pick the eligible item",       body: "Open the task and tap Order on Zomato or Swiggy. Add the eligible item to your cart — don't place the order yet." },
  { actor: "user",     title: "Tap Post Proof",               body: "Back in STRIVUP, Post Proof starts the verification for this task." },
  { actor: "strivup",  title: "Order code is generated",       body: "A unique, short, single-use code tied to you, this Quest and this task. Valid for 24 hours.",
    code: { label: "Order verification code · OTP 1", value: "SV-981042", tone: "sv" } },
  { actor: "user",     title: "Add it to the order note",     body: "Paste the code into the Zomato/Swiggy order description or cooking instructions, then place the order." },
  { actor: "business", title: "Business searches the code",   body: "The restaurant sees the code on the incoming order, opens Verify Order in STRIVUP and searches it. STRIVUP shows the Quest, the task and your display name." },
  { actor: "business", title: "Business verifies the order",  body: "If the order is genuine and eligible, they tap Verify Order. (Or Reject, with a reason you'll see.) Your progress does not change yet." },
  { actor: "strivup",  title: "Bill code is generated",        body: "A second, different code bound to your original verification. Only you can use it, only once, within 24 hours.",
    code: { label: "Bill verification code · OTP 2", value: "BV-642815", tone: "bv" } },
  { actor: "business", title: "Code goes on the bill",        body: "The business writes or prints the bill code on the bill that travels with your order." },
  { actor: "user",     title: "Enter the bill code",          body: "When your order arrives, open the task and enter the code from the bill. Tap Verify & Complete." },
  { actor: "strivup",  title: "Task completed ✓",              body: "STRIVUP checks the code belongs to you and this task, the order was verified, the code is unused and in date, and the Quest is live. Then progress goes up (e.g. 1/3) and the leaderboard updates." },
];

const EDGE_CASES: { q: string; a: string }[] = [
  { q: "I generated a code but never ordered.",          a: "Nothing happens. The attempt stays “waiting for business” until it expires. No progress, no reward, no leaderboard change." },
  { q: "I placed the order without the code.",          a: "The business can't link that order to the Quest, so it can't be verified automatically. Contact the business if the Quest rules allow it." },
  { q: "The business rejected my order.",               a: "You'll see “Verification rejected” with their reason if they gave one. Tap Post Proof again for your next eligible order." },
  { q: "I typed the bill code wrong.",                  a: "You'll see “Invalid verification code.” Nothing changes — check the bill and try again. After 5 wrong codes in an hour, entry pauses for an hour." },
  { q: "Can a bill code be used twice?",                a: "No. The second attempt shows “Already used.”" },
  { q: "Can someone else use my bill code?",            a: "No. It's bound to your original verification, so anyone else sees “This verification code does not belong to this task.”" },
  { q: "What if I share my order code (OTP 1)?",        a: "It isn't enough to complete anything. Only the business can turn it into a bill code, and that bill code only works for you." },
  { q: "Does generating a code or business approval count?", a: "No. Only a successful bill-code entry completes a task and counts toward progress and ranking." },
];

const RULES = [
  "Join the Quest before attempting a task.",
  "Only eligible items and orders count.",
  "Generate your verification code with Post Proof.",
  "Put that code in the Zomato/Swiggy order description.",
  "The business must verify the code in STRIVUP.",
  "The business writes the new bill code on your bill.",
  "Enter the bill code in STRIVUP.",
  "Only a successful bill-code entry counts toward progress.",
  "Used, invalid or expired codes can't be reused.",
  "Fraudulent or duplicate activity can be rejected.",
  "Only verified progress affects the leaderboard.",
  "Reward eligibility follows the Quest's published reward conditions.",
];

function CodeChip({ label, value, tone }: { label: string; value: string; tone: "sv" | "bv" }) {
  return (
    <div className={`mt-3 rounded-xl border-2 border-dashed px-4 py-3 ${tone === "sv" ? "border-secondary-fixed-dim bg-secondary-fixed" : "border-success-outline bg-success-container"}`}>
      <p className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className="font-mono text-2xl font-black tracking-widest text-on-surface">{value}</p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-headline-md font-black tracking-tight text-on-surface">{title}</h2>
      {children}
    </section>
  );
}

export default function HowQuestsWorkPage() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-3 py-2 [padding-top:max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/quests" aria-label="Back to Quests" className="flex h-11 w-11 items-center justify-center rounded-xl">
          <ArrowLeft size={20} className="text-on-surface-variant" />
        </Link>
        <p className="flex-1 text-body-lg font-black text-on-surface">How Quests Work</p>
        <span className="pr-2 text-label-sm font-black tracking-[0.2em] text-secondary">STRIVUP</span>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-10 px-4 pb-16 pt-6">
        {/* Hero */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-secondary">STRIVUP Quests</p>
          <h1 className="text-headline-lg font-black leading-tight tracking-tight text-on-surface">
            Business promotions, turned into verified real-world actions.
          </h1>
          <p className="text-body-lg leading-relaxed text-on-surface-variant">
            Users join a Quest, place an eligible order, generate a unique STRIVUP code, link it to their order, get verified by
            the business, receive a second code on their bill, and complete the task to earn progress and rewards.
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
            {["Discover", "Join", "Act", "Verify", "Progress", "Reward", "Return"].map((s, i, a) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="rounded-full border border-outline-variant bg-surface-container-lowest px-2.5 py-1">{s}</span>
                {i < a.length - 1 && <ArrowRight size={12} className="text-on-surface-variant" aria-hidden="true" />}
              </span>
            ))}
          </div>
        </div>

        {/* Challenge vs Quest */}
        <Section id="vs" title="Challenge vs Quest">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Challenge</p>
              <p className="mt-1 text-body-lg font-black text-on-surface">Personal growth</p>
              <p className="mt-1 text-sm text-on-surface-variant">100 Days of LeetCode, 30 Days Fitness, Daily Reading.</p>
              <p className="mt-3 text-xs font-semibold text-on-surface-variant">Join → Daily task → Upload proof → Streak → Community</p>
            </div>
            <div className="rounded-2xl border border-secondary-fixed-dim bg-surface-container-lowest p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-secondary">Quest</p>
              <p className="mt-1 text-body-lg font-black text-on-surface">Real-world business action</p>
              <p className="mt-1 text-sm text-on-surface-variant">Order a featured dish, visit an outlet, try a product, attend an event.</p>
              <p className="mt-3 text-xs font-semibold text-on-surface-variant">Join → Business action → Verify → Progress → Reward</p>
            </div>
          </div>
        </Section>

        {/* Building blocks */}
        <Section id="parts" title="What a Quest is made of">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { icon: Flag,           t: "Quest",    d: "The overall campaign." },
              { icon: ListChecks,     t: "Task",     d: "One action, e.g. order and try a dish." },
              { icon: ClipboardCheck, t: "Proof",    d: "How the action is verified. For orders: two codes." },
              { icon: BadgeCheck,     t: "Progress", d: "Verified tasks done, e.g. 1/3." },
              { icon: Gift,           t: "Reward",   d: "What completing the Quest can earn." },
              { icon: Trophy,         t: "Leaderboard", d: "Optional ranking on verified progress." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
                <Icon size={18} className="text-secondary" aria-hidden="true" />
                <p className="mt-2 text-sm font-bold text-on-surface">{t}</p>
                <p className="mt-0.5 text-xs leading-snug text-on-surface-variant">{d}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* The flow */}
        <Section id="flow" title="Order Verification, step by step">
          <p className="text-sm text-on-surface-variant">
            Used for restaurant and delivery Quests. STRIVUP doesn&apos;t need a Zomato or Swiggy integration: the code in the order
            note is the bridge between the STRIVUP participant and the real order.
          </p>
          <ol className="flex flex-col">
            {FLOW.map((step, i) => {
              const a = ACTOR[step.actor];
              return (
                <li key={step.title} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-black text-white">{i + 1}</span>
                    {i < FLOW.length - 1 && <span className="w-0.5 flex-1 bg-surface-container-highest" aria-hidden="true" />}
                  </div>
                  <div className="flex-1 pb-5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-label-sm font-bold ${a.cls}`}>
                      <a.icon size={11} aria-hidden="true" /> {a.label}
                    </span>
                    <p className="mt-1 text-body-lg font-bold text-on-surface">{step.title}</p>
                    <p className="text-sm leading-relaxed text-on-surface-variant">{step.body}</p>
                    {step.code && <CodeChip {...step.code} />}
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>

        {/* Why two codes */}
        <Section id="two" title="Why two codes?">
          <div className="overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="bg-surface-container-low text-left text-xs text-on-surface-variant">
                  <th className="px-4 py-2.5 font-semibold"> </th>
                  <th className="px-4 py-2.5 font-semibold">OTP 1 · Order code</th>
                  <th className="px-4 py-2.5 font-semibold">OTP 2 · Bill code</th>
                </tr>
              </thead>
              <tbody className="text-on-surface">
                {[
                  ["Format", "SV-######", "BV-######"],
                  ["Direction", "Participant → Business (via order note)", "Business → Participant (via bill)"],
                  ["Proves", "This order belongs to this Quest participant", "The business fulfilled the verified order and the participant received it"],
                  ["Counts toward progress?", "No", "Yes — completes the task"],
                  ["Valid for", "24 hours", "24 hours, single use, only for you"],
                ].map(([k, a, b]) => (
                  <tr key={k} className="border-t border-outline-variant">
                    <td className="px-4 py-3 font-semibold text-on-surface">{k}</td>
                    <td className="px-4 py-3">{a}</td>
                    <td className="px-4 py-3">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-2xl bg-primary p-4 text-sm leading-relaxed text-on-primary">
            <span className="font-bold text-on-primary">The chain of trust:</span> Intent (OTP 1) → Order → Business verification →
            Fulfilment (OTP 2 on the bill) → Participant verification → Completed. Two independent signals — the business
            confirms the order, and the participant proves they received it.
          </div>
        </Section>

        {/* Example */}
        <Section id="example" title="Example: Veer Ji Chaap Explorer">
          <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
            <div className="flex items-center gap-2 border-b border-outline-variant bg-warning-container px-4 py-2 text-xs font-semibold text-on-warning-container">
              <Eye size={14} aria-hidden="true" /> Illustrative example. The reward below is a demo configuration, not an offer.
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 text-sm">
              {[
                ["Business", "Veer Ji Malai Chaap Wale · Geeta Colony"],
                ["Tagline", "Discover. Order. Verify. Repeat."],
                ["Category", "Food & Dining"],
                ["Duration", "27 Sep – 27 Oct 2026"],
                ["Task", "Order & Try Veer Ji Malai Chaap"],
                ["Proof", "Order Verification (Zomato / Swiggy)"],
                ["Progress", "3 verified tasks → Quest complete"],
                ["Reward (demo)", "₹100 cash for ranks 1–20 · ₹2,000 pool"],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-on-surface-variant">{k}</dt>
                  <dd className="font-semibold text-on-surface">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-outline-variant px-4 py-3 text-sm text-on-surface-variant">
              Aditya joins, adds Malai Chaap to his Zomato cart, taps Post Proof and gets <span className="font-mono font-bold">SV-981042</span>.
              He puts it in the order note. Veer Ji sees it, searches it, verifies, and writes <span className="font-mono font-bold">BV-642815</span> on
              the bill. Aditya enters it: Task completed ✓ — progress 1/3. Two more verified orders complete the Quest.
            </p>
          </div>
        </Section>

        {/* Edge cases */}
        <Section id="faq" title="What if…">
          <div className="flex flex-col gap-2">
            {EDGE_CASES.map(({ q, a }) => (
              <details key={q} className="group rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-bold text-on-surface flex items-center justify-between gap-3 min-h-[28px]">
                  {q}
                  <span className="text-on-surface-variant transition-transform group-open:rotate-90" aria-hidden="true">›</span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* Leaderboard & rewards */}
        <Section id="rewards" title="Leaderboard and rewards">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
              <p className="flex items-center gap-2 font-bold text-on-surface"><Trophy size={16} className="text-on-warning-container" aria-hidden="true" /> Leaderboard</p>
              <p className="mt-1">Ranks by verified tasks only. Ties go to whoever completed their latest verification first. Generating a code or a business approval never moves your rank.</p>
            </div>
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
              <p className="flex items-center gap-2 font-bold text-on-surface"><Gift size={16} className="text-secondary" aria-hidden="true" /> Rewards</p>
              <p className="mt-1">Verification answers “did it happen?”; the reward answers “what do I get?”. Completion rewards unlock when all required tasks are verified. Rank-based rewards follow the Quest&apos;s published conditions at the end.</p>
            </div>
          </div>
        </Section>

        {/* Rules */}
        <Section id="rules" title="Quest rules">
          <ol className="grid gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-surface sm:grid-cols-2">
            {RULES.map((r, i) => (
              <li key={r} className="flex gap-2"><span className="w-5 shrink-0 font-black text-secondary">{i + 1}</span>{r}</li>
            ))}
          </ol>
        </Section>

        {/* For businesses */}
        <Section id="business" title="For businesses">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
              <p className="flex items-center gap-2 font-bold text-on-surface"><Search size={16} aria-hidden="true" /> Verify Order</p>
              <p className="mt-1">Search the code from the order note, check the Quest and task, then Verify Order or Reject with a reason. Write the bill code STRIVUP gives you on the bill.</p>
            </div>
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
              <p className="flex items-center gap-2 font-bold text-on-surface"><ShieldCheck size={16} aria-hidden="true" /> What you see</p>
              <p className="mt-1">Only what you need to verify: the participant&apos;s display name, the Quest, the task, the code and its timing. No phone numbers, emails or addresses.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <p className="text-sm font-bold text-on-surface">Your Quest funnel</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
              {["Views", "Joins", "Proof codes generated", "Orders verified", "Bill codes entered", "Quest completions"].map((s, i, a) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className="rounded-lg bg-surface-container-low px-2 py-1">{s}</span>
                  {i < a.length - 1 && <ArrowRight size={12} className="text-on-surface-variant" aria-hidden="true" />}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">See exactly where people drop off — not just how many saw your campaign.</p>
          </div>
        </Section>

        {/* Proof types */}
        <Section id="proof" title="Post Proof adapts to the task">
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              { icon: Receipt,    t: "Order Verification", d: "Two-code flow above, for Zomato/Swiggy orders." },
              { icon: Smartphone, t: "Photo",              d: "Upload a photo; the business reviews it." },
              { icon: CheckCircle2, t: "No proof",         d: "Mark done — for simple, low-stakes steps." },
              { icon: XCircle,    t: "Coming later",       d: "QR, event and location codes, and POS integrations." },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
                <Icon size={18} className="shrink-0 text-secondary" aria-hidden="true" />
                <div><p className="text-sm font-bold text-on-surface">{t}</p><p className="text-xs text-on-surface-variant">{d}</p></div>
              </li>
            ))}
          </ul>
        </Section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/quests" className="flex h-12 flex-1 items-center justify-center rounded-xl bg-secondary text-sm font-bold text-white">
            Explore Quests
          </Link>
          <Link href="/business" className="flex h-12 flex-1 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest text-sm font-bold text-on-surface">
            Create a Quest for your business
          </Link>
        </div>
      </main>
    </div>
  );
}
