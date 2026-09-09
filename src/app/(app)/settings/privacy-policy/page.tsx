"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const SECTIONS = [
  {
    title: "1. Information We Collect",
    content: "We collect information you provide directly to us when you create an account, complete your profile, join challenges, upload content, or communicate with us. This includes your name, email address, phone number, age, interests, profile photo, and any content you submit. We also collect usage information about how you interact with our platform.",
  },
  {
    title: "2. How We Use Your Information",
    content: "We use the information we collect to provide, maintain, and improve STRIVUP services; personalize your experience and recommend relevant challenges and quests based on your interests; send you notifications about activity on your account; ensure the security and integrity of our platform; and comply with legal obligations.",
  },
  {
    title: "3. Sharing of Information",
    content: "We do not sell your personal information to third parties. Your public profile information (name, username, profile photo, bio, social links) is visible to other STRIVUP users. If your account is set to Private, only your approved followers can see your profile and activity. We may share information with service providers who assist in operating our platform, subject to confidentiality agreements.",
  },
  {
    title: "4. Data Storage & Security",
    content: "Your data is stored securely using Supabase infrastructure with Row Level Security (RLS) policies that ensure users can only access their own private data. We use industry-standard encryption for data in transit and at rest. Profile photos are stored in secure cloud storage buckets accessible only by the account owner.",
  },
  {
    title: "5. Your Rights",
    content: "You have the right to access, update, or delete your personal information at any time through your Account Settings. You may also deactivate your account to temporarily hide your profile while preserving your data. For permanent deletion, use the Delete Account option in Settings. We will process your request in accordance with applicable law.",
  },
  {
    title: "6. Interests & Recommendations",
    content: "The interests you select in your profile are used to personalize your experience on STRIVUP — including recommending challenges and quests relevant to your goals. This data is stored securely and is used only within the STRIVUP platform for personalization purposes.",
  },
  {
    title: "7. Cookies & Analytics",
    content: "STRIVUP uses cookies and similar technologies to maintain your session and improve platform functionality. We may use analytics tools to understand how users interact with our platform in aggregate, without identifying individual users.",
  },
  {
    title: "8. Children's Privacy",
    content: "STRIVUP is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected information from a child under 13, we will take steps to delete that information.",
  },
  {
    title: "9. Changes to This Policy",
    content: "We may update this Privacy Policy from time to time. We will notify you of any significant changes by posting the new policy on this page and updating the effective date. Your continued use of STRIVUP after changes constitutes your acceptance of the updated policy.",
  },
  {
    title: "10. Contact",
    content: "If you have any questions about this Privacy Policy or how we handle your data, please contact us at strivup.officialteam@gmail.com. We aim to respond to all privacy-related inquiries within 48 hours.",
  },
];

export default function PrivacyPolicyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      <div className="sticky top-0 z-30 flex items-center gap-3 px-5 py-4 bg-white border-b border-outline-variant">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={20} />
        </button>
        <h1 className="type-headline-sm text-on-surface font-bold">Privacy Policy</h1>
      </div>

      <div className="max-w-lg mx-auto px-5 py-5 flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-outline-variant p-5">
          <h2 className="text-[18px] font-bold text-on-surface">STRIVUP Privacy Policy</h2>
          <p className="text-[12px] text-on-surface-variant mt-1">Effective Date: September 2026</p>
          <p className="type-body-md text-on-surface-variant mt-3 leading-relaxed">
            At STRIVUP, we take your privacy seriously. This Privacy Policy explains how we collect, use, and protect your personal information when you use our platform.
          </p>
        </div>

        {SECTIONS.map(section => (
          <div key={section.title} className="bg-white rounded-2xl border border-outline-variant p-5">
            <h3 className="type-body-md font-bold text-on-surface mb-2">{section.title}</h3>
            <p className="type-body-md text-on-surface-variant leading-relaxed">{section.content}</p>
          </div>
        ))}

        <div className="bg-secondary/5 border border-secondary/20 rounded-2xl p-4 text-center">
          <p className="type-body-md font-semibold text-on-surface">Questions about your privacy?</p>
          <a href="mailto:strivup.officialteam@gmail.com" className="text-secondary font-medium type-body-md hover:underline mt-1 block">
            strivup.officialteam@gmail.com
          </a>
        </div>
      </div>
    </div>
  );
}
