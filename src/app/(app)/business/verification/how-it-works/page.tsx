"use client";

import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";

const STEPS = [
  {
    num: 1,
    title: "Write the code",
    body: "Write the verification code clearly on the participant's physical bill or receipt.",
    visual: (
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 text-sm">
        <div className="font-bold text-on-surface text-xs uppercase mb-2">THE FIT STORE · 123 MG Road, Mumbai</div>
        <div className="border-t border-outline-variant pt-2 space-y-1 text-on-surface-variant text-xs">
          <div className="flex justify-between"><span>Running Shoes</span><span>₹2,999</span></div>
          <div className="flex justify-between"><span>Water Bottle</span><span>₹499</span></div>
          <div className="flex justify-between font-bold text-on-surface border-t border-dashed border-outline-variant pt-1 mt-1"><span>Total</span><span>₹3,498</span></div>
        </div>
        <div className="mt-3 font-mono font-black text-2xl text-secondary text-center border-2 border-dashed border-secondary/30 rounded-lg py-2">STRIV-7392</div>
      </div>
    ),
  },
  {
    num: 2,
    title: "Give the bill to the participant",
    body: "Hand over the bill/receipt to the participant after writing the code.",
  },
  {
    num: 3,
    title: "Participant uploads the bill",
    body: "The participant will upload a clear photo of the bill to STRIVUP.",
  },
  {
    num: 4,
    title: "STRIVUP verifies the submission",
    body: "We'll match the code on the bill and complete their challenge/quest verification.",
  },
];

export default function HowItWorksPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant bg-surface-container-lowest">
        <h1 className="type-headline-sm text-on-surface flex-1">How to Complete Verification</h1>
        <button onClick={() => router.back()} className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Close">
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 pb-28 max-w-lg mx-auto flex flex-col gap-6">
        {STEPS.map(step => (
          <div key={step.num} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <span className="type-body-md font-black text-on-secondary">{step.num}</span>
              </div>
              {step.num < STEPS.length && <div className="w-0.5 flex-1 bg-outline-variant mt-2" />}
            </div>
            <div className="flex-1 pb-6">
              <p className="type-body-md font-bold text-on-surface mb-1">{step.title}</p>
              <p className="type-body-md text-on-surface-variant mb-3">{step.body}</p>
              {step.visual}
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-surface border-t border-outline-variant">
        <Button variant="primary" size="lg" fullWidth onClick={() => router.back()}>
          Got it
        </Button>
      </div>
    </div>
  );
}
