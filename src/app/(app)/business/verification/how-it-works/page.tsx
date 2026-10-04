"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";

const STEPS = [
  {
    title: "Spot the STRIVUP code on the order",
    body: "Quest orders from Zomato or Swiggy carry a STRIVUP order code in the order description or cooking instructions.",
    visual: (
      <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs text-gray-700">
        <div className="font-black text-gray-900 uppercase mb-2">New order · #4821</div>
        <div className="flex justify-between"><span>Malai Chaap (Full)</span><span>×1</span></div>
        <div className="mt-2 rounded-lg bg-gray-50 px-2 py-1.5">Instructions: <span className="font-mono font-black text-blue-700">SV-981042</span></div>
      </div>
    ),
  },
  {
    title: "Search it in Verify Order",
    body: "Enter the code on the Verify screen. STRIVUP shows the Quest, the task and the customer's display name.",
  },
  {
    title: "Verify or reject",
    body: "If it's a real order for an eligible item, tap Verify Order. Otherwise Reject and give a short reason — the customer sees it.",
  },
  {
    title: "Write the bill code on the bill",
    body: "After you verify, STRIVUP gives you a new bill code. Write or print it on the bill that goes with the order. It's valid for 24 hours and works only for that customer.",
    visual: (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-xs font-black text-gray-800 uppercase mb-2">Veer Ji Malai Chaap Wale</div>
        <div className="border-t border-gray-200 pt-2 space-y-1">
          <div className="flex justify-between text-xs text-gray-700"><span>Malai Chaap (Full)</span><span>₹280</span></div>
          <div className="flex justify-between text-xs font-bold text-gray-900 border-t border-dashed border-gray-300 pt-1 mt-1"><span>Total</span><span>₹280</span></div>
        </div>
        <div className="mt-3 font-mono font-black text-2xl text-green-700 text-center border-2 border-dashed border-green-200 rounded-xl py-2 bg-green-50">STRIVUP: BV-642815</div>
      </div>
    ),
  },
  {
    title: "The customer finishes the task",
    body: "When the order arrives, the customer enters the bill code in STRIVUP. Only then does their task count — your verification alone doesn't complete it.",
  },
];

export default function HowItWorksPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="flex-1">
          <h1 className="text-[17px] font-black text-gray-900">How Order Verification Works</h1>
        </div>
        <button aria-label="Close" onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
          <X size={18} className="text-gray-600" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 pb-28 max-w-lg mx-auto flex flex-col gap-5">
        {STEPS.map((step, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-sm">
                <span className="text-sm font-black text-white">{i+1}</span>
              </div>
              {i < STEPS.length-1 && <div className="w-0.5 flex-1 bg-gray-200 mt-2" />}
            </div>
            <div className="flex-1 pb-5">
              <p className="text-[15px] font-bold text-gray-900 mb-1">{step.title}</p>
              <p className="text-sm text-gray-700 mb-3 leading-relaxed">{step.body}</p>
              {step.visual}
            </div>
          </div>
        ))}
        <Link href="/how-quests-work" className="text-center text-sm font-semibold text-blue-700 underline">
          Read the full Quest guide
        </Link>
      </div>

      <div className="fixed above-bottom-nav z-40 bg-white border-t border-gray-100 px-5 py-4">
        <button onClick={() => router.back()}
          className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold text-[15px]">
          Got it
        </button>
      </div>
    </div>
  );
}
