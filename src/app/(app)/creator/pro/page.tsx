/**
 * /creator/pro — Creator Pro plans for creators and personal brands.
 */

import Link from "next/link";
import { ArrowLeft, BarChart3, Link2, Sparkles, Users } from "lucide-react";
import { CreatorPlans } from "@/components/features/CreatorPlans";

const BENEFITS = [
  { icon: Sparkles,  title: "Stand out",        desc: "Premium card design and featured discovery in Explore." },
  { icon: Users,     title: "Grow a community", desc: "Turn followers into participants who show up every day." },
  { icon: BarChart3, title: "Know what works",  desc: "See joins, active members and completion for each challenge." },
  { icon: Link2,     title: "Bring them home",  desc: "Link your Instagram, YouTube, X or website on every challenge." },
];

export default function CreatorProPage() {
  return (
    <div className="min-h-screen bg-[#F8F9FC]">
      <header className="sticky top-0 pt-safe z-30 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <Link href="/creator/challenges" aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100">
          <ArrowLeft size={20} className="text-gray-600" />
        </Link>
        <h1 className="flex-1 text-[17px] font-black text-gray-900">Creator Pro</h1>
      </header>

      <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-6">
        <div className="text-center">
          <h2 className="text-[26px] font-black leading-tight tracking-tight text-gray-900">Scale Your Influence</h2>
          <p className="mt-2 text-sm text-gray-500">
            Turn your audience into an active community with structured challenges.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                <Icon size={18} className="text-blue-600" aria-hidden="true" />
              </div>
              <p className="text-sm font-bold text-gray-900">{title}</p>
              <p className="mt-0.5 text-xs leading-snug text-gray-600">{desc}</p>
            </div>
          ))}
        </div>

        <CreatorPlans />

        <Link href="/challenges/new"
          className="flex h-12 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-blue-700">
          Create a free challenge →
        </Link>
      </div>
    </div>
  );
}
