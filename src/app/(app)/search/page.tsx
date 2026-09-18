"use client";
/**
 * /search — Global search for users, challenges and quests.
 */
import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ShieldCheck, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Tab = "users" | "challenges" | "quests";

interface UserResult {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  verification_status: string | null;
  bio: string | null;
}

interface ChallengeResult {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  participant_count: number;
  category: string | null;
}

interface QuestResult {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  thumbnail_url: string | null;
  participant_count: number;
  category: string | null;
  business_name: string | null;
}

export default function SearchPage() {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("users");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserResult[]>([]);
  const [challenges, setChallenges] = useState<ChallengeResult[]>([]);
  const [quests, setQuests] = useState<QuestResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setUsers([]); setChallenges([]); setQuests([]);
      return;
    }
    setLoading(true);
    const pattern = `%${q.trim()}%`;

    const [usersRes, challengesRes, questsRes] = await Promise.all([
      supabase.from("profiles")
        .select("id,full_name,username,avatar_url,verification_status,bio")
        .or(`full_name.ilike.${pattern},username.ilike.${pattern}`)
        .limit(20),
      supabase.from("challenges")
        .select("id,title,description,thumbnail_url,category")
        .or(`title.ilike.${pattern},description.ilike.${pattern}`)
        .eq("visibility", "public")
        .limit(20),
      supabase.from("quests")
        .select("id,title,description,cover_url,thumbnail_url,participant_count,category,business_name")
        .or(`title.ilike.${pattern},description.ilike.${pattern}`)
        .in("quest_status", ["active", "published"])
        .limit(20),
    ]);

    // Get participant counts for challenges
    const chData = (challengesRes.data ?? []) as ChallengeResult[];
    const withCounts = await Promise.all(chData.map(async ch => {
      const { count } = await supabase.from("challenge_participants")
        .select("id", { count: "exact", head: true }).eq("challenge_id", ch.id);
      return { ...ch, participant_count: count ?? 0 };
    }));

    setUsers((usersRes.data ?? []) as UserResult[]);
    setChallenges(withCounts);
    setQuests((questsRes.data ?? []) as QuestResult[]);
    setLoading(false);
  }, [supabase]);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  };

  const counts = { users: users.length, challenges: challenges.length, quests: quests.length };
  const hasResults = users.length > 0 || challenges.length > 0 || quests.length > 0;

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-28">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-outline-variant">
        <div className="max-w-lg mx-auto px-5 py-3">
          <div className="flex items-center gap-2 bg-surface-container rounded-xl border border-outline-variant px-4 h-11">
            <Search size={18} className="text-on-surface-variant shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => handleChange(e.target.value)}
              placeholder="Search people, challenges, quests…"
              className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant outline-none"
              autoFocus
            />
            {query && (
              <button onClick={() => { setQuery(""); setUsers([]); setChallenges([]); setQuests([]); inputRef.current?.focus(); }}>
                <X size={16} className="text-on-surface-variant" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        {hasResults && (
          <div className="flex gap-0 border-t border-outline-variant/50 max-w-lg mx-auto">
            {(["users","challenges","quests"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-bold capitalize flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  tab === t ? "border-secondary text-secondary" : "border-transparent text-on-surface-variant"
                }`}>
                {t}
                {counts[t] > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${tab === t ? "bg-secondary text-on-secondary" : "bg-surface-container text-on-surface-variant"}`}>
                    {counts[t]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-5 pt-4">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
          </div>
        )}

        {/* Empty query */}
        {!loading && query.length < 2 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Search size={36} className="text-on-surface-variant opacity-30" />
            <p className="text-sm text-on-surface-variant">Search for people, challenges or quests.</p>
          </div>
        )}

        {/* No results */}
        {!loading && query.length >= 2 && !hasResults && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="text-sm text-on-surface-variant">No results for &quot;{query}&quot;</p>
          </div>
        )}

        {/* Users */}
        {!loading && tab === "users" && users.length > 0 && (
          <div className="flex flex-col gap-2">
            {users.map(user => (
              <Link key={user.id} href={`/profile/${user.id}`}>
                <div className="bg-white rounded-2xl border border-outline-variant px-4 py-3 flex items-center gap-3 hover:bg-surface-container transition-colors">
                  <div className="w-11 h-11 rounded-full bg-secondary/10 overflow-hidden shrink-0 flex items-center justify-center">
                    {user.avatar_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="font-black text-secondary text-base">{(user.full_name ?? user.username ?? "?").charAt(0).toUpperCase()}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-on-surface truncate">{user.full_name ?? user.username ?? "Unknown"}</p>
                      {user.verification_status === "verified" && <ShieldCheck size={13} className="text-secondary shrink-0" />}
                    </div>
                    {user.username && <p className="text-xs text-on-surface-variant">@{user.username}</p>}
                    {user.bio && <p className="text-xs text-on-surface-variant line-clamp-1 mt-0.5">{user.bio}</p>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Challenges */}
        {!loading && tab === "challenges" && challenges.length > 0 && (
          <div className="flex flex-col gap-2">
            {challenges.map(ch => (
              <Link key={ch.id} href={`/challenges/${ch.id}`}>
                <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden hover:bg-surface-container transition-colors flex gap-3 p-3">
                  <div className="w-16 h-16 rounded-xl bg-surface-container overflow-hidden shrink-0 flex items-center justify-center">
                    {ch.thumbnail_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={ch.thumbnail_url} alt={ch.title} className="w-full h-full object-cover" />
                      : <span className="text-2xl">🏆</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0 py-0.5">
                    <p className="text-sm font-bold text-on-surface line-clamp-1">{ch.title}</p>
                    {ch.category && <span className="text-[10px] font-semibold text-secondary bg-secondary/10 px-2 py-0.5 rounded-full">{ch.category}</span>}
                    {ch.description && <p className="text-xs text-on-surface-variant line-clamp-1 mt-1">{ch.description}</p>}
                    <div className="flex items-center gap-1 text-xs text-on-surface-variant mt-1">
                      <Users size={11} />{ch.participant_count} participants
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Quests */}
        {!loading && tab === "quests" && quests.length > 0 && (
          <div className="flex flex-col gap-2">
            {quests.map(q => (
              <Link key={q.id} href={`/quests/${q.id}`}>
                <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden hover:bg-surface-container transition-colors flex gap-3 p-3">
                  <div className="w-16 h-16 rounded-xl bg-surface-container overflow-hidden shrink-0 flex items-center justify-center">
                    {(q.cover_url || q.thumbnail_url)
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={q.cover_url ?? q.thumbnail_url ?? ""} alt={q.title} className="w-full h-full object-cover" />
                      : <span className="text-2xl">🎯</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0 py-0.5">
                    <p className="text-sm font-bold text-on-surface line-clamp-1">{q.title}</p>
                    {q.business_name && <p className="text-[10px] text-on-surface-variant">by {q.business_name}</p>}
                    {q.category && <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{q.category}</span>}
                    <div className="flex items-center gap-1 text-xs text-on-surface-variant mt-1">
                      <Users size={11} />{q.participant_count} participants
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
