"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, ChevronRight, ClipboardList, Crown, Pencil, Plus, Search, Trophy, Users, Zap,
} from "lucide-react";

export interface CreatedChallenge {
  id: string;
  title: string;
  category: string | null;
  durationDays: number | null;
  visibility: "public" | "private";
  thumbnailUrl: string | null;
  createdAt: string;
  featured: boolean;
  members: number;
  active: number;
  completed: number;
  pendingProofs: number;
}

type Tab = "created" | "analytics";

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function compact(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function ChallengeCard({ c }: { c: CreatedChallenge }) {
  const activePct = pct(c.active, c.members);
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-container">
          {c.thumbnailUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center"><Trophy size={24} className="text-on-surface-variant" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="line-clamp-2 flex-1 text-body-lg font-bold leading-snug text-on-surface">{c.title}</p>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`rounded px-1.5 py-0.5 text-label-sm font-bold tracking-wider ${c.visibility === "private" ? "bg-primary text-white" : "border border-outline-variant text-on-surface-variant"}`}>
                {c.visibility === "private" ? "PRIVATE" : "PUBLIC"}
              </span>
              {c.featured && (
                <span className="rounded bg-warning-container px-1.5 py-0.5 text-label-sm font-bold tracking-wider text-on-warning-container">FEATURED</span>
              )}
            </div>
          </div>
          <p className="mt-0.5 text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            {[c.category, c.durationDays ? `${c.durationDays} days` : "Ongoing"].filter(Boolean).join(" · ")}
          </p>
          <p className="text-xs italic text-on-surface-variant">
            Created {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-outline-variant pt-3 text-center">
        <div>
          <p className="flex items-center justify-center gap-1 text-sm font-black text-on-surface"><Users size={13} className="text-on-surface-variant" />{compact(c.members)}</p>
          <p className="text-label-sm text-on-surface-variant">Members</p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 text-sm font-black text-secondary"><Zap size={13} />{activePct}%</p>
          <p className="text-label-sm text-on-surface-variant">Active</p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 text-sm font-black text-on-success-container"><CheckCircle2 size={13} />{pct(c.completed, c.members)}%</p>
          <p className="text-label-sm text-on-surface-variant">Completed</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Link href={`/challenges/${c.id}`}
          className="flex h-9 flex-1 items-center justify-center rounded-xl bg-primary text-xs font-bold tracking-wide text-white tap-target">
          OPEN CHALLENGE
        </Link>
        {/* Every row on this page is one the signed-in user created, so Edit
            belongs on all of them. The route checks creator_id again, and RLS
            behind it, so the button is a shortcut rather than the gate. */}
        <Link href={`/challenges/${c.id}/edit`}
          aria-label={`Edit ${c.title}`}
          className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-outline-variant px-3 text-xs font-semibold text-on-surface-variant hover:bg-surface-container">
          <Pencil size={14} aria-hidden="true" /> Edit
        </Link>
        <Link href={`/creator/challenges/${c.id}/submissions`}
          className="relative flex h-9 items-center justify-center gap-1.5 rounded-xl border border-outline-variant px-3 text-xs font-semibold text-on-surface-variant">
          <ClipboardList size={14} /> Proofs
          {c.pendingProofs > 0 && (
            <span className="ml-0.5 min-w-[18px] rounded-full bg-warning px-1 text-label-sm font-bold leading-[18px] text-white">
              {c.pendingProofs > 99 ? "99+" : c.pendingProofs}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}

export function MyChallengesClient({ challenges }: { challenges: CreatedChallenge[] }) {
  const [tab, setTab] = useState<Tab>("created");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? challenges.filter(c => c.title.toLowerCase().includes(q)) : challenges;
  }, [challenges, query]);

  const totals = useMemo(() => challenges.reduce(
    (t, c) => ({
      members: t.members + c.members,
      active: t.active + c.active,
      completed: t.completed + c.completed,
      pending: t.pending + c.pendingProofs,
    }),
    { members: 0, active: 0, completed: 0, pending: 0 },
  ), [challenges]);

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 pt-safe z-30 border-b border-outline-variant bg-surface-container-lowest px-4 pt-3">
        <div className="flex items-center justify-between">
          <h1 className="text-headline-md font-black text-on-surface">My Challenges</h1>
          <Link href="/creator/pro"
            className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-bold text-white tap-target">
            <Crown size={13} className="text-amber-400" /> Creator Pro
          </Link>
        </div>
        <p className="mt-1 text-xs leading-snug text-on-surface-variant">
          Track growth, engagement and success across the challenges you created.
        </p>
        <div className="mt-2 flex gap-5">
          {([["created", "Created Challenges"], ["analytics", "Analytics Overview"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`-mb-px border-b-2 pb-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${tab === key ? "border-secondary text-secondary" : "border-transparent text-on-surface-variant"}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-4 pb-24">
        {challenges.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-10 text-center elev-1 surface-raised">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary-fixed">
              <Trophy size={26} className="text-secondary" />
            </div>
            <p className="text-body-lg font-bold text-on-surface">You haven&apos;t created a challenge yet</p>
            <p className="text-sm text-on-surface-variant">Turn a goal into a structured challenge and invite your community.</p>
            <Link href="/challenges/new"
              className="mt-1 flex h-11 items-center gap-2 rounded-xl bg-secondary px-5 text-sm font-bold text-white">
              <Plus size={16} /> Create Challenge
            </Link>
          </div>
        ) : tab === "created" ? (
          <>
            <label className="flex h-11 items-center gap-2 rounded-xl bg-surface-container-lowest px-3 ring-1 ring-outline-variant focus-within:ring-2 focus-within:ring-secondary">
              <Search size={16} className="text-on-surface-variant" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search challenges…"
                className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none" />
            </label>
            {filtered.map(c => <ChallengeCard key={c.id} c={c} />)}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-on-surface-variant">No challenges match “{query}”.</p>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Challenges",     value: compact(challenges.length), cls: "text-on-surface" },
                { label: "Total members",  value: compact(totals.members),    cls: "text-on-surface" },
                { label: "Active now",     value: `${pct(totals.active, totals.members)}%`,    cls: "text-secondary" },
                { label: "Completion",     value: `${pct(totals.completed, totals.members)}%`, cls: "text-on-success-container" },
              ].map(s => (
                <div key={s.label} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 elev-1 surface-raised">
                  <p className={`text-2xl font-black ${s.cls}`}>{s.value}</p>
                  <p className="text-xs text-on-surface-variant">{s.label}</p>
                </div>
              ))}
            </div>

            {totals.pending > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border border-warning-outline bg-warning-container p-4">
                <ClipboardList size={20} className="shrink-0 text-on-warning-container" />
                <p className="flex-1 text-sm text-on-warning-container">
                  <span className="font-bold">{totals.pending}</span> proof{totals.pending !== 1 ? "s" : ""} waiting for your review
                </p>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest elev-1 surface-raised">
              <p className="px-4 pt-4 text-body-lg font-black text-on-surface">Performance by challenge</p>
              <div className="mt-2 divide-y divide-outline-variant">
                {[...challenges].sort((a, b) => b.members - a.members).map(c => (
                  <Link key={c.id} href={`/challenges/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-on-surface">{c.title}</p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-container">
                        <div className="h-full rounded-full bg-secondary" style={{ width: `${pct(c.active, c.members)}%` }} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black text-on-surface">{compact(c.members)}</p>
                      <p className="text-label-sm text-on-surface-variant">{pct(c.active, c.members)}% active</p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-on-surface-variant" />
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {challenges.length > 0 && (
        <Link href="/challenges/new" aria-label="Create challenge"
          className="fixed right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-white elev-brand [bottom:calc(var(--bottom-nav-h)+1rem)] md:[bottom:1.5rem]">
          <Plus size={26} />
        </Link>
      )}
    </div>
  );
}
