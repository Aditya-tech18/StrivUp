"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";
import {
  PRIVACY_EFFECTIVE,
  PRIVACY_SECTIONS as SECTIONS,
  SUPPORT_EMAIL,
} from "@/lib/legal/privacy";


export default function PrivacyPolicyPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-surface pb-28">
      <div className="sticky top-0 pt-safe z-40 bg-surface/95 backdrop-blur-md border-b border-outline-variant">
        <div className="mx-auto measure-form flex items-center gap-3 px-5 py-3.5">
          <button aria-label="Back"
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors tap-target"
          >
            <ArrowLeft size={19} className="text-on-surface" />
          </button>
          <h1 className="text-body-lg font-bold text-on-surface tracking-[-0.01em]">Privacy Policy</h1>
        </div>
      </div>

      <div className="mx-auto measure-form px-5 pt-5 flex flex-col gap-4">
        {/* Header card */}
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 elev-1 surface-raised">
          <h2 className="text-headline-md font-bold text-on-surface tracking-[-0.01em]">STRIVUP Privacy Policy</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">Effective Date: {PRIVACY_EFFECTIVE}</p>
          <p className="text-body-md text-on-surface-variant mt-3 leading-relaxed">
            At STRIVUP, your privacy is a priority. This policy explains how we collect, use,
            store and protect your personal information when you use our platform.
          </p>
        </div>

        {/* Sections */}
        {SECTIONS.map(section => (
          <div
            key={section.title}
            className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 elev-1 surface-raised"
          >
            <h3 className="text-body-md font-bold text-on-surface mb-2">{section.title}</h3>
            <p className="text-body-md text-on-surface-variant leading-relaxed">{section.body}</p>
          </div>
        ))}

        {/* Contact CTA */}
        <div className="bg-secondary/5 border border-secondary/15 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
            <Mail size={16} className="text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-body-md font-semibold text-on-surface">Privacy questions?</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-body-sm text-secondary hover:underline truncate block">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>

        <p className="text-center text-label-sm text-on-surface-variant pb-2">
          © 2026 STRIVUP. All rights reserved.
        </p>
      </div>
    </div>
  );
}
