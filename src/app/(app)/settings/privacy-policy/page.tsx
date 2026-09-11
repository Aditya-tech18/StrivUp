"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";

const SUPPORT_EMAIL = "strivup.officialteam@gmail.com";

const SECTIONS = [
  {
    title: "1. Information We Collect",
    body: "We collect information you provide when you create an account, complete your profile, join challenges, upload content, or contact us. This includes your name, email address, phone number, age, gender, interests, profile photo, social links, and any content you submit as challenge proof. We also collect usage data about how you interact with the platform.",
  },
  {
    title: "2. How We Use Your Information",
    body: "We use your data to provide and improve STRIVUP services; personalise your feed and recommend relevant challenges and quests based on your interests; send you notifications about account activity; ensure platform security and integrity; and comply with legal obligations. We do not sell your personal data.",
  },
  {
    title: "3. Sharing of Information",
    body: "Your public profile (name, username, avatar, bio, social links) is visible to other STRIVUP users. If your account is set to Private, only your approved followers can view your profile and content. We may share data with service providers who help us operate the platform, subject to strict confidentiality agreements.",
  },
  {
    title: "4. Interests & Personalisation",
    body: "The interests you select are stored and used to personalise your challenge and quest recommendations. This data is used only within STRIVUP for personalisation purposes and is not shared with advertisers or third-party marketers.",
  },
  {
    title: "5. Data Storage & Security",
    body: "Your data is stored securely using Supabase infrastructure with Row Level Security (RLS) policies ensuring users can only access their own private data. We use industry-standard encryption for data in transit and at rest. Profile photos are stored in secure cloud buckets restricted to the account owner.",
  },
  {
    title: "6. Your Rights",
    body: "You may access, update, or delete your personal information at any time through Account Settings. You can deactivate your account to temporarily hide your profile while keeping your data intact. For permanent removal, use the Delete Account option. Requests are processed in accordance with applicable law.",
  },
  {
    title: "7. Cookies & Analytics",
    body: "STRIVUP uses session cookies to maintain your login state. We may use aggregated, anonymised analytics to understand platform usage and improve the product. No individual users are identified through our analytics processes.",
  },
  {
    title: "8. Children's Privacy",
    body: "STRIVUP is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware of such data, we will take immediate steps to delete it.",
  },
  {
    title: "9. Changes to This Policy",
    body: "We may update this Privacy Policy from time to time. Significant changes will be notified by updating the effective date and, where appropriate, through in-app notifications. Continued use of STRIVUP after changes constitutes acceptance of the updated policy.",
  },
  {
    title: "10. Contact",
    body: `For privacy-related questions or requests, please contact us at ${SUPPORT_EMAIL}. We aim to respond to all privacy enquiries within 48 hours.`,
  },
];

export default function PrivacyPolicyPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-28">
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-5 py-3.5">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
          >
            <ArrowLeft size={19} className="text-on-surface" />
          </button>
          <h1 className="text-[17px] font-bold text-on-surface tracking-[-0.01em]">Privacy Policy</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-5 flex flex-col gap-4">
        {/* Header card */}
        <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
          <h2 className="text-[18px] font-bold text-on-surface tracking-[-0.01em]">STRIVUP Privacy Policy</h2>
          <p className="text-[12px] text-on-surface-variant mt-1">Effective Date: September 2026</p>
          <p className="text-[13px] text-on-surface-variant mt-3 leading-relaxed">
            At STRIVUP, your privacy is a priority. This policy explains how we collect, use,
            store and protect your personal information when you use our platform.
          </p>
        </div>

        {/* Sections */}
        {SECTIONS.map(section => (
          <div
            key={section.title}
            className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5"
          >
            <h3 className="text-[14px] font-bold text-on-surface mb-2">{section.title}</h3>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">{section.body}</p>
          </div>
        ))}

        {/* Contact CTA */}
        <div className="bg-secondary/5 border border-secondary/15 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
            <Mail size={16} className="text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-on-surface">Privacy questions?</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[12px] text-secondary hover:underline truncate block">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>

        <p className="text-center text-[11px] text-on-surface-variant pb-2">
          © 2026 STRIVUP. All rights reserved.
        </p>
      </div>
    </div>
  );
}
