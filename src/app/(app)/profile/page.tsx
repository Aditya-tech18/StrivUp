"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Camera, Check, ChevronRight, Edit2, Flame, Globe,
  Loader2, Plus, Settings, ShieldCheck, Trash2, X, Link as LinkIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Badge } from "@/components/ui";
import {
  getMyProfile, upsertMyProfile, getMySocialLinks,
  addMySocialLink, deleteMySocialLink, uploadMyAvatar,
  getFollowerCount, getFollowingCount,
  getFollowers, getFollowing,
  type Profile, type SocialLink, type SocialPlatform,
  type FollowerUser, PROFILE_CONSTANTS,
} from "@/lib/supabase/profile";

/* ── Types ────────────────────────────────────────────────────────── */
interface ChallengeStats {
  challenge_id: string;
  title: string;
  duration_days: number | null;
  thumbnail_url: string | null;
  current_day: number;
  current_streak: number;
  consistency_pct: number;
  status: string;
  completed_at: string | null;
  joined_at: string;
}
interface HeatmapEntry { submission_date: string; submission_count: number; }

/* ── Platform config ─────────────────────────────────────────────── */
const PLATFORM_META: Record<string, { label: string; icon: string }> = {
  github:    { label: "GitHub",      icon: "🐙" },
  linkedin:  { label: "LinkedIn",    icon: "💼" },
  instagram: { label: "Instagram",   icon: "📷" },
  twitter:   { label: "X",           icon: "𝕏" },
  youtube:   { label: "YouTube",     icon: "▶️" },
  portfolio: { label: "Portfolio",   icon: "🌐" },
  other:     { label: "Link",        icon: "🔗" },
};

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin",  label: "LinkedIn"  },
  { value: "github",    label: "GitHub"    },
  { value: "twitter",   label: "X / Twitter" },
  { value: "youtube",   label: "YouTube"   },
  { value: "portfolio", label: "Portfolio" },
  { value: "other",     label: "Other"     },
];

