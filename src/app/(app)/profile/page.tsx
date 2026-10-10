"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Camera, Check, ChevronRight, Coins, Edit2, Flame,
  Loader2, Plus, Settings, ShieldCheck, Trash2, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SocialIcon, PLATFORM_NAME } from "@/components/ui/SocialIcon";
import { ActivityHeatmap } from "@/components/ui/ActivityHeatmap";
import {
  getMyProfile, upsertMyProfile,
  getMySocialLinks, addMySocialLink, deleteMySocialLink,
  uploadMyAvatar, getFollowerCount, getFollowingCount,
  getFollowers, getFollowing,
  type Profile, type SocialLink, type SocialPlatform,
  type FollowerUser, PROFILE_CONSTANTS,
} from "@/lib/supabase/profile";

// ── Types ─────────────────────────────────────────────────────────────────
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

/** Sentinel for the combined view, which has no challenge_id to key on. */
const ALL_ACTIVITY = "all";

// ── Platform labels (no emojis) ─────────────────────────────────────────
const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  linkedin:  "LinkedIn",
  github:    "GitHub",
  twitter:   "X",
  youtube:   "YouTube",
  portfolio: "Portfolio",
  other:     "Link",
};

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "instagram", label: "Instagram"   },
  { value: "linkedin",  label: "LinkedIn"    },
  { value: "github",    label: "GitHub"      },
  { value: "twitter",   label: "X / Twitter" },
  { value: "youtube",   label: "YouTube"     },
  { value: "portfolio", label: "Portfolio"   },
  { value: "other",     label: "Other"       },
];

