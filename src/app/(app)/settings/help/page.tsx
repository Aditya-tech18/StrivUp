"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, Mail } from "lucide-react";

const SUPPORT_EMAIL = "strivup.officialteam@gmail.com";

const FAQS = [
  {
    q: "How do I join a challenge?",
    a: "Go to Explore, find a challenge that interests you and tap Join. You can start uploading your daily proof right after joining.",
  },
  {
    q: "How do I upload proof for my challenge?",
    a: "Open your active challenge from the Home screen, then tap Upload Proof to submit a photo, video or text update for that day.",
  },
  {
    q: "How is consistency calculated?",
    a: "Consistency is calculated as (approved proofs ÷ days elapsed) × 100. Keep submitting daily to maintain a high percentage.",
  },
  {
    q: "How do I change my username?",
    a: "Go to Settings → Edit Profile to update your username anytime.",
  },
  {
    q: "What is a Quest?",
    a: "Quests are location-based one-time challenges, usually set by businesses or creators. Complete the quest by visiting the location and submitting proof.",
  },
  {
    q: "How do I make my profile private?",
    a: "Go to Settings → Account Privacy and toggle on Private Account. Only approved followers will be able to see your content.",
  },
  {
    q: "How do I delete my account?",
    a: "Go to Settings → Delete Account. You will be asked to type DELETE to confirm. This action is permanent and cannot be undone.",
  },
  {
    q: "How do I deactivate my account?",
    a: "Go to Settings → Deactivate Account. Your data is preserved and you can reactivate by signing back in at any time.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-outline-variant last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left hover:bg-surface-container-low transition-colors"
      >
        <p className="text-[14px] font-medium text-on-surface leading-snug">{q}</p>
        {open
          ? <ChevronUp size={16} className="text-on-surface-variant shrink-0" />
          : <ChevronDown size={16} className="text-on-surface-variant shrink-0" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-[13px] text-on-surface-variant leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-28">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-5 py-3.5">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
          >
            <ArrowLeft size={19} className="text-on-surface" />
          </button>
          <h1 className="text-[17px] font-bold text-on-surface tracking-[-0.01em]">Help & Support</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-5 flex flex-col gap-5">

        {/* Contact card */}
        <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
          <p className="text-[13px] font-semibold text-on-surface-variant uppercase tracking-[0.06em] mb-3">Contact Us</p>
          <p className="text-[13px] text-on-surface-variant leading-relaxed mb-4">
            Have a question, found a bug, or want to request a feature? Our team is ready to help.
            We typically respond within 24–48 hours.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-3.5 p-3.5 rounded-xl border border-secondary/25 bg-secondary/5 hover:bg-secondary/10 transition-colors group"
          >
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
              <Mail size={18} className="text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-on-surface-variant mb-0.5">Email support</p>
              <p className="text-[14px] font-bold text-secondary truncate">{SUPPORT_EMAIL}</p>
            </div>
            <ExternalLink size={15} className="text-secondary shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
          </a>
        </div>

        {/* FAQ */}
        <div>
          <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.08em] mb-2 px-1">
            Frequently Asked Questions
          </p>
          <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
            {FAQS.map(faq => <FAQItem key={faq.q} q={faq.q} a={faq.a} />)}
          </div>
        </div>

        {/* Footer note */}
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant p-4 text-center">
          <p className="text-[13px] font-semibold text-on-surface">Still need help?</p>
          <p className="text-[12px] text-on-surface-variant mt-1">
            Write to us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-secondary font-medium hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
