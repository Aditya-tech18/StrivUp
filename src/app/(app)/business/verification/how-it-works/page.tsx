"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";

const STEPS = [
  {
    title: "Write the code",
    body: "Write the verification code clearly on the participant's physical bill or receipt.",
    visual: (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-xs font-black text-gray-800 uppercase mb-2">THE FIT STORE · 123 MG Road, Mumbai</div>
        <div className="border-t border-gray-200 pt-2 space-y-1">
          <div className="flex justify-between text-xs text-gray-600"><span>Running Shoes</span><span>₹2,999</span></div>
          <div className="flex justify-between text-xs text-gray-600"><span>Water Bottle</span><span>₹499</span></div>
          <div className="flex justify-between text-xs font-bold text-gray-900 border-t border-dashed border-gray-300 pt-1 mt-1"><span>Total</span><span>₹3,498</span></div>
        </div>
        <div className="mt-3 font-mono font-black text-2xl text-blue-600 text-center border-2 border-dashed border-blue-200 rounded-xl py-2 bg-blue-50">STRIV-7392</div>
      </div>
    ),
  },
  {
    title: "Give the bill to the participant",
    body: "Hand over the bill/receipt to the participant after writing the code.",
  },
  {
    title: "Participant uploads the bill",
    body: "The participant will upload a clear photo of the bill to STRIVUP.",
  },
  {
    title: "STRIVUP verifies the submission",
    body: "We'll match the code on the bill and complete their challenge/quest verification.",
  },
];

export default function HowItWorksPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="flex-1">
          <h1 className="text-[17px] font-black text-gray-900">How to Complete Verification</h1>
        </div>
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
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
              <p className="text-sm text-gray-500 mb-3 leading-relaxed">{step.body}</p>
              {step.visual}
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 py-4">
        <button onClick={() => router.back()}
          className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold text-[15px]">
          Got it
        </button>
      </div>
    </div>
  );
}
