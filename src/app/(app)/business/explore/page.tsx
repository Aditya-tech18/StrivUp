/**
 * /business/explore — browse other businesses' public Quests for inspiration.
 * Shows only public Quest data (structure, participant and completion counts);
 * never participant identities or private analytics.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, Calendar, CheckCircle2, Copy, ListChecks, Search, Store, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QUEST_CATEGORIES } from "@/lib/data/businessQuests";

export const dynamic = "force-dynamic";

type Sort = "newest" | "popular" | "completion";
interface Row {
  id: string; title: string; category: string | null; cover_url: string | null; thumbnail_url: string | null;
  location_name: string | null; participant_count: number | null; completion_count: number | null;
  start_date: string | null; end_date: string | null; created_at: string; business_name: string | null;
  business: { business_name: string | null; logo_url: string | null; verification_status: string } | null;
}

const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;

export default async function BusinessExplorePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { q = "", category = "", sort: rawSort = "newest" } = await searchParams;
  const sort: Sort = rawSort === "popular" || rawSort === "completion" ? rawSort : "newest";

  let query = supabase.from("quests")
    .select("id, title, category, cover_url, thumbnail_url, location_name, participant_count, completion_count, start_date, end_date, created_at, business_name, business:business_profiles!business_id ( business_name, logo_url, verification_status )")
    .in("quest_status", ["active", "published"])
    .not("business_id", "is", null)
    .neq("creator_id", user.id)
    .limit(60);
  if (category) query = query.eq("category", category);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`title.ilike.%${term}%,business_name.ilike.%${term}%,category.ilike.%${term}%`);
  query = sort === "popular" ? query.order("participant_count", { ascending: false }) : query.order("created_at", { ascending: false });
  const { data } = await query;
  let rows = (data ?? []) as unknown as Row[];
  const rate = (r: Row) => (r.participant_count ?? 0) > 0 ? (r.completion_count ?? 0) / (r.participant_count ?? 1) : -1;
  if (sort === "completion") rows = [...rows].sort((a, b) => rate(b) - rate(a));

  const ids = rows.map(r => r.id);
  const { data: tasks } = ids.length ? await supabase.from("quest_tasks").select("quest_id").in("quest_id", ids) : { data: [] };
  const taskCount = new Map<string, number>();
  (tasks ?? []).forEach((t: { quest_id: string }) => taskCount.set(t.quest_id, (taskCount.get(t.quest_id) ?? 0) + 1));

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ q, category, sort, ...over });
    [...p.keys()].forEach(k => { if (!p.get(k)) p.delete(k); });
    return `/business/explore?${p.toString()}`;
  };

  return (
    <div className="min-h-screen bg-surface pb-16">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-2">
        <Link href="/business/dashboard" aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-surface-container-low">
          <ArrowLeft size={20} className="text-on-surface-variant" />
        </Link>
        <div>
          <h1 className="text-body-lg font-black text-on-surface">Explore Quests</h1>
          <p className="text-xs text-on-surface-variant">See how other businesses design Quests, then build your own.</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-5">
        <form action="/business/explore" className="flex flex-col gap-2 sm:flex-row">
          <label className="flex h-12 flex-1 items-center gap-2 rounded-xl border border-outline bg-surface-container-lowest px-3 focus-within:border-secondary focus-within:ring-2 focus-within:ring-blue-100">
            <Search size={16} className="text-on-surface-variant" aria-hidden="true" />
            <input name="q" defaultValue={q} aria-label="Search Quests" placeholder="Search Quests, businesses or categories"
              className="flex-1 bg-transparent text-base text-on-surface focus:outline-none" />
          </label>
          <select name="category" defaultValue={category} aria-label="Category" className="h-12 rounded-xl border border-outline bg-surface-container-lowest px-3 text-sm font-semibold text-on-surface">
            <option value="">All categories</option>
            {QUEST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="hidden" name="sort" value={sort} />
          <button className="h-12 rounded-xl bg-secondary px-5 text-sm font-bold text-white hover:opacity-90">Search</button>
        </form>

        <nav aria-label="Sort" className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {([["newest", "Newest"], ["popular", "Most participants"], ["completion", "Highest completion"]] as const).map(([k, l]) => (
            <Link key={k} href={qs({ sort: k })} aria-current={sort === k ? "page" : undefined}
              className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold leading-10 ${sort === k ? "border-secondary bg-secondary text-white" : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"}`}>
              {l}
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-12 text-center elev-1 surface-raised">
            <Store size={28} className="text-on-surface-variant" aria-hidden="true" />
            <p className="text-body-lg font-bold text-on-surface">No Quests from other businesses yet</p>
            <p className="max-w-sm text-sm text-on-surface-variant">{q || category ? "Try a different search or category." : "Be the first in your area — create a Quest and it will show up here for others."}</p>
            <Link href="/business/quests/new" className="mt-1 h-11 rounded-xl bg-secondary px-5 text-sm font-bold leading-[44px] text-white">Create a Quest</Link>
          </div>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(r => {
              const img = r.cover_url ?? r.thumbnail_url;
              const name = r.business?.business_name ?? r.business_name ?? "Business";
              const verified = r.business?.verification_status === "verified";
              const participants = r.participant_count ?? 0;
              const pct = participants > 0 ? Math.round(((r.completion_count ?? 0) / participants) * 100) : null;
              return (
                <li key={r.id} className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest elev-1 surface-raised">
                  <Link href={`/quests/${r.id}`} className="relative block aspect-video bg-surface-container">
                    {img
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      : <span className="absolute inset-0 flex items-center justify-center"><ListChecks size={28} className="text-on-surface-variant" aria-hidden="true" /></span>}
                    {r.category && <span className="absolute left-2 top-2 rounded-full bg-surface-container-lowest/95 px-2.5 py-1 text-label-sm font-bold text-on-surface">{r.category}</span>}
                  </Link>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <Link href={`/quests/${r.id}`} className="line-clamp-2 text-body-lg font-black leading-snug text-on-surface hover:underline">{r.title}</Link>
                    <p className="flex items-center gap-1 text-sm text-on-surface">
                      <span className="truncate">{name}</span>
                      {verified && <BadgeCheck size={15} className="shrink-0 text-secondary" aria-label="Verified business" />}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                      <span className="flex items-center gap-1"><ListChecks size={13} aria-hidden="true" />{taskCount.get(r.id) ?? 0} tasks</span>
                      <span className="flex items-center gap-1"><Users size={13} aria-hidden="true" />{participants.toLocaleString("en-IN")} joined</span>
                      <span className="flex items-center gap-1"><CheckCircle2 size={13} aria-hidden="true" />{pct === null ? "No completions yet" : `${pct}% completion`}</span>
                      {r.start_date && r.end_date && <span className="flex items-center gap-1"><Calendar size={13} aria-hidden="true" />{fmt(r.start_date)} – {fmt(r.end_date)}</span>}
                    </div>
                    <div className="mt-auto flex gap-2 pt-2">
                      <Link href={`/quests/${r.id}`} className="flex h-10 flex-1 items-center justify-center rounded-xl border border-outline-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low">View</Link>
                      <Link href={`/business/quests/new?template=${r.id}`}
                        className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary text-sm font-bold text-white hover:opacity-90">
                        <Copy size={14} aria-hidden="true" /> Create Similar
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
