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
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 pt-safe z-30 flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
        <Link href="/creator/challenges" aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container tap-target">
          <ArrowLeft size={20} className="text-on-surface-variant" />
        </Link>
        <h1 className="flex-1 text-body-lg font-black text-on-surface">Creator Pro</h1>
      </header>

      <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-6">
        <div className="text-center">
          <h2 className="text-headline-lg-mobile font-black leading-tight tracking-tight text-on-surface">Scale Your Influence</h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            Turn your audience into an active community with structured challenges.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-secondary-fixed">
                <Icon size={18} className="text-secondary" aria-hidden="true" />
              </div>
              <p className="text-sm font-bold text-on-surface">{title}</p>
              <p className="mt-0.5 text-xs leading-snug text-on-surface-variant">{desc}</p>
            </div>
          ))}
        </div>

        <CreatorPlans />

        <Link href="/challenges/new"
          className="flex h-12 items-center justify-center rounded-xl bg-secondary text-sm font-bold text-white elev-brand hover:opacity-90">
          Create a free challenge →
        </Link>
      </div>
    </div>
  );
}
