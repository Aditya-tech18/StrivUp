"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { StringKey } from "@/lib/i18n/businessStrings";

const STEPS = [
  {
    titleKey: "hw.s1" as StringKey,
    bodyKey: "hw.s1body" as StringKey,
    visual: (
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 text-xs text-on-surface-variant elev-1 surface-raised">
        <div className="font-black text-on-surface uppercase mb-2">New order · #4821</div>
        <div className="flex justify-between"><span>Malai Chaap (Full)</span><span>×1</span></div>
        <div className="mt-2 rounded-lg bg-surface-container-low px-2 py-1.5">Instructions: <span className="font-mono font-black text-secondary">SV-981042</span></div>
      </div>
    ),
  },
  {
    titleKey: "hw.s2" as StringKey,
    bodyKey: "hw.s2body" as StringKey,
  },
  {
    titleKey: "hw.s3" as StringKey,
    body: "If it's a real order for an eligible item, tap Verify Order. Otherwise Reject and give a short reason — the customer sees it.",
  },
  {
    titleKey: "hw.s4" as StringKey,
    bodyKey: "hw.s4body" as StringKey,
    visual: (
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 elev-1 surface-raised">
        <div className="text-xs font-black text-on-surface uppercase mb-2">Veer Ji Malai Chaap Wale</div>
        <div className="border-t border-outline-variant pt-2 space-y-1">
          <div className="flex justify-between text-xs text-on-surface-variant"><span>Malai Chaap (Full)</span><span>₹280</span></div>
          <div className="flex justify-between text-xs font-bold text-on-surface border-t border-dashed border-outline pt-1 mt-1"><span>Total</span><span>₹280</span></div>
        </div>
        <div className="mt-3 font-mono font-black text-2xl text-on-success-container text-center border-2 border-dashed border-success-outline rounded-xl py-2 bg-success-container">STRIVUP: BV-642815</div>
      </div>
    ),
  },
  {
    titleKey: "hw.s5" as StringKey,
    body: "When the order arrives, the customer enters the bill code in STRIVUP. Only then does their task count — your verification alone doesn't complete it.",
  },
];

export default function HowItWorksPage() {
  const { t } = useLocale();
  const router = useRouter();
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-30">
        <div className="flex-1">
          <h1 className="text-body-lg font-black text-on-surface">{t("hw.title")}</h1>
          <LanguageToggle className="shrink-0" />
        </div>
        <button aria-label="Close" onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center tap-target">
          <X size={18} className="text-on-surface-variant" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 pb-28 mx-auto measure-form flex flex-col gap-5">
        {STEPS.map((step, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 elev-1">
                <span className="text-sm font-black text-white">{i+1}</span>
              </div>
              {i < STEPS.length-1 && <div className="w-0.5 flex-1 bg-surface-container-highest mt-2" />}
            </div>
            <div className="flex-1 pb-5">
              <p className="text-body-lg font-bold text-on-surface mb-1">{t(step.titleKey)}</p>
              {"bodyKey" in step && (
                <p className="text-sm text-on-surface-variant mb-3 leading-relaxed">{t(step.bodyKey as StringKey)}</p>
              )}
              {step.visual}
            </div>
          </div>
        ))}
        <Link href="/how-quests-work" className="text-center text-sm font-semibold text-secondary underline">
          {t("hw.fullGuide")}
        </Link>
      </div>

      <div className="fixed above-bottom-nav z-40 bg-surface-container-lowest border-t border-outline-variant px-5 py-4">
        <button onClick={() => router.back()}
          className="w-full h-12 rounded-xl bg-secondary text-white font-bold text-body-lg">
          Got it
        </button>
      </div>
    </div>
  );
}