// ── Skeleton ───────────────────────────────────────────────────────────────
function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-container-highest ${className}`} />;
}


// ── Challenge Card ─────────────────────────────────────────────────────────
function ChallengeCard({ stats }: { stats: ChallengeStats }) {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden border border-outline-variant bg-surface-container-lowest shadow-[0_1px_4px_rgba(0,0,0,0.06)] elev-1 surface-raised">
      <div className="relative w-full aspect-[4/3] bg-surface-container overflow-hidden">
        {stats.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={stats.thumbnail_url} alt={stats.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-secondary/10 to-secondary/5 flex items-center justify-center">
            <span className="text-headline-lg font-black text-secondary/30">
              {stats.title.charAt(0)}
            </span>
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-success flex items-center justify-center shadow">
          <Check size={11} className="text-white" strokeWidth={3} />
        </div>
      </div>
      <div className="p-2 flex flex-col gap-0.5">
        <p className="text-label-sm font-bold text-on-surface leading-tight line-clamp-2">{stats.title}</p>
        <p className="text-label-sm text-on-surface-variant">
          Day {stats.current_day}{stats.duration_days ? `/${stats.duration_days}` : ""}
          {stats.consistency_pct >= 90 ? " · On fire" : ""}
        </p>
        <p className="text-label-sm font-bold text-secondary">{stats.consistency_pct}% Consistency</p>
      </div>
    </div>
  );
}

// ── Follow List Modal ──────────────────────────────────────────────────────
function FollowModal({
  title, userId, fetchFn, onClose,
}: {
  title: string;
  userId: string;
  fetchFn: (uid: string, page: number) => Promise<FollowerUser[]>;
  onClose: () => void;
}) {
  const PAGE = 20;
  const [users, setUsers] = useState<FollowerUser[]>([]);
  const [page, setPage]   = useState(0);
  const [busy, setBusy]   = useState(true);
  const [more, setMore]   = useState(true);

  // Appends a page. Only ever called from the "Load more" click handler, which
  // owns the `busy` flag — keeping setState out of the effect below.
  const load = useCallback(async (pg: number) => {
    const data = await fetchFn(userId, pg);
    setUsers(prev => pg === 0 ? data : [...prev, ...data]);
    setMore(data.length === PAGE);
    setBusy(false);
  }, [userId, fetchFn]);

  // The first page is fetched inline rather than through `load`, so every state
  // write provably happens after an await. Calling an async helper that writes
  // state trips react-hooks/set-state-in-effect, which cannot see past the
  // async boundary. The cancelled flag also drops a stale response if the modal
  // is reopened for a different user mid-flight.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchFn(userId, 0);
      if (cancelled) return;
      setUsers(data);
      setMore(data.length === PAGE);
      setBusy(false);
    })();
    return () => { cancelled = true; };
  }, [userId, fetchFn]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl flex flex-col max-h-[80vh] elev-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant shrink-0">
          <h2 className="text-body-lg font-bold text-on-surface">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors tap-target">
            <X size={18} className="text-on-surface-variant" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5">
          {busy && users.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 size={22} className="animate-spin text-secondary" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center py-12 text-body-md text-on-surface-variant">No {title.toLowerCase()} yet.</p>
          ) : (
            <>
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-3 py-3 border-b border-outline-variant last:border-0">
                  <div className="w-10 h-10 rounded-full bg-secondary/8 overflow-hidden shrink-0 flex items-center justify-center border border-outline-variant">
                    {u.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-body-lg font-bold text-secondary">
                        {(u.full_name ?? u.username ?? "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-body-md font-semibold text-on-surface truncate">
                        {u.full_name ?? u.username ?? "Unknown"}
                      </p>
                      {u.verification_status === "approved" && (
                        <ShieldCheck size={13} className="text-secondary shrink-0" />
                      )}
                    </div>
                    {u.username && (
                      <p className="text-body-sm text-on-surface-variant">@{u.username}</p>
                    )}
                  </div>
                </div>
              ))}
              {more && (
                <div className="py-4 flex justify-center">
                  <button
                    onClick={() => { const next = page + 1; setPage(next); setBusy(true); load(next); }}
                    disabled={busy}
                    className="text-body-md text-secondary font-semibold disabled:opacity-40"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin inline" /> : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manage Challenges Modal ───────────────────────────────────────────────
function ManageModal({
  allStats, pinnedIds, onToggle, onClose,
}: {
  allStats: ChallengeStats[];
  pinnedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const active = allStats.filter(s => s.status === "active");
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl p-5 max-h-[80vh] overflow-y-auto elev-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-body-lg font-bold text-on-surface">Manage Challenges</h2>
            <p className="text-body-sm text-on-surface-variant mt-0.5">Pin up to 3 to display on your profile.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors tap-target">
            <X size={18} className="text-on-surface-variant" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {active.map(s => {
            const pinned = pinnedIds.includes(s.challenge_id);
            const atLimit = pinnedIds.length >= 3 && !pinned;
            return (
              <button
                key={s.challenge_id}
                onClick={() => { if (!atLimit) onToggle(s.challenge_id); }}
                disabled={atLimit}
                className={[
                  "flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                  pinned ? "border-secondary bg-secondary/5" : "border-outline-variant hover:bg-surface-container-low",
                  atLimit ? "opacity-40 cursor-not-allowed" : "",
                ].join(" ")}
              >
                <div className={[
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  pinned ? "bg-secondary border-secondary" : "border-outline",
                ].join(" ")}>
                  {pinned && <Check size={11} className="text-white" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-body-md font-semibold text-on-surface truncate">{s.title}</p>
                  <p className="text-label-sm text-on-surface-variant">
                    Day {s.current_day}{s.duration_days ? `/${s.duration_days}` : ""} · {s.consistency_pct}% consistency
                  </p>
                </div>
                {pinned && (
                  <span className="text-label-sm font-bold px-2 py-0.5 rounded-full bg-secondary/10 text-secondary shrink-0">
                    Pinned
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={onClose}
          className="w-full mt-4 h-11 rounded-xl bg-secondary text-white font-bold text-body-md elev-2"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── Main Profile Page ──────────────────────────────────────────────────────
export default function ProfilePage() {
  const router   = useRouter();
  const supabase = createClient();

  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [profile,   setProfile]   = useState<Profile | null>(null);
  const [links,     setLinks]     = useState<SocialLink[]>([]);
  const [userId,    setUserId]    = useState<string | null>(null);
  const [fCount,    setFCount]    = useState(0);
  const [fgCount,   setFgCount]   = useState(0);

  const [showFoll,    setShowFoll]    = useState(false);
  const [showFolg,    setShowFolg]    = useState(false);
  const [manageOpen,  setManageOpen]  = useState(false);

  const [allStats,    setAllStats]    = useState<ChallengeStats[]>([]);
  const [activeStats, setActiveStats] = useState<ChallengeStats[]>([]);
  const [pinnedIds,   setPinnedIds]   = useState<string[]>([]);
  const [achievements,setAchievements]= useState<ChallengeStats[]>([]);

  const [coinBalance, setCoinBalance] = useState<number | null>(null);

  const [heatId,      setHeatId]      = useState<string>(ALL_ACTIVITY);
  const [heatEntries, setHeatEntries] = useState<HeatmapEntry[]>([]);
  const [heatStreak,  setHeatStreak]  = useState(0);

  // Inline edit state
  const [editing,   setEditing]   = useState(false);
  const [fullName,  setFullName]  = useState("");
  const [username,  setUsername]  = useState("");
  const [bio,       setBio]       = useState("");
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);

  // Social link add form
  const [addingLink, setAddingLink] = useState(false);
  const [newPlat,    setNewPlat]    = useState<SocialPlatform>("instagram");
  const [newUrl,     setNewUrl]     = useState("");

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();

    // Coin balance is decoration on this screen: never let it fail the page.
    if (user) {
      const { data: bal } = await supabase.rpc("striv_coin_balance", { p_user_id: user.id });
      setCoinBalance((bal as number | null) ?? 0);
    }
    if (!user) { router.replace("/login"); return; }
    setUserId(user.id);

    const [p, sl, fC, fgC] = await Promise.all([
      getMyProfile(),
      getMySocialLinks(),
      getFollowerCount(user.id),
      getFollowingCount(user.id),
    ]);

    setProfile(p);
    setLinks(sl);
    setFullName(p?.full_name ?? "");
    setUsername(p?.username ?? "");
    setBio(p?.bio ?? "");
    setFCount(fC);
    setFgCount(fgC);

    // Challenge stats — may not exist if migration not run
    try {
      const { data: statsData } = await supabase
        .from("profile_challenge_stats")
        .select("challenge_id,title,duration_days,thumbnail_url,current_day,current_streak,consistency_pct,status,completed_at,joined_at")
        .eq("user_id", user.id);

      const stats = (statsData ?? []) as ChallengeStats[];
      setAllStats(stats);
      setAchievements(stats.filter(s => s.status === "completed"));

      const pinned: string[] = p?.pinned_challenge_ids ?? [];
      setPinnedIds(pinned);

      const active = pinned.length > 0
        ? pinned.map(id => stats.find(s => s.challenge_id === id)).filter(Boolean) as ChallengeStats[]
        : stats.filter(s => s.status === "active").slice(0, 3);
      setActiveStats(active);

      // Default to every kind of proof. Scoping to the first active challenge
      // meant someone whose activity is all quests saw an empty grid, and
      // someone with no active challenge saw no grid at all.
      setHeatStreak(stats.find(s => s.status === "active")?.current_streak ?? 0);
      const { data: hmData, error: hmError } = await supabase
        .from("profile_activity_heatmap")
        .select("submission_date,submission_count")
        .eq("user_id", user.id);
      // supabase-js reports query failures in `error`, not by throwing, so a
      // discarded error here rendered as a confident "0 proofs" — the grid
      // could not tell "you posted nothing" from "the query failed". Log it
      // and leave the grid empty rather than claim a number we do not have.
      if (hmError) console.error("heatmap query failed", hmError);
      setHeatEntries((hmData ?? []) as HeatmapEntry[]);
    } catch (err) {
      // Views not yet created — stats and heatmap stay empty, but say so.
      console.error("profile stats/heatmap load failed", err);
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
    try {
      // Two different views: the combined one spans challenges and quests and
      // has no challenge_id, the per-challenge one is scoped to a single run.
      const query = cid === ALL_ACTIVITY
        ? supabase
            .from("profile_activity_heatmap")
            .select("submission_date,submission_count")
            .eq("user_id", user.id)
        : supabase
            .from("profile_heatmap")
            .select("submission_date,submission_count")
            .eq("user_id", user.id)
            .eq("challenge_id", cid);
      const { data, error } = await query;
      if (error) console.error("heatmap query failed", error);
      setHeatEntries((data ?? []) as HeatmapEntry[]);
    } catch (err) { console.error("heatmap switch failed", err); }
    setHeatStreak(allStats.find(s => s.challenge_id === cid)?.current_streak ?? 0);
  };

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await upsertMyProfile({
        full_name: fullName.trim() || undefined,
        bio:       bio.trim() || undefined,
        username:  username.trim() || undefined,
      });
      await loadAll();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save changes. Please try again.");
    } finally { setSaving(false); }
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const url = await uploadMyAvatar(file);
      setProfile(p => p ? { ...p, avatar_url: url } : p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); e.target.value = ""; }
  };

  const togglePin = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const next = pinnedIds.includes(id)
      ? pinnedIds.filter(p => p !== id)
      : pinnedIds.length >= 3 ? pinnedIds : [...pinnedIds, id];
    setPinnedIds(next);
    try {
      await supabase.from("profiles")
        .update({ pinned_challenge_ids: next })
        .eq("id", user.id);
    } catch { /* column not yet ready */ }
    const active = next.length > 0
      ? next.map(pid => allStats.find(s => s.challenge_id === pid)).filter(Boolean) as ChallengeStats[]
      : allStats.filter(s => s.status === "active").slice(0, 3);
    setActiveStats(active);
  };

  const handleAddLink = async () => {
    if (!newUrl.trim()) return;
    try {
      const l = await addMySocialLink(newPlat, newUrl.trim());
      setLinks(prev => [...prev, l]);
      setNewUrl(""); setAddingLink(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to add link"); }
  };

  const handleDelLink = async (id: string) => {
    try {
      await deleteMySocialLink(id);
      setLinks(prev => prev.filter(l => l.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to remove link"); }
  };

  const fmtN = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-surface pb-28">
      <div className="flex items-center justify-between px-5 py-3.5 bg-surface-container-lowest border-b border-outline-variant">
        <Sk className="h-5 w-24" />
        <div className="flex gap-2"><Sk className="w-9 h-9 rounded-xl" /><Sk className="w-9 h-9 rounded-xl" /></div>
      </div>
      <div className="mx-auto measure-page px-4 py-4 flex flex-col gap-3">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 flex flex-col gap-4 elev-1 surface-raised">
          <div className="flex gap-4">
            <Sk className="w-[76px] h-[76px] rounded-full shrink-0" />
            <div className="flex-1 flex flex-col gap-2 pt-1">
              <Sk className="h-5 w-36" /><Sk className="h-4 w-24" /><Sk className="h-4 w-48" />
            </div>
          </div>
          <div className="flex gap-6 pt-3 border-t border-outline-variant">
            <Sk className="h-10 w-20" /><Sk className="h-10 w-20" />
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 elev-1 surface-raised">
          <Sk className="h-4 w-40 mb-3" />
          <div className="grid grid-cols-3 gap-2">
            <Sk className="aspect-[4/3] rounded-xl" />
            <Sk className="aspect-[4/3] rounded-xl" />
            <Sk className="aspect-[4/3] rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );

  const displayName = profile?.full_name || "Your Name";
  const isVerified  = profile?.verification_status === "approved";

  return (
    <div className="min-h-screen bg-surface pb-28">

      {/* ── Sticky header ───────────────────────────────────────────────── */}
      <div className="sticky top-0 pt-safe z-30 bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant">
        <div className="mx-auto measure-page flex items-center justify-between px-5 py-3.5">
          <h1 className="text-body-lg font-bold text-on-surface tracking-[-0.01em]">My Profile</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(v => !v)}
              aria-label="Edit profile"
              className="w-9 h-9 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-center hover:bg-surface-container-high transition-colors tap-target"
            >
              <Edit2 size={15} className="text-on-surface-variant" />
            </button>
            <button
              onClick={() => router.push("/settings")}
              aria-label="Settings"
              className="w-9 h-9 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-center hover:bg-surface-container-high transition-colors tap-target"
            >
              <Settings size={15} className="text-on-surface-variant" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-auto measure-page px-4 mt-3">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-error-container border border-error/20">
            <p className="text-body-md text-error flex-1">{error}</p>
            <button onClick={() => setError(null)}>
              <X size={14} className="text-error" />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto measure-page px-4 py-4 flex flex-col gap-3">

        {/* ── Profile card ─────────────────────────────────────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden elev-1 surface-raised">
          <div className="px-4 pt-5 pb-4">

            {/* Avatar + name */}
            <div className="flex items-start gap-3.5">
              <label className="relative cursor-pointer shrink-0">
                <div className={[
                  "w-[76px] h-[76px] rounded-full overflow-hidden border-2 border-outline-variant bg-secondary/8",
                  uploading ? "opacity-60" : "",
                ].join(" ")}>
                  {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-headline-lg font-black text-secondary">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 right-0 w-[22px] h-[22px] rounded-full bg-secondary border-2 border-white flex items-center justify-center elev-2">
                  {uploading
                    ? <Loader2 size={10} className="text-white animate-spin" />
                    : <Camera size={10} className="text-white" />
                  }
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleAvatar}
                  disabled={uploading}
                />
              </label>

              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-body-lg font-bold text-on-surface tracking-[-0.01em] truncate">
                    {displayName}
                  </h2>
                  {isVerified && (
                    <ShieldCheck size={15} className="text-secondary shrink-0" aria-label="Verified" />
                  )}
                </div>
                {profile?.username && (
                  <p className="text-body-md text-on-surface-variant">@{profile.username}</p>
                )}
                {!editing && profile?.bio && (
                  <p className="text-body-md text-on-surface mt-1.5 leading-snug">{profile.bio}</p>
                )}
                {!editing && !profile?.bio && (
                  <button
                    onClick={() => setEditing(true)}
                    className="mt-1.5 text-body-sm text-secondary font-medium hover:underline"
                  >
                    + Add bio
                  </button>
                )}
                {!editing && (
                  <button
                    onClick={() => router.push("/settings/edit-profile")}
                    className="mt-2.5 px-3.5 py-1.5 rounded-xl border border-outline-variant text-body-sm font-semibold text-on-surface bg-surface-container hover:bg-surface-container-high transition-colors tap-target"
                  >
                    Edit Profile
                  </button>
                )}
              </div>
            </div>

            {/* Followers / Following */}
            <div className="flex items-center gap-5 mt-4 pt-3.5 border-t border-outline-variant">
              <button onClick={() => setShowFoll(true)} className="flex flex-col items-center group">
                <span className="text-headline-md font-bold text-on-surface tabular-nums tracking-tight">
                  {fmtN(fCount)}
                </span>
                <span className="text-label-sm text-on-surface-variant font-medium group-hover:text-secondary transition-colors">
                  Followers
                </span>
              </button>
              <div className="w-px h-7 bg-outline-variant" />
              <button onClick={() => setShowFolg(true)} className="flex flex-col items-center group">
                <span className="text-headline-md font-bold text-on-surface tabular-nums tracking-tight">
                  {fmtN(fgCount)}
                </span>
                <span className="text-label-sm text-on-surface-variant font-medium group-hover:text-secondary transition-colors">
                  Following
                </span>
              </button>
              {coinBalance !== null && (
                <>
                  <div className="w-px h-7 bg-outline-variant" />
                  <button
                    onClick={() => router.push("/coins")}
                    className="flex flex-col items-center group"
                    aria-label={`${coinBalance} StrivCoins. Open your wallet.`}
                  >
                    <span className="flex items-center gap-1 text-[20px] font-bold text-on-surface tabular-nums tracking-tight">
                      <Coins size={15} className="text-on-tertiary-container" aria-hidden="true" />
                      {fmtN(coinBalance)}
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-medium group-hover:text-secondary transition-colors">
                      StrivCoins
                    </span>
                  </button>
                </>
              )}
            </div>

            {/* Social links pills */}
            {links.length > 0 && !editing && (
              <div className="flex flex-wrap gap-2 mt-3">
                {/* Icon only. The pills used to carry the platform name AND a
                    truncated URL, which read as "LINKEDIN linkedin.co…" — two
                    labels for one link, neither of them useful. The mark is
                    the recognisable part; the name lives in the accessible
                    label for anyone who cannot see it. */}
                {links.map(link => {
                  const name = PLATFORM_NAME[link.platform] ?? link.platform;
                  return (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={name}
                      aria-label={`${name} (opens in a new tab)`}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant bg-surface-container text-on-surface-variant transition-all duration-150 hover:border-secondary hover:bg-secondary/10 hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1 tap-target"
                    >
                      <SocialIcon platform={link.platform} size={15} />
                    </a>
                  );
                })}
              </div>
            )}
            {links.length === 0 && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="mt-3 flex items-center gap-1.5 text-body-sm text-on-surface-variant hover:text-secondary transition-colors"
              >
                <Plus size={13} /> Add social links
              </button>
            )}
          </div>

          {/* Inline edit form */}
          {editing && (
            <div className="border-t border-outline-variant px-4 py-4 bg-surface-container-low flex flex-col gap-3">
              <p className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-[0.08em]">
                Editing Profile
              </p>

              <div className="flex flex-col gap-1">
                <label className="text-label-sm font-medium text-on-surface-variant">Full Name</label>
                <input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  maxLength={80}
                  className="w-full h-10 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:border-secondary tap-target"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-label-sm font-medium text-on-surface-variant">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-body-md">@</span>
                  <input
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                    maxLength={30}
                    className="w-full h-10 rounded-xl border border-outline-variant bg-surface-container-lowest pl-7 pr-3 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:border-secondary tap-target"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <label className="text-label-sm font-medium text-on-surface-variant">Bio</label>
                  <span className="text-label-sm text-on-surface-variant">{bio.length}/150</span>
                </div>
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  maxLength={150}
                  rows={3}
                  className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:border-secondary resize-none"
                />
              </div>

              {/* Social links in edit mode */}
              <div className="flex flex-col gap-2">
                <p className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-[0.08em]">Social Links</p>
                {links.map(link => {
                  const label = PLATFORM_LABEL[link.platform] ?? link.platform;
                  return (
                    <div key={link.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-outline-variant bg-surface-container-lowest elev-1 surface-raised">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
                        <SocialIcon platform={link.platform} size={14} />
                      </span>
                      <span className="sr-only">{label}</span>
                      <span className="flex-1 text-body-sm text-on-surface truncate">{link.url}</span>
                      <button onClick={() => handleDelLink(link.id)} className="text-on-surface-variant hover:text-error transition-colors shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
                {!addingLink && links.length < PROFILE_CONSTANTS.MAX_SOCIAL_LINKS && (
                  <button onClick={() => setAddingLink(true)} className="flex items-center gap-1.5 text-body-md text-secondary font-semibold">
                    <Plus size={14} /> Add Social Link
                  </button>
                )}
                {addingLink && (
                  <div className="flex flex-col gap-2">
                    <select
                      value={newPlat}
                      onChange={e => setNewPlat(e.target.value as SocialPlatform)}
                      className="h-9 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface focus:outline-none tap-target"
                    >
                      {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <input
                        value={newUrl}
                        onChange={e => setNewUrl(e.target.value)}
                        placeholder="https://…"
                        className="flex-1 h-9 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:border-secondary tap-target"
                      />
                      <button onClick={handleAddLink} disabled={!newUrl.trim()} className="px-3 h-9 rounded-xl bg-secondary text-white text-body-md font-semibold disabled:opacity-40 tap-target">Add</button>
                      <button onClick={() => { setAddingLink(false); setNewUrl(""); }} className="px-3 h-9 rounded-xl border border-outline-variant text-on-surface text-body-md tap-target">✕</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 h-10 rounded-xl bg-secondary text-white font-bold text-body-md flex items-center justify-center gap-1.5 disabled:opacity-50 elev-2 tap-target"
                >
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save Changes"}
                </button>
                <button onClick={() => setEditing(false)} className="flex-1 h-10 rounded-xl border border-outline-variant text-on-surface font-semibold text-body-md tap-target">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── My Active Challenges ─────────────────────────────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 elev-1 surface-raised">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-body-lg font-bold text-on-surface tracking-[-0.01em]">
              My Active Challenges
              {activeStats.length > 0 && (
                <span className="text-on-surface-variant font-normal ml-1">({activeStats.length})</span>
              )}
            </h3>
            {allStats.filter(s => s.status === "active").length > 0 && (
              <button onClick={() => setManageOpen(true)} className="text-body-md text-secondary font-bold hover:opacity-75 transition-opacity">
                Manage
              </button>
            )}
          </div>

          {activeStats.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {activeStats.map(s => <ChallengeCard key={s.challenge_id} stats={s} />)}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5 py-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center">
                <Flame size={22} className="text-on-surface-variant" />
              </div>
              <p className="text-body-md font-semibold text-on-surface">No active challenges yet.</p>
              <p className="text-body-sm text-on-surface-variant max-w-[200px]">
                Join a challenge to start tracking your progress here.
              </p>
              <button
                onClick={() => router.push("/explore")}
                className="mt-1 px-5 py-2 rounded-xl bg-secondary text-white text-body-md font-bold elev-2 tap-target"
              >
                Explore Challenges
              </button>
            </div>
          )}
        </div>

        {/* ── Consistency Heatmap ────────────────────────────────────────── */}
        {/* id is the landing target for the streak pill in the feed header;
            scroll-mt clears the sticky header so the card is not hidden. */}
        {/* Always rendered. It used to be gated on having an active challenge,
            which hid the grid entirely from anyone whose activity is quests. */}
        <div id="consistency" className="scroll-mt-20 bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 elev-1 surface-raised">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-body-lg font-bold text-on-surface tracking-[-0.01em]">Consistency</h3>
            <select
              aria-label="Heatmap source"
              value={heatId}
              onChange={e => switchHeatmap(e.target.value)}
              className="text-label-sm font-medium text-on-surface bg-surface-container border border-outline-variant rounded-xl px-2 py-1.5 focus:outline-none max-w-[150px] truncate tap-target"
            >
              <option value={ALL_ACTIVITY}>All activity</option>
              {allStats.filter(s => s.status === "active").map(s => (
                <option key={s.challenge_id} value={s.challenge_id}>
                  {s.title.length > 22 ? s.title.slice(0, 22) + "…" : s.title}
                </option>
              ))}
            </select>
          </div>
          <ActivityHeatmap
            days={heatEntries.map(e => ({ date: e.submission_date, count: e.submission_count }))}
            label={heatId === ALL_ACTIVITY ? "Your activity over the last six months" : "Challenge activity over the last six months"}
            period="the last 6 months"
            actions={
              heatId !== ALL_ACTIVITY && heatStreak > 0 ? (
                <span className="text-label-sm font-semibold text-secondary">
                  {heatStreak}-day streak
                </span>
              ) : null
            }
          />
        </div>

        {/* ── Achievements ─────────────────────────────────────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 elev-1 surface-raised">
          <h3 className="text-body-lg font-bold text-on-surface tracking-[-0.01em] mb-3">Achievements</h3>
          {achievements.length > 0 ? (
            <div>
              {achievements.map((a, i) => {
                const BG = ["bg-warning-container","bg-secondary-fixed","bg-chart-3/10","bg-warning-container","bg-success-container","bg-error-container","bg-chart-2/10","bg-chart-2/10"];
                const FG = ["text-on-warning-container","text-secondary","text-chart-3","text-on-warning-container","text-on-success-container","text-on-error-container","text-chart-2","text-chart-2"];
                const idx = i % BG.length;
                return (
                  <div key={a.challenge_id} className="flex items-center gap-3 py-3 border-b border-outline-variant last:border-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${BG[idx]}`}>
                      <span className={`text-body-md font-black ${FG[idx]}`}>{a.title.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-md font-semibold text-on-surface truncate">{a.title}</p>
                      <p className="text-label-sm text-on-surface-variant">
                        Completed{a.completed_at
                          ? ` · ${new Date(a.completed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-label-sm font-bold px-2 py-0.5 rounded-full bg-success-container text-on-success-container border border-success-outline">
                        Completed
                      </span>
                      <ChevronRight size={14} className="text-outline" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5 py-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center">
                <ChevronRight size={20} className="text-on-surface-variant" />
              </div>
              <p className="text-body-md text-on-surface-variant max-w-[220px] leading-relaxed">
                Your achievements will appear here as you complete challenges and quests.
              </p>
              <button
                onClick={() => router.push("/explore")}
                className="mt-1 px-4 py-2 rounded-xl border border-outline-variant text-on-surface text-body-md font-semibold hover:bg-surface-container transition-colors tap-target"
              >
                Start a Challenge
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {manageOpen && (
        <ManageModal
          allStats={allStats}
          pinnedIds={pinnedIds}
          onToggle={togglePin}
          onClose={() => setManageOpen(false)}
        />
      )}
      {showFoll && userId && (
        <FollowModal title="Followers" userId={userId} fetchFn={getFollowers} onClose={() => setShowFoll(false)} />
      )}
      {showFolg && userId && (
        <FollowModal title="Following" userId={userId} fetchFn={getFollowing} onClose={() => setShowFolg(false)} />
      )}
    </div>
  );
}
