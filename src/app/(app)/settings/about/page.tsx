"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";

const SUPPORT_EMAIL = "strivup.officialteam@gmail.com";

export default function AboutPage() {
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
          <h1 className="text-[17px] font-bold text-on-surface tracking-[-0.01em]">About STRIVUP</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-5 flex flex-col gap-4">
        {/* Brand card */}
        <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-6 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center shadow-[0_4px_16px_rgba(29,78,216,0.3)]">
            <span className="text-white text-[26px] font-black tracking-tight">S</span>
          </div>
          <div className="text-center">
            <h2 className="text-[22px] font-black text-on-surface tracking-[-0.02em]">STRIVUP</h2>
            <p className="text-[13px] text-on-surface-variant mt-0.5">India's Platform for Growth</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {["Challenges", "Quests", "Streaks", "Community"].map(tag => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full bg-secondary/8 text-secondary text-[12px] font-semibold border border-secondary/15"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* App info */}
        <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          {[
            { label: "Version",     value: "1.0.0" },
            { label: "Platform",    value: "Web · Mobile (coming soon)" },
            { label: "Built with",  value: "Next.js · Supabase · TypeScript" },
            { label: "Country",     value: "India" },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              className={[
                "flex items-center justify-between px-4 py-3.5",
                i < arr.length - 1 ? "border-b border-outline-variant" : "",
              ].join(" ")}
            >
              <p className="text-[13px] text-on-surface-variant">{row.label}</p>
              <p className="text-[13px] font-semibold text-on-surface">{row.value}</p>
            </div>
          ))}
        </div>

        {/* Mission */}
        <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
          <h3 className="text-[14px] font-bold text-on-surface mb-2">Our Mission</h3>
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            STRIVUP helps people build real habits, take on meaningful challenges, and grow together
            as a community. We believe that consistent effort — tracked publicly and celebrated
            together — is the foundation of personal growth.
          </p>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
            <Mail size={16} className="text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-on-surface">Get in touch</p>
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
