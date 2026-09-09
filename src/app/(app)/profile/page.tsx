"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Camera, Check, Edit2, Globe,
  Plus, Settings, ShieldCheck, Trash2, X, Link,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card, Badge } from "@/components/ui";
import {
  getMyProfile, upsertMyProfile, getMySocialLinks,
  addMySocialLink, deleteMySocialLink, uploadMyAvatar,
  type Profile, type SocialLink, type SocialPlatform,
  PROFILE_CONSTANTS,
} from "@/lib/supabase/profile";

/* ── Types ─────────────────────────────────────────────────────────── */
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
}

interface HeatmapEntry {
  submission_date: string;
  submission_count: number;
}

/* ── Social icon map ────────────────────────────────────────────────── */
const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  github:    <Link      size={14} />,
  linkedin:  <Link      size={14} />,
  instagram: <Link      size={14} />,
  twitter:   <Link      size={14} />,
  portfolio: <Globe     size={14} />,
  youtube:   <Globe     size={14} />,
  other:     <Globe     size={14} />,
};

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "github",    label: "GitHub"     },
  { value: "linkedin",  label: "LinkedIn"   },
  { value: "instagram", label: "Instagram"  },
  { value: "twitter",   label: "X / Twitter"},
  { value: "youtube",   label: "YouTube"    },
  { value: "portfolio", label: "Portfolio"  },
  { value: "other",     label: "Other"      },
];

