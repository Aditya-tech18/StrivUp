"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, ChevronRight, ClipboardList, Crown, Plus, Search, Trophy, Users, Zap,
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
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
          {c.thumbnailUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center"><Trophy size={24} className="text-gray-300" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="line-clamp-2 flex-1 text-[15px] font-bold leading-snug text-gray-900">{c.title}</p>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${c.visibility === "private" ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-500"}`}>
                {c.visibility === "private" ? "PRIVATE" : "PUBLIC"}
              </span>
              {c.featured && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-amber-700">FEATURED</span>
              )}
            </div>
          </div>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
            {[c.category, c.durationDays ? `${c.durationDays} days` : "Ongoing"].filter(Boolean).join(" · ")}
          </p>
          <p className="text-xs italic text-gray-600">
            Created {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center">
        <div>
          <p className="flex items-center justify-center gap-1 text-sm font-black text-gray-900"><Users size={13} className="text-gray-400" />{compact(c.members)}</p>
          <p className="text-[10px] text-gray-600">Members</p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 text-sm font-black text-blue-600"><Zap size={13} />{activePct}%</p>
          <p className="text-[10px] text-gray-600">Active</p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 text-sm font-black text-green-600"><CheckCircle2 size={13} />{pct(c.completed, c.members)}%</p>
          <p className="text-[10px] text-gray-600">Completed</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Link href={`/challenges/${c.id}`}
          className="flex h-9 flex-1 items-center justify-center rounded-xl bg-gray-900 text-xs font-bold tracking-wide text-white">
          OPEN CHALLENGE
        </Link>
        <Link href={`/creator/challenges/${c.id}/submissions`}
          className="relative flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700">
          <ClipboardList size={14} /> Proofs
          {c.pendingProofs > 0 && (
            <span className="ml-0.5 min-w-[18px] rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-[18px] text-white">
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
    <div className="min-h-screen bg-[#F8F9FC]">
      <header className="sticky top-0 pt-safe z-30 border-b border-gray-100 bg-white px-4 pt-3">
        <div className="flex items-center justify-between">
          <h1 className="text-[18px] font-black text-gray-900">My Challenges</h1>
          <Link href="/creator/pro"
            className="flex h-8 items-center gap-1.5 rounded-full bg-gray-900 px-3 text-xs font-bold text-white">
            <Crown size={13} className="text-amber-400" /> Creator Pro
          </Link>
        </div>
        <p className="mt-1 text-xs leading-snug text-gray-600">
          Track growth, engagement and success across the challenges you created.
        </p>
        <div className="mt-2 flex gap-5">
          {([["created", "Created Challenges"], ["analytics", "Analytics Overview"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`-mb-px border-b-2 pb-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-4 pb-24">
        {challenges.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
              <Trophy size={26} className="text-blue-600" />
            </div>
            <p className="text-[15px] font-bold text-gray-900">You haven&apos;t created a challenge yet</p>
            <p className="text-sm text-gray-500">Turn a goal into a structured challenge and invite your community.</p>
            <Link href="/challenges/new"
              className="mt-1 flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white">
              <Plus size={16} /> Create Challenge
            </Link>
          </div>
        ) : tab === "created" ? (
          <>
            <label className="flex h-11 items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-gray-100 focus-within:ring-2 focus-within:ring-blue-600">
              <Search size={16} className="text-gray-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search challenges…"
                className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none" />
            </label>
            {filtered.map(c => <ChallengeCard key={c.id} c={c} />)}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-600">No challenges match “{query}”.</p>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Challenges",     value: compact(challenges.length), cls: "text-gray-900" },
                { label: "Total members",  value: compact(totals.members),    cls: "text-gray-900" },
                { label: "Active now",     value: `${pct(totals.active, totals.members)}%`,    cls: "text-blue-600" },
                { label: "Completion",     value: `${pct(totals.completed, totals.members)}%`, cls: "text-green-600" },
              ].map(s => (
                <div key={s.label} className="rounded-2xl border border-gray-100 bg-white p-4">
                  <p className={`text-2xl font-black ${s.cls}`}>{s.value}</p>
                  <p className="text-xs text-gray-600">{s.label}</p>
                </div>
              ))}
            </div>

            {totals.pending > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <ClipboardList size={20} className="shrink-0 text-amber-600" />
                <p className="flex-1 text-sm text-amber-800">
                  <span className="font-bold">{totals.pending}</span> proof{totals.pending !== 1 ? "s" : ""} waiting for your review
                </p>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <p className="px-4 pt-4 text-[15px] font-black text-gray-900">Performance by challenge</p>
              <div className="mt-2 divide-y divide-gray-50">
                {[...challenges].sort((a, b) => b.members - a.members).map(c => (
                  <Link key={c.id} href={`/challenges/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{c.title}</p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct(c.active, c.members)}%` }} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black text-gray-900">{compact(c.members)}</p>
                      <p className="text-[10px] text-gray-600">{pct(c.active, c.members)}% active</p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-gray-300" />
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {challenges.length > 0 && (
        <Link href="/challenges/new" aria-label="Create challenge"
          className="fixed right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-300 [bottom:calc(var(--bottom-nav-h)+1rem)] md:[bottom:1.5rem]">
          <Plus size={26} />
        </Link>
      )}
    </div>
  );
}
