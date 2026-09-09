"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail, MessageCircle } from "lucide-react";

const SUPPORT_EMAIL = "strivup.officialteam@gmail.com";
const FAQS = [
  { q: "How do I join a challenge?", a: "Go to Explore, find a challenge and tap 'Join'. You can start uploading your daily proof right after." },
  { q: "How do I upload proof?", a: "Open your active challenge from the Home screen, then tap 'Upload Proof' to submit a photo, video or text update." },
  { q: "How is my consistency calculated?", a: "Consistency is calculated as (approved proofs ÷ days elapsed) × 100. Keep uploading daily to maintain a high score." },
  { q: "Can I change my username?", a: "Yes — go to Settings → Edit Profile to update your username anytime." },
  { q: "How do I delete my account?", a: "Go to Settings → Delete Account. Note that this is permanent and cannot be undone." },
  { q: "How do I deactivate my account?", a: "Go to Settings → Deactivate Account. Your data is preserved and you can reactivate by logging back in." },
];

export default function HelpPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      <div className="sticky top-0 z-30 flex items-center gap-3 px-5 py-4 bg-white border-b border-outline-variant">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={20} />
        </button>
        <h1 className="type-headline-sm text-on-surface font-bold">Help & Support</h1>
      </div>

      <div className="max-w-lg mx-auto px-5 py-5 flex flex-col gap-5">

        {/* Contact us card */}
        <div className="bg-white rounded-2xl border border-outline-variant p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <MessageCircle size={18} className="text-secondary" />
            <h2 className="type-body-md font-bold text-on-surface">Contact Us</h2>
          </div>
          <p className="type-body-md text-on-surface-variant leading-relaxed">
            Have a question, feature request, or need help? We're here for you. Reach out to our team directly.
          </p>
          <a href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-3 p-3.5 rounded-xl border border-secondary/30 bg-secondary/5 hover:bg-secondary/10 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
              <Mail size={18} className="text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-on-surface-variant">Email us at</p>
              <p className="type-body-md font-bold text-secondary truncate">{SUPPORT_EMAIL}</p>
            </div>
            <ExternalLink size={14} className="text-secondary shrink-0" />
          </a>
          <p className="text-[11px] text-on-surface-variant text-center">We typically respond within 24–48 hours.</p>
        </div>

        {/* FAQ section */}
        <div>
          <p className="type-label-caps text-on-surface-variant mb-3 px-1">Frequently Asked Questions</p>
          <div className="bg-white rounded-2xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {FAQS.map((faq, i) => (
              <FAQItem key={i} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="bg-surface-container rounded-2xl p-4 text-center">
          <p className="type-body-md font-bold text-on-surface">STRIVUP</p>
          <p className="text-[12px] text-on-surface-variant mt-0.5">India's Platform for Growth</p>
          <p className="text-[11px] text-on-surface-variant mt-2">For queries, feature requests or bug reports:</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[12px] text-secondary font-medium hover:underline">{SUPPORT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-surface-container transition-colors">
        <p className="type-body-md font-medium text-on-surface">{question}</p>
        <span className={`text-on-surface-variant transition-transform shrink-0 ${open ? "rotate-45" : ""}`}>+</span>
      </button>
      {open && (
        <div className="px-4 pb-3.5">
          <p className="type-body-md text-on-surface-variant leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