/* ── Consistency Heatmap ────────────────────────────────────────────── */
function ConsistencyHeatmap({
  entries, currentStreak,
}: {
  entries: HeatmapEntry[];
  currentStreak: number;
}) {
  const today = new Date();
  // Build last 26 weeks (182 days) grid
  const weeks = 26;
  const days = weeks * 7;
  const dateMap = new Map(entries.map(e => [e.submission_date, e.submission_count]));
  const grid: { date: string; count: number }[][] = [];

  for (let w = weeks - 1; w >= 0; w--) {
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
  // Month labels — show when week starts a new month
  const monthLabels: { label: string; col: number }[] = [];
  grid.forEach((week, i) => {
    const firstDay = new Date(week[0].date);
    if (i === 0 || new Date(grid[i-1][0].date).getMonth() !== firstDay.getMonth()) {
      monthLabels.push({ label: months[firstDay.getMonth()], col: i });
    }
  });

  function cellColor(count: number) {
    if (count === 0) return "bg-surface-container border border-outline-variant/50";
    if (count === 1) return "bg-secondary/20";
    if (count === 2) return "bg-secondary/40";
    if (count === 3) return "bg-secondary/65";
    return "bg-secondary";
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[520px]">
        {/* Month labels */}
        <div className="flex mb-1 ml-6">
          {monthLabels.map(ml => (
            <div key={ml.col} className="text-[9px] text-on-surface-variant"
              style={{ marginLeft: ml.col === 0 ? 0 : `${(ml.col - (monthLabels[monthLabels.indexOf(ml)-1]?.col ?? 0)) * 14}px` }}>
              {ml.label}
            </div>
          ))}
        </div>
        <div className="flex gap-0.5">
          {/* Day labels */}
          <div className="flex flex-col gap-0.5 mr-1">
            {["Mon","","Wed","","Fri","",""].map((label, i) => (
              <div key={i} className="h-[12px] text-[9px] text-on-surface-variant flex items-center">
                {label}
              </div>
            ))}
          </div>
          {/* Grid */}
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((cell, di) => (
                <div
                  key={di}
                  title={`${cell.date}: ${cell.count} submission${cell.count !== 1 ? "s" : ""}`}
                  className={`w-[12px] h-[12px] rounded-sm ${cellColor(cell.count)}`}
                />
              ))}
            </div>
          ))}
        </div>
        {/* Legend + streak */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-on-surface-variant">Less</span>
            {[0,1,2,3,4].map(n => (
              <div key={n} className={`w-[10px] h-[10px] rounded-sm ${cellColor(n)}`} />
            ))}
            <span className="text-[9px] text-on-surface-variant">More</span>
          </div>
          <span className="text-[11px] font-semibold text-on-surface">
            Current Streak: {currentStreak} 🔥
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Active Challenge Card ──────────────────────────────────────────── */
function ChallengeCard({ stats }: { stats: ChallengeStats }) {
  const isDone = stats.status === "completed";
  const emoji = isDone ? "🎉" : stats.consistency_pct >= 90 ? "🔥" : "💪";
  return (
    <div className="flex flex-col rounded-xl overflow-hidden border border-outline-variant bg-surface-container-lowest">
      {/* Thumbnail */}
      <div className="relative w-full aspect-[4/3] bg-surface-container overflow-hidden">
        {stats.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={stats.thumbnail_url} alt={stats.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
            <span className="text-3xl">🏆</span>
          </div>
        )}
        {/* Green check overlay */}
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-[#22c55e] flex items-center justify-center shadow">
          <Check size={13} className="text-white" strokeWidth={3} />
        </div>
      </div>
      {/* Info */}
      <div className="p-2.5 flex flex-col gap-0.5">
        <p className="text-[11px] font-bold text-on-surface leading-tight line-clamp-2">{stats.title}</p>
        <p className="text-[10px] text-on-surface-variant">
          Day {stats.current_day}{stats.duration_days ? `/${stats.duration_days}` : ""} {emoji}
        </p>
        <p className="text-[10px] font-semibold text-on-surface-variant">
          {stats.consistency_pct}% Consistency
        </p>
      </div>
    </div>
  );
}

/* ── Main Profile Page ──────────────────────────────────────────────── */
export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [links, setLinks]       = useState<SocialLink[]>([]);

  // Active challenges (pinned, max 3)
  const [activeStats, setActiveStats]     = useState<ChallengeStats[]>([]);
  const [allUserStats, setAllUserStats]   = useState<ChallengeStats[]>([]);
  const [pinnedIds, setPinnedIds]         = useState<string[]>([]);
  const [managingChallenges, setManagingChallenges] = useState(false);

  // Heatmap
  const [heatmapChallenge, setHeatmapChallenge]   = useState<string | null>(null);
  const [heatmapEntries, setHeatmapEntries]         = useState<HeatmapEntry[]>([]);
  const [heatmapStreak, setHeatmapStreak]           = useState(0);

  // Achievements (completed challenges)
  const [achievements, setAchievements] = useState<ChallengeStats[]>([]);

  // Edit state
  const [editing, setEditing]     = useState(false);
  const [fullName, setFullName]   = useState("");
  const [bio, setBio]             = useState("");
  const [username, setUsername]   = useState("");
  const [saving, setSaving]       = useState(false);

  // Social links
  const [addingLink, setAddingLink]     = useState(false);
  const [newPlatform, setNewPlatform]   = useState<SocialPlatform>("instagram");
  const [newUrl, setNewUrl]             = useState("");

  /* ── Load all data ────────────────────────────────────────────────── */
  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    const [p, socialLinks, statsRes, heatmapRes] = await Promise.all([
      getMyProfile(),
      getMySocialLinks(),
      supabase
        .from("profile_challenge_stats")
        .select("challenge_id,title,duration_days,thumbnail_url,current_day,current_streak,longest_streak,consistency_pct,status,completed_at,joined_at")
        .eq("user_id", user.id),
      supabase
        .from("profile_heatmap")
        .select("challenge_id,submission_date,submission_count")
        .eq("user_id", user.id),
    ]);

    setProfile(p);
    setFullName(p?.full_name ?? "");
    setBio(p?.bio ?? "");
    setUsername(p?.username ?? "");
    setLinks(socialLinks);

    const stats = (statsRes.data ?? []) as ChallengeStats[];
    setAllUserStats(stats);

    const pinned: string[] = (p as any)?.pinned_challenge_ids ?? [];
    setPinnedIds(pinned);

    // Active = pinned challenges still active
    const active = pinned
      .map(id => stats.find(s => s.challenge_id === id))
      .filter(Boolean) as ChallengeStats[];
    setActiveStats(active.length > 0 ? active : stats.filter(s => s.status === "active").slice(0, 3));

    // Achievements = completed
    setAchievements(stats.filter(s => s.status === "completed"));

    // Heatmap default = first active challenge
    const defaultChallenge = stats.find(s => s.status === "active");
    const defaultId = defaultChallenge?.challenge_id ?? null;
    setHeatmapChallenge(defaultId);

    if (defaultId) {
      const hEntries = ((heatmapRes.data ?? []) as any[])
        .filter(e => e.challenge_id === defaultId)
        .map(e => ({ submission_date: e.submission_date, submission_count: e.submission_count }));
      setHeatmapEntries(hEntries);
      setHeatmapStreak(defaultChallenge?.current_streak ?? 0);
    }
  }, [supabase, router]);

  useEffect(() => {
    (async () => {
      try { await loadAll(); }
      catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchHeatmapChallenge = async (challengeId: string) => {
    setHeatmapChallenge(challengeId);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profile_heatmap")
      .select("submission_date,submission_count")
      .eq("user_id", user.id)
      .eq("challenge_id", challengeId);
    setHeatmapEntries((data ?? []) as HeatmapEntry[]);
    const stat = allUserStats.find(s => s.challenge_id === challengeId);
    setHeatmapStreak(stat?.current_streak ?? 0);
  };

  /* ── Save profile ─────────────────────────────────────────────────── */
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await upsertMyProfile({
        full_name: fullName.trim() || undefined,
        bio: bio.trim() || undefined,
        username: username.trim() || undefined,
      });
      await loadAll();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  /* ── Avatar ───────────────────────────────────────────────────────── */
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadMyAvatar(file);
      setProfile(p => p ? { ...p, avatar_url: url } : p);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
  };

  /* ── Pin / unpin challenge ────────────────────────────────────────── */
  const togglePin = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    let next: string[];
    if (pinnedIds.includes(id)) {
      next = pinnedIds.filter(p => p !== id);
    } else {
      if (pinnedIds.length >= 3) return; // max 3
      next = [...pinnedIds, id];
    }
    setPinnedIds(next);
    await supabase.from("profiles").update({ pinned_challenge_ids: next }).eq("id", user.id);
    const active = next.map(pid => allUserStats.find(s => s.challenge_id === pid)).filter(Boolean) as ChallengeStats[];
    setActiveStats(active.length > 0 ? active : allUserStats.filter(s => s.status === "active").slice(0, 3));
  };

  /* ── Social links ─────────────────────────────────────────────────── */
  const handleAddLink = async () => {
    if (!newUrl.trim()) return;
    try {
      const link = await addMySocialLink(newPlatform, newUrl.trim());
      setLinks(prev => [...prev, link]);
      setNewUrl("");
      setAddingLink(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to add link"); }
  };

  const handleDeleteLink = async (id: string) => {
    await deleteMySocialLink(id);
    setLinks(prev => prev.filter(l => l.id !== id));
  };

  /* ── Loading ──────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  const displayName = profile?.full_name || "Your Name";
  const isVerified  = profile?.verification_status === "verified";

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-5 py-4 bg-surface border-b border-outline-variant">
        <h1 className="type-headline-sm text-on-surface font-bold">My Profile</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(v => !v)} aria-label="Edit profile"
            className="w-9 h-9 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-center hover:bg-surface-container-high transition-colors">
            <Edit2 size={16} className="text-on-surface-variant" />
          </button>
          <button onClick={() => router.push("/profile/settings")} aria-label="Settings"
            className="w-9 h-9 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-center hover:bg-surface-container-high transition-colors">
            <Settings size={16} className="text-on-surface-variant" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 px-4 py-3 rounded-xl bg-error-container border border-error/30">
          <p className="type-body-md text-error">{error}</p>
        </div>
      )}

      <div className="max-w-lg mx-auto px-5 py-5 flex flex-col gap-5">

        {/* ── Profile Header Card ────────────────────────────────────── */}
        <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <label className="relative cursor-pointer shrink-0 group">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-outline-variant bg-surface-container">
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                    : <div className="w-full h-full flex items-center justify-center bg-secondary/10">
                        <span className="text-3xl font-black text-secondary">{displayName.charAt(0)}</span>
                      </div>
                  }
                </div>
                {/* Camera overlay */}
                <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-secondary flex items-center justify-center shadow-sm border-2 border-white">
                  <Camera size={11} className="text-white" />
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleAvatarChange} />
              </label>

              {/* Name + info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="type-headline-sm text-on-surface font-bold">{displayName}</h2>
                  {isVerified && (
                    <ShieldCheck size={16} className="text-secondary shrink-0" aria-label="Verified" />
                  )}
                </div>
                {profile?.username && (
                  <p className="type-body-md text-on-surface-variant">@{profile.username}</p>
                )}
                {!editing && profile?.bio && (
                  <p className="type-body-md text-on-surface mt-1 leading-snug">{profile.bio}</p>
                )}
              </div>

              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="shrink-0 px-4 py-1.5 rounded-lg border border-outline-variant type-body-md font-semibold text-on-surface bg-surface-container hover:bg-surface-container-high transition-colors">
                  Edit Profile
                </button>
              )}
            </div>

            {/* Show full name + bio lines like the design */}
            {!editing && (
              <div className="mt-3 space-y-0.5">
                <div>
                  <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Full Name</p>
                  <p className="type-body-md text-on-surface font-medium">{displayName}</p>
                </div>
                {profile?.bio && (
                  <div className="pt-1">
                    <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Bio</p>
                    <p className="type-body-md text-on-surface">{profile.bio}</p>
                  </div>
                )}
              </div>
            )}

            {/* Social link pills */}
            {links.length > 0 && !editing && (
              <div className="flex flex-wrap gap-2 mt-3">
                {links.map(link => (
                  <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container border border-outline-variant text-on-surface-variant hover:text-secondary hover:border-secondary transition-colors">
                    {PLATFORM_ICONS[link.platform]}
                    <span className="text-[11px] font-medium truncate max-w-[100px]">
                      {link.url.replace(/^https?:\/\/(www\.)?/, "").split("/").slice(0, 2).join("/")}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Edit form inline */}
          {editing && (
            <div className="border-t border-outline-variant px-5 py-4 flex flex-col gap-3">
              <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Edit Profile</p>
              <Input label="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} maxLength={80} />
              <Input label="Username" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} maxLength={30} hint="Lowercase letters, numbers, . _" />
              <div className="flex flex-col gap-1">
                <label className="type-body-md font-medium text-on-surface">Bio</label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={160} rows={3}
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:border-secondary focus:ring-secondary/20 resize-none" />
                <p className="text-[10px] text-on-surface-variant">{bio.length}/160</p>
              </div>
              {/* Social links in edit mode */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Social Links</p>
                {links.map(link => (
                  <div key={link.id} className="flex items-center gap-2 bg-surface-container rounded-lg px-3 py-2 border border-outline-variant">
                    {PLATFORM_ICONS[link.platform]}
                    <span className="flex-1 text-[11px] text-on-surface truncate">{link.url}</span>
                    <button type="button" onClick={() => handleDeleteLink(link.id)} className="text-error shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {links.length < PROFILE_CONSTANTS.MAX_SOCIAL_LINKS && !addingLink && (
                  <button type="button" onClick={() => setAddingLink(true)}
                    className="flex items-center gap-1.5 type-body-md text-secondary font-medium">
                    <Plus size={14} /> Add Social Link
                  </button>
                )}
                {addingLink && (
                  <div className="flex flex-col gap-2">
                    <select value={newPlatform} onChange={e => setNewPlatform(e.target.value as SocialPlatform)}
                      className="h-9 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface">
                      {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <Input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://…" className="flex-1" />
                      <Button type="button" variant="primary" size="sm" onClick={handleAddLink} disabled={!newUrl.trim()}>Add</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setAddingLink(false)}>✕</Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-1">
                <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} fullWidth>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)} fullWidth>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── My Active Challenges ───────────────────────────────────── */}
        {activeStats.length > 0 && (
          <div className="bg-surface rounded-2xl border border-outline-variant p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <h3 className="type-body-md font-bold text-on-surface">My Active Challenges</h3>
                <span className="text-[10px] text-on-surface-variant">(Max 3)</span>
                <button className="w-4 h-4 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center">
                  <span className="text-[9px] text-on-surface-variant font-bold">i</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {activeStats.map(stats => (
                <ChallengeCard key={stats.challenge_id} stats={stats} />
              ))}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant">
              <p className="text-[10px] text-on-surface-variant">You can select up to 3 challenges to display.</p>
              <button onClick={() => setManagingChallenges(true)}
                className="text-[11px] text-secondary font-semibold hover:underline">
                Manage
              </button>
            </div>
          </div>
        )}

        {/* ── Consistency Heatmap ────────────────────────────────────── */}
        {allUserStats.filter(s => s.status === "active").length > 0 && (
          <div className="bg-surface rounded-2xl border border-outline-variant p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="type-body-md font-bold text-on-surface">Consistency Heatmap</h3>
              {/* Challenge selector */}
              <select
                value={heatmapChallenge ?? ""}
                onChange={e => switchHeatmapChallenge(e.target.value)}
                className="text-[11px] font-medium text-on-surface bg-surface-container border border-outline-variant rounded-lg px-2 py-1 focus:outline-none"
              >
                {allUserStats.filter(s => s.status === "active").map(s => (
                  <option key={s.challenge_id} value={s.challenge_id}>
                    {s.title.length > 22 ? s.title.slice(0, 22) + "…" : s.title}
                  </option>
                ))}
              </select>
            </div>
            <ConsistencyHeatmap entries={heatmapEntries} currentStreak={heatmapStreak} />
          </div>
        )}

        {/* ── Achievements ───────────────────────────────────────────── */}
        {achievements.length > 0 && (
          <div className="bg-surface rounded-2xl border border-outline-variant p-4">
            <h3 className="type-body-md font-bold text-on-surface mb-4">Achievements</h3>
            <div className="flex flex-col gap-0">
              {achievements.map((ach, i) => {
                const icons = ["🏆","</>","📖","🏃"];
                const colors = ["bg-amber-100","bg-blue-100","bg-purple-100","bg-orange-100"];
                const textColors = ["text-amber-600","text-blue-600","text-purple-600","text-orange-600"];
                const idx = i % 4;
                return (
                  <div key={ach.challenge_id}
                    className="flex items-center gap-3 py-3 border-b border-outline-variant last:border-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[idx]}`}>
                      <span className={`text-lg ${textColors[idx]}`}>{icons[idx]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="type-body-md font-semibold text-on-surface leading-tight">{ach.title}</p>
                      <p className="text-[10px] text-on-surface-variant">
                        Completed{ach.completed_at ? ` on ${new Date(ach.completed_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e6f9f0] text-[#1a9e5c]">Completed</span>
                      <span className="text-on-surface-variant">›</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────────────── */}
        {activeStats.length === 0 && achievements.length === 0 && (
          <div className="bg-surface rounded-2xl border border-outline-variant p-8 flex flex-col items-center gap-3 text-center">
            <span className="text-5xl">🚀</span>
            <p className="type-body-lg font-semibold text-on-surface">No challenges yet</p>
            <p className="type-body-md text-on-surface-variant">Join a challenge to start building your streak and see your progress here.</p>
            <Button variant="primary" size="sm" onClick={() => router.push("/explore")}>
              Explore Challenges
            </Button>
          </div>
        )}
      </div>

      {/* ── Manage Challenges Modal ────────────────────────────────────── */}
      {managingChallenges && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-surface rounded-t-2xl sm:rounded-2xl p-5 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="type-headline-sm text-on-surface font-bold">Manage Active Challenges</h2>
              <button onClick={() => setManagingChallenges(false)} className="text-on-surface-variant">
                <X size={20} />
              </button>
            </div>
            <p className="type-body-md text-on-surface-variant mb-4">Pin up to 3 challenges to show on your profile.</p>
            <div className="flex flex-col gap-2">
              {allUserStats.filter(s => s.status === "active").map(s => {
                const pinned = pinnedIds.includes(s.challenge_id);
                return (
                  <button key={s.challenge_id} type="button" onClick={() => togglePin(s.challenge_id)}
                    className={[
                      "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left",
                      pinned
                        ? "border-secondary bg-secondary/5"
                        : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container",
                    ].join(" ")}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${pinned ? "border-secondary bg-secondary" : "border-outline-variant"}`}>
                      {pinned && <Check size={11} className="text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="type-body-md font-semibold text-on-surface truncate">{s.title}</p>
                      <p className="text-[10px] text-on-surface-variant">Day {s.current_day}{s.duration_days ? `/${s.duration_days}` : ""} · {s.consistency_pct}% consistency</p>
                    </div>
                    {pinned && <Badge variant="secondary">Pinned</Badge>}
                  </button>
                );
              })}
            </div>
            <Button variant="primary" size="lg" fullWidth className="mt-4" onClick={() => setManagingChallenges(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
