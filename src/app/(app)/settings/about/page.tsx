"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

export default function AboutPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      <div className="sticky top-0 z-30 flex items-center gap-3 px-5 py-4 bg-white border-b border-outline-variant">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={20} />
        </button>
        <h1 className="type-headline-sm text-on-surface font-bold">About STRIVUP</h1>
      </div>
      <div className="max-w-lg mx-auto px-5 py-5 flex flex-col gap-4">

        {/* Logo card */}
        <div className="bg-white rounded-2xl border border-outline-variant p-6 flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center shadow-sm">
            <span className="text-white text-2xl font-black">S</span>
          </div>
          <div className="text-center">
            <h2 className="text-[20px] font-black text-on-surface">STRIVUP</h2>
            <p className="text-[13px] text-on-surface-variant mt-0.5">India's Platform for Growth</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center mt-1">
            {["Challenges","Quests","Streaks","Community"].map(tag => (
              <span key={tag} className="px-3 py-1 rounded-full bg-secondary/10 text-secondary text-[11px] font-semibold">{tag}</span>
            ))}
          </div>
        </div>

        {/* App info */}
        <div className="bg-white rounded-2xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
          {[
            { label: "Version",      value: "1.0.0" },
            { label: "Platform",     value: "Web · iOS · Android (soon)" },
            { label: "Built with",   value: "Next.js · Supabase · TypeScript" },
            { label: "Country",      value: "India 🇮🇳" },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between px-4 py-3.5">
              <p className="text-[13px] text-on-surface-variant">{row.label}</p>
              <p className="text-[13px] font-medium text-on-surface">{row.value}</p>
            </div>
          ))}
        </div>

        {/* Mission */}
        <div className="bg-secondary/5 border border-secondary/20 rounded-2xl p-4">
          <p className="text-[14px] font-bold text-on-surface mb-1.5">Our Mission</p>
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            STRIVUP helps people build real habits, take on meaningful challenges, and grow together as a community. We believe consistent effort — tracked publicly and celebrated together — is the foundation of personal growth.
          </p>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-2xl border border-outline-variant p-4 text-center">
          <p className="text-[13px] text-on-surface-variant">For support or feedback, email us at</p>
          <a href="mailto:strivup.officialteam@gmail.com"
            className="text-secondary font-semibold text-[14px] hover:underline block mt-1">
            strivup.officialteam@gmail.com
          </a>
        </div>

        <p className="text-center text-[11px] text-on-surface-variant">© 2026 STRIVUP. All rights reserved.</p>
      </div>
    </div>
  );
}