/* ── Heatmap ─────────────────────────────────────────────────────── */
function ConsistencyHeatmap({ entries, currentStreak }: { entries: HeatmapEntry[]; currentStreak: number }) {
  const today = new Date();
  const WEEKS = 26;
  const dateMap = new Map(entries.map(e => [e.submission_date, e.submission_count]));
  const grid: { date: string; count: number }[][] = [];

  for (let w = WEEKS - 1; w >= 0; w--) {
    const week: { date: string; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(today);
      dt.setDate(today.getDate() - (w * 7 + (6 - d)));
      const key = dt.toISOString().split("T")[0];
      week.push({ date: key, count: dateMap.get(key) ?? 0 });
    }
    grid.push(week);
  }

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthLabels: { label: string; col: number }[] = [];
  grid.forEach((week, i) => {
    const d = new Date(week[0].date);
    if (i === 0 || new Date(grid[i-1][0].date).getMonth() !== d.getMonth())
      monthLabels.push({ label: months[d.getMonth()], col: i });
  });

  const cellColor = (n: number) =>
    n === 0 ? "bg-[#ebedf0]" :
    n === 1 ? "bg-secondary/25" :
    n === 2 ? "bg-secondary/50" :
    n === 3 ? "bg-secondary/75" : "bg-secondary";

  return (
    <div className="w-full overflow-x-auto no-scrollbar">
      <div className="min-w-[520px]">
        <div className="relative flex mb-1 ml-7 h-4">
          {monthLabels.map((ml, i) => (
            <span key={ml.col} className="absolute text-[9px] text-on-surface-variant"
              style={{ left: `${ml.col * 14}px` }}>{ml.label}</span>
          ))}
        </div>
        <div className="flex gap-0.5">
          <div className="flex flex-col gap-0.5 mr-1 pt-0.5">
            {["","M","","W","","F",""].map((l, i) => (
              <div key={i} className="w-5 h-[12px] text-[9px] text-on-surface-variant flex items-center justify-end pr-1">{l}</div>
            ))}
          </div>
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((cell, di) => (
                <div key={di} title={`${cell.date}: ${cell.count}`}
                  className={`w-[12px] h-[12px] rounded-[2px] ${cellColor(cell.count)}`} />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-on-surface-variant">Less</span>
            {[0,1,2,3,4].map(n => <div key={n} className={`w-[10px] h-[10px] rounded-[2px] ${cellColor(n)}`} />)}
            <span className="text-[9px] text-on-surface-variant">More</span>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-bold text-on-surface">
            <Flame size={13} className="text-orange-400" /> {currentStreak} day streak
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Challenge Card ──────────────────────────────────────────────── */
function ChallengeCard({ stats }: { stats: ChallengeStats }) {
  const emoji = stats.status === "completed" ? "🎉" : stats.consistency_pct >= 90 ? "🔥" : "💪";
  return (
    <div className="flex flex-col rounded-xl overflow-hidden border border-outline-variant bg-white shadow-sm">
      <div className="relative w-full aspect-[4/3] bg-surface-container overflow-hidden">
        {stats.thumbnail_url
          ? <img src={stats.thumbnail_url} alt={stats.title} className="w-full h-full object-cover" /> // eslint-disable-line
          : <div className="w-full h-full bg-gradient-to-br from-secondary/15 to-secondary/5 flex items-center justify-center"><span className="text-3xl">🏆</span></div>}
        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-[#22c55e] flex items-center justify-center shadow">
          <Check size={11} className="text-white" strokeWidth={3} />
        </div>
      </div>
      <div className="p-2 flex flex-col gap-0.5">
        <p className="text-[11px] font-bold text-on-surface leading-tight line-clamp-2">{stats.title}</p>
        <p className="text-[10px] text-on-surface-variant">Day {stats.current_day}{stats.duration_days ? `/${stats.duration_days}` : ""} {emoji}</p>
        <p className="text-[10px] font-bold text-secondary">{stats.consistency_pct}% Consistency</p>
      </div>
    </div>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────────── */
function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[#e9eaec] ${className}`} />;
}

/* ── Follow List Modal ───────────────────────────────────────────── */
function FollowModal({
  title, userId,
  fetchFn, onClose,
}: {
  title: string; userId: string;
  fetchFn: (uid: string, page: number) => Promise<FollowerUser[]>;
  onClose: () => void;
}) {
  const PAGE = 20;
  const [users, setUsers] = useState<FollowerUser[]>([]);
  const [page, setPage]   = useState(0);
  const [busy, setBusy]   = useState(true);
  const [more, setMore]   = useState(true);

  const load = useCallback(async (pg: number) => {
    setBusy(true);
    const data = await fetchFn(userId, pg);
    setUsers(prev => pg === 0 ? data : [...prev, ...data]);
    setMore(data.length === PAGE);
    setBusy(false);
  }, [userId, fetchFn]);

  useEffect(() => { load(0); }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-md bg-white rounded-2xl flex flex-col max-h-[80vh] shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant shrink-0">
          <h2 className="type-headline-sm font-bold text-on-surface">{title}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5">
          {busy && users.length === 0
            ? <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-secondary" /></div>
            : users.length === 0
              ? <p className="text-center py-10 text-on-surface-variant type-body-md">No {title.toLowerCase()} yet.</p>
              : <>
                  {users.map(u => {
                    const initials = (u.full_name ?? u.username ?? "?").charAt(0).toUpperCase();
                    return (
                      <div key={u.id} className="flex items-center gap-3 py-3 border-b border-outline-variant last:border-0">
                        <div className="w-10 h-10 rounded-full bg-secondary/10 overflow-hidden shrink-0 flex items-center justify-center">
                          {u.avatar_url
                            ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> // eslint-disable-line
                            : <span className="text-secondary font-bold">{initials}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="type-body-md font-semibold text-on-surface truncate">{u.full_name ?? u.username ?? "Unknown"}</p>
                            {u.verification_status === "approved" && <ShieldCheck size={13} className="text-secondary shrink-0" />}
                          </div>
                          {u.username && <p className="text-[11px] text-on-surface-variant">@{u.username}</p>}
                        </div>
                      </div>
                    );
                  })}
                  {more && (
                    <div className="py-4 flex justify-center">
                      <button onClick={() => { const next = page + 1; setPage(next); load(next); }}
                        disabled={busy}
                        className="text-[13px] text-secondary font-semibold disabled:opacity-40">
                        {busy ? <Loader2 size={14} className="animate-spin" /> : "Load more"}
                      </button>
                    </div>
                  )}
                </>
          }
        </div>
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────── */
export default function ProfilePage() {
  const router  = useRouter();
  const supabase = createClient();

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [links, setLinks]       = useState<SocialLink[]>([]);
  const [userId, setUserId]     = useState<string | null>(null);

  // Followers
  const [fCount, setFCount]     = useState(0);
  const [fgCount, setFgCount]   = useState(0);
  const [showFoll, setShowFoll] = useState(false);
  const [showFolg, setShowFolg] = useState(false);

  // Challenges
  const [activeStats, setActiveStats]   = useState<ChallengeStats[]>([]);
  const [allStats, setAllStats]         = useState<ChallengeStats[]>([]);
  const [pinnedIds, setPinnedIds]       = useState<string[]>([]);
  const [manageOpen, setManageOpen]     = useState(false);

  // Heatmap
  const [heatId, setHeatId]         = useState<string | null>(null);
  const [heatEntries, setHeatEntries] = useState<HeatmapEntry[]>([]);
  const [heatStreak, setHeatStreak] = useState(0);

  // Achievements
  const [achievements, setAchievements] = useState<ChallengeStats[]>([]);

  // Edit
  const [editing, setEditing]   = useState(false);
  const [fullName, setFullName] = useState("");
  const [bio, setBio]           = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);

  // Social links
  const [addingLink, setAddingLink] = useState(false);
  const [newPlat, setNewPlat]       = useState<SocialPlatform>("instagram");
  const [newUrl, setNewUrl]         = useState("");

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    setUserId(user.id);

    const [p, sl, statsRes, hmRes, fc, fgc] = await Promise.all([
      getMyProfile(),
      getMySocialLinks(),
      supabase.from("profile_challenge_stats")
        .select("challenge_id,title,duration_days,thumbnail_url,current_day,current_streak,longest_streak,consistency_pct,status,completed_at,joined_at")
        .eq("user_id", user.id),
      supabase.from("profile_heatmap")
        .select("challenge_id,submission_date,submission_count")
        .eq("user_id", user.id),
      getFollowerCount(user.id),
      getFollowingCount(user.id),
    ]);

    setProfile(p); setLinks(sl);
    setFullName(p?.full_name ?? ""); setBio(p?.bio ?? ""); setUsername(p?.username ?? "");
    setFCount(fc); setFgCount(fgc);

    const stats = (statsRes.data ?? []) as ChallengeStats[];
    setAllStats(stats);
    setAchievements(stats.filter(s => s.status === "completed"));

    const pinned: string[] = (p as any)?.pinned_challenge_ids ?? [];
    setPinnedIds(pinned);

    const active = pinned.length > 0
      ? pinned.map(id => stats.find(s => s.challenge_id === id)).filter(Boolean) as ChallengeStats[]
      : stats.filter(s => s.status === "active").slice(0, 3);
    setActiveStats(active);

    const defChallenge = stats.find(s => s.status === "active");
    const defId = defChallenge?.challenge_id ?? null;
    setHeatId(defId);
    if (defId) {
      const hdata = ((hmRes.data ?? []) as any[])
        .filter(e => e.challenge_id === defId)
        .map(e => ({ submission_date: e.submission_date, submission_count: e.submission_count }));
      setHeatEntries(hdata);
      setHeatStreak(defChallenge?.current_streak ?? 0);
    }
  }, [supabase, router]);

  useEffect(() => {
    (async () => {
      try { await loadAll(); }
      catch (e) { setError(e instanceof Error ? e.message : "Failed to load profile"); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchHeatmap = async (cid: string) => {
    setHeatId(cid);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profile_heatmap")
      .select("submission_date,submission_count")
      .eq("user_id", user.id).eq("challenge_id", cid);
    setHeatEntries((data ?? []) as HeatmapEntry[]);
    setHeatStreak(allStats.find(s => s.challenge_id === cid)?.current_streak ?? 0);
  };

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await upsertMyProfile({
        full_name: fullName.trim() || undefined,
        bio: bio.trim() || undefined,
        username: username.trim() || undefined,
      });
      await loadAll();
      setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const url = await uploadMyAvatar(file);
      setProfile(p => p ? { ...p, avatar_url: url } : p);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); }
  };

  const togglePin = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const next = pinnedIds.includes(id)
      ? pinnedIds.filter(p => p !== id)
      : pinnedIds.length >= 3 ? pinnedIds : [...pinnedIds, id];
    setPinnedIds(next);
    await supabase.from("profiles").update({ pinned_challenge_ids: next }).eq("id", user.id);
    const active = next.length > 0
      ? next.map(pid => allStats.find(s => s.challenge_id === pid)).filter(Boolean) as ChallengeStats[]
      : allStats.filter(s => s.status === "active").slice(0, 3);
    setActiveStats(active);
  };

  const handleAddLink = async () => {
    if (!newUrl.trim()) return;
    try {
      const l = await addMySocialLink(newPlat, newUrl.trim());
      setLinks(prev => [...prev, l]); setNewUrl(""); setAddingLink(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to add link"); }
  };

  const handleDelLink = async (id: string) => {
    await deleteMySocialLink(id);
    setLinks(prev => prev.filter(l => l.id !== id));
  };

  /* ── Loading skeleton ───────────────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-outline-variant">
        <Sk className="h-6 w-28" /><div className="flex gap-2"><Sk className="w-9 h-9 rounded-xl" /><Sk className="w-9 h-9 rounded-xl" /></div>
      </div>
      <div className="max-w-lg mx-auto px-5 py-5 flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-outline-variant p-5">
          <div className="flex gap-4"><Sk className="w-20 h-20 rounded-full shrink-0" /><div className="flex-1 flex flex-col gap-2 pt-1"><Sk className="h-5 w-36" /><Sk className="h-4 w-24" /><Sk className="h-4 w-48" /></div></div>
          <div className="flex gap-8 mt-4 pt-4 border-t border-outline-variant"><Sk className="h-10 w-20" /><Sk className="h-10 w-20" /></div>
        </div>
        <div className="bg-white rounded-2xl border border-outline-variant p-4">
          <Sk className="h-4 w-40 mb-3" />
          <div className="grid grid-cols-3 gap-2"><Sk className="aspect-[4/3] rounded-xl" /><Sk className="aspect-[4/3] rounded-xl" /><Sk className="aspect-[4/3] rounded-xl" /></div>
        </div>
      </div>
    </div>
  );

  const displayName = profile?.full_name || "Your Name";
  const isVerified  = profile?.verification_status === "approved";

  const fmtCount = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString();

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-5 py-4 bg-white border-b border-outline-variant">
        <h1 className="text-[17px] font-bold text-on-surface">My Profile</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(v => !v)} aria-label="Edit"
            className="w-9 h-9 rounded-xl bg-[#F5F6F8] border border-outline-variant flex items-center justify-center hover:bg-surface-container-high transition-colors">
            <Edit2 size={15} className="text-on-surface-variant" />
          </button>
          <button onClick={() => router.push("/settings")} aria-label="Settings"
            className="w-9 h-9 rounded-xl bg-[#F5F6F8] border border-outline-variant flex items-center justify-center hover:bg-surface-container-high transition-colors">
            <Settings size={15} className="text-on-surface-variant" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2">
          <p className="text-[13px] text-error flex-1">{error}</p>
          <button onClick={() => setError(null)}><X size={14} className="text-error" /></button>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-3">

        {/* ── Profile card ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="px-4 pt-5 pb-4">

            {/* Avatar + name row */}
            <div className="flex items-start gap-3.5">
              <label className="relative cursor-pointer shrink-0 group">
                <div className={`w-[76px] h-[76px] rounded-full overflow-hidden border-2 border-outline-variant bg-secondary/10 ${uploading ? "opacity-60" : ""}`}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" /> // eslint-disable-line
                    : <div className="w-full h-full flex items-center justify-center"><span className="text-[28px] font-black text-secondary">{displayName.charAt(0)}</span></div>}
                </div>
                <div className="absolute bottom-0 right-0 w-[22px] h-[22px] rounded-full bg-secondary flex items-center justify-center shadow border-2 border-white">
                  {uploading ? <Loader2 size={10} className="text-white animate-spin" /> : <Camera size={10} className="text-white" />}
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleAvatar} disabled={uploading} />
              </label>

              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-[17px] font-bold text-on-surface leading-tight">{displayName}</h2>
                  {isVerified && <ShieldCheck size={15} className="text-secondary shrink-0" />}
                </div>
                {profile?.username && (
                  <p className="text-[13px] text-on-surface-variant">@{profile.username}</p>
                )}
                {!editing && profile?.bio && (
                  <p className="text-[13px] text-on-surface mt-1.5 leading-snug">{profile.bio}</p>
                )}
                {!editing && !profile?.bio && (
                  <button onClick={() => setEditing(true)} className="mt-1.5 text-[12px] text-secondary font-medium hover:underline">+ Add bio</button>
                )}
              </div>

              {!editing && (
                <button onClick={() => router.push("/settings/edit-profile")}
                  className="shrink-0 px-3.5 py-1.5 rounded-lg border border-outline-variant text-[12px] font-semibold text-on-surface bg-[#F5F6F8] hover:bg-surface-container-high transition-colors">
                  Edit Profile
                </button>
              )}
            </div>

            {/* ── Followers / Following ──────────────────────────── */}
            <div className="flex items-center gap-5 mt-4 pt-3.5 border-t border-outline-variant">
              <button onClick={() => setShowFoll(true)} className="flex flex-col items-center group">
                <span className="text-[20px] font-bold text-on-surface tabular-nums">{fmtCount(fCount)}</span>
                <span className="text-[11px] text-on-surface-variant group-hover:text-secondary transition-colors font-medium">Followers</span>
              </button>
              <div className="w-px h-7 bg-outline-variant" />
              <button onClick={() => setShowFolg(true)} className="flex flex-col items-center group">
                <span className="text-[20px] font-bold text-on-surface tabular-nums">{fmtCount(fgCount)}</span>
                <span className="text-[11px] text-on-surface-variant group-hover:text-secondary transition-colors font-medium">Following</span>
              </button>
            </div>

            {/* ── Social link pills ─────────────────────────────── */}
            {links.length > 0 && !editing && (
              <div className="flex flex-wrap gap-2 mt-3">
                {links.map(link => {
                  const meta = PLATFORM_META[link.platform] ?? { label: link.platform, icon: "🔗" };
                  const display = link.url.replace(/^https?:\/\/(www\.)?/, "").split("/").slice(0, 2).join("/");
                  return (
                    <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F5F6F8] border border-outline-variant text-on-surface-variant hover:text-secondary hover:border-secondary transition-colors">
                      <span className="text-[13px]">{meta.icon}</span>
                      <span className="text-[11px] font-medium max-w-[80px] truncate">{display}</span>
                    </a>
                  );
                })}
              </div>
            )}
            {links.length === 0 && !editing && (
              <button onClick={() => setEditing(true)}
                className="mt-3 flex items-center gap-1.5 text-[12px] text-on-surface-variant hover:text-secondary transition-colors">
                <Plus size={13} /> Add social links
              </button>
            )}
          </div>

          {/* ── Inline edit form ────────────────────────────────── */}
          {editing && (
            <div className="border-t border-outline-variant px-4 py-4 bg-[#FAFAFA] flex flex-col gap-3">
              <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Editing Profile</p>

              <div>
                <label className="block text-[11px] font-medium text-on-surface-variant mb-1">Full Name</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)} maxLength={80}
                  className="w-full h-10 rounded-xl border border-outline-variant bg-white px-3 text-[14px] text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-on-surface-variant mb-1">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[13px]">@</span>
                  <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g,""))} maxLength={30}
                    className="w-full h-10 rounded-xl border border-outline-variant bg-white pl-7 pr-3 text-[14px] text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-medium text-on-surface-variant">Bio</label>
                  <span className="text-[10px] text-on-surface-variant">{bio.length}/150</span>
                </div>
                <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={150} rows={3}
                  className="w-full rounded-xl border border-outline-variant bg-white px-3 py-2 text-[14px] text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary resize-none" />
              </div>

              {/* Social links in edit mode */}
              <div>
                <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Social Links</p>
                <div className="flex flex-col gap-2">
                  {links.map(link => {
                    const meta = PLATFORM_META[link.platform];
                    return (
                      <div key={link.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-outline-variant bg-white">
                        <span className="text-base shrink-0">{meta?.icon ?? "🔗"}</span>
                        <span className="flex-1 text-[12px] text-on-surface truncate">{link.url}</span>
                        <button onClick={() => handleDelLink(link.id)} className="text-error shrink-0"><Trash2 size={13} /></button>
                      </div>
                    );
                  })}
                  {!addingLink && links.length < PROFILE_CONSTANTS.MAX_SOCIAL_LINKS && (
                    <button onClick={() => setAddingLink(true)}
                      className="flex items-center gap-1.5 text-[13px] text-secondary font-semibold">
                      <Plus size={14} /> Add Social Link
                    </button>
                  )}
                  {addingLink && (
                    <div className="flex flex-col gap-2">
                      <select value={newPlat} onChange={e => setNewPlat(e.target.value as SocialPlatform)}
                        className="h-9 rounded-xl border border-outline-variant bg-white px-3 text-[13px] text-on-surface">
                        {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://…"
                          className="flex-1 h-9 rounded-xl border border-outline-variant bg-white px-3 text-[13px] text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
                        <button onClick={handleAddLink} disabled={!newUrl.trim()}
                          className="px-3 h-9 rounded-xl bg-secondary text-white font-semibold text-[13px] disabled:opacity-40">Add</button>
                        <button onClick={() => setAddingLink(false)}
                          className="px-3 h-9 rounded-xl border border-outline-variant text-on-surface-variant text-[13px]">✕</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 h-10 rounded-xl bg-secondary text-white font-bold text-[14px] flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save Changes"}
                </button>
                <button onClick={() => setEditing(false)}
                  className="flex-1 h-10 rounded-xl border border-outline-variant text-on-surface font-semibold text-[14px]">Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* ── My Active Challenges ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-outline-variant p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-bold text-on-surface">
              My Active Challenges{activeStats.length > 0 && <span className="text-on-surface-variant font-normal"> ({activeStats.length})</span>}
            </h3>
            {allStats.filter(s => s.status === "active").length > 0 && (
              <button onClick={() => setManageOpen(true)} className="text-[13px] text-secondary font-bold hover:underline">Manage</button>
            )}
          </div>

          {activeStats.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {activeStats.map(s => <ChallengeCard key={s.challenge_id} stats={s} />)}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5 py-8 text-center">
              <span className="text-4xl">🚀</span>
              <p className="text-[13px] font-semibold text-on-surface">No active challenges yet.</p>
              <p className="text-[12px] text-on-surface-variant">Join a challenge to start tracking your progress here.</p>
              <button onClick={() => router.push("/explore")}
                className="mt-1 px-4 py-2 rounded-xl bg-secondary text-white text-[13px] font-bold">
                Explore Challenges
              </button>
            </div>
          )}
        </div>

        {/* ── Consistency Heatmap ──────────────────────────────────── */}
        {allStats.filter(s => s.status === "active").length > 0 && (
          <div className="bg-white rounded-2xl border border-outline-variant p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-bold text-on-surface">Consistency Heatmap</h3>
              <select value={heatId ?? ""} onChange={e => switchHeatmap(e.target.value)}
                className="text-[11px] font-medium text-on-surface bg-[#F5F6F8] border border-outline-variant rounded-lg px-2 py-1.5 focus:outline-none max-w-[140px] truncate">
                {allStats.filter(s => s.status === "active").map(s => (
                  <option key={s.challenge_id} value={s.challenge_id}>
                    {s.title.length > 22 ? s.title.slice(0, 22) + "…" : s.title}
                  </option>
                ))}
              </select>
            </div>
            <ConsistencyHeatmap entries={heatEntries} currentStreak={heatStreak} />
          </div>
        )}

        {/* ── Achievements ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-outline-variant p-4 shadow-sm">
          <h3 className="text-[15px] font-bold text-on-surface mb-3">Achievements</h3>
          {achievements.length > 0 ? (
            <div>
              {achievements.map((a, i) => {
                const emojis = ["🏆","💻","📖","🏃","💪","🎯","✍️","🎨"];
                const bgs    = ["bg-amber-50","bg-blue-50","bg-purple-50","bg-orange-50","bg-green-50","bg-red-50","bg-pink-50","bg-teal-50"];
                const idx    = i % emojis.length;
                return (
                  <div key={a.challenge_id} className="flex items-center gap-3 py-3 border-b border-outline-variant last:border-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bgs[idx]}`}>
                      <span className="text-lg">{emojis[idx]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-on-surface truncate">{a.title}</p>
                      <p className="text-[11px] text-on-surface-variant">
                        Completed{a.completed_at ? ` on ${new Date(a.completed_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700">Completed</span>
                      <ChevronRight size={14} className="text-outline" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5 py-6 text-center">
              <span className="text-4xl">🎖️</span>
              <p className="text-[13px] text-on-surface-variant">Your achievements will appear here as you complete challenges and quests.</p>
              <button onClick={() => router.push("/explore")}
                className="mt-1 px-4 py-2 rounded-xl border border-outline-variant text-on-surface text-[13px] font-semibold hover:bg-surface-container transition-colors">
                Start a Challenge
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Manage Challenges Modal ─────────────────────────────────── */}
      {manageOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[17px] font-bold text-on-surface">Manage Challenges</h2>
              <button onClick={() => setManageOpen(false)} className="text-on-surface-variant"><X size={20} /></button>
            </div>
            <p className="text-[13px] text-on-surface-variant mb-4">Pin up to 3 challenges to display on your profile.</p>
            <div className="flex flex-col gap-2">
              {allStats.filter(s => s.status === "active").map(s => {
                const pinned = pinnedIds.includes(s.challenge_id);
                return (
                  <button key={s.challenge_id} onClick={() => togglePin(s.challenge_id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${pinned ? "border-secondary bg-secondary/5" : "border-outline-variant hover:bg-[#F5F6F8]"}`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${pinned ? "bg-secondary border-secondary" : "border-outline-variant"}`}>
                      {pinned && <Check size={11} className="text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-on-surface truncate">{s.title}</p>
                      <p className="text-[11px] text-on-surface-variant">Day {s.current_day}{s.duration_days ? `/${s.duration_days}` : ""} · {s.consistency_pct}% consistency</p>
                    </div>
                    {pinned && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary/10 text-secondary shrink-0">Pinned</span>}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setManageOpen(false)}
              className="w-full mt-4 h-11 rounded-xl bg-secondary text-white font-bold text-[14px]">Done</button>
          </div>
        </div>
      )}

      {/* ── Follow Modals ─────────────────────────────────────────── */}
      {showFoll && userId && <FollowModal title="Followers" userId={userId} fetchFn={getFollowers} onClose={() => setShowFoll(false)} />}
      {showFolg && userId && <FollowModal title="Following" userId={userId} fetchFn={getFollowing} onClose={() => setShowFolg(false)} />}
    </div>
  );
}
