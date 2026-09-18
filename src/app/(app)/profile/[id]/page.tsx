"use client";
/**
 * /profile/[id] — Public user profile.
 * Shows: avatar, name, bio, stats (following/followers/challenges/quests),
 * follow/unfollow button, active challenges, achievements.
 */
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface PublicProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  verification_status: string | null;
  account_type: string | null;
  is_private: boolean;
  created_at: string;
}

interface ProfileStats {
  followers: number;
  following: number;
  challenges: number;
  quests: number;
}

interface ActiveChallenge {
  id: string;
  title: string;
  thumbnail_url: string | null;
  current_day: number;
  duration_days: number | null;
}

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: profileId } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState<ProfileStats>({ followers: 0, following: 0, challenges: 0, quests: 0 });
  const [activeChallenges, setActiveChallenges] = useState<ActiveChallenge[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [requestPending, setRequestPending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMyId(user?.id ?? null);
      if (user?.id === profileId) {
        setIsOwnProfile(true);
        router.replace("/profile");
        return;
      }

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id,full_name,username,avatar_url,bio,verification_status,account_type,is_private,created_at")
        .eq("id", profileId)
        .maybeSingle();

      if (!profileData) { setLoading(false); return; }
      setProfile(profileData as PublicProfile);

      // Fetch stats in parallel
      const [followersRes, followingRes, challengesRes, questsRes, followRes] = await Promise.all([
        supabase.from("followers").select("id", { count: "exact", head: true }).eq("followed_id", profileId).eq("request_status", "accepted"),
        supabase.from("followers").select("id", { count: "exact", head: true }).eq("follower_id", profileId).eq("request_status", "accepted"),
        supabase.from("challenge_participants").select("id", { count: "exact", head: true }).eq("user_id", profileId),
        supabase.from("quest_participants").select("id", { count: "exact", head: true }).eq("user_id", profileId),
        user ? supabase.from("followers").select("request_status").eq("follower_id", user.id).eq("followed_id", profileId).maybeSingle() : Promise.resolve({ data: null }),
      ]);

      setStats({
        followers: followersRes.count ?? 0,
        following: followingRes.count ?? 0,
        challenges: challengesRes.count ?? 0,
        quests: questsRes.count ?? 0,
      });

      if (followRes.data) {
        setIsFollowing((followRes.data as { request_status: string }).request_status === "accepted");
        setRequestPending((followRes.data as { request_status: string }).request_status === "pending");
      }

      // Fetch active challenges (only if public or following)
      const canSee = !(profileData as PublicProfile).is_private || followRes.data;
      if (canSee) {
        const { data: cp } = await supabase
          .from("challenge_participants")
          .select("challenge_id, joined_at, challenges!challenge_id(id,title,thumbnail_url,duration_days)")
          .eq("user_id", profileId)
          .eq("status", "active")
          .limit(3);

        const challenges: ActiveChallenge[] = (cp ?? []).map((row: {
          challenge_id: string;
          joined_at: string;
          challenges: { id: string; title: string; thumbnail_url: string | null; duration_days: number | null } | { id: string; title: string; thumbnail_url: string | null; duration_days: number | null }[];
        }) => {
          const ch = Array.isArray(row.challenges) ? row.challenges[0] : row.challenges;
          const daysSince = Math.floor((Date.now() - new Date(row.joined_at).getTime()) / 86400000) + 1;
          return { id: ch.id, title: ch.title, thumbnail_url: ch.thumbnail_url, current_day: daysSince, duration_days: ch.duration_days };
        });
        setActiveChallenges(challenges);
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const handleFollow = async () => {
    if (!myId) { router.push("/login"); return; }
    setFollowLoading(true);

    if (isFollowing || requestPending) {
      // Unfollow / cancel request
      await supabase.from("followers").delete().eq("follower_id", myId).eq("followed_id", profileId);
      setIsFollowing(false);
      setRequestPending(false);
      setStats(prev => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
    } else {
      const status = profile?.is_private ? "pending" : "accepted";
      await supabase.from("followers").upsert(
        { follower_id: myId, followed_id: profileId, request_status: status },
        { onConflict: "follower_id,followed_id" }
      );
      if (status === "accepted") {
        setIsFollowing(true);
        setStats(prev => ({ ...prev, followers: prev.followers + 1 }));
      } else {
        setRequestPending(true);
      }
    }
    setFollowLoading(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] gap-4">
      <p className="text-on-surface-variant text-sm">User not found.</p>
      <button onClick={() => router.back()} className="text-secondary text-sm font-semibold">Go back</button>
    </div>
  );

  const isVerified = profile.verification_status === "verified";
  const displayName = profile.full_name || profile.username || "User";
  const canViewContent = !profile.is_private || isFollowing;

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-28">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-5 py-3.5">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
            <ArrowLeft size={19} className="text-on-surface" />
          </button>
          <h1 className="text-[17px] font-bold text-on-surface flex-1 truncate">
            {displayName}
          </h1>
          {profile.is_private && (
            <span className="text-xs text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-full border border-outline-variant">
              🔒 Private
            </span>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-5 flex flex-col gap-4">
        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-outline-variant bg-surface-container shrink-0 flex items-center justify-center">
                {profile.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                  : <span className="text-3xl font-black text-secondary">{displayName.charAt(0).toUpperCase()}</span>
                }
              </div>

              {/* Name + info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <h2 className="text-[18px] font-black text-on-surface">{displayName}</h2>
                  {isVerified && <ShieldCheck size={17} className="text-secondary shrink-0" />}
                </div>
                {profile.username && <p className="text-sm text-on-surface-variant mb-1">@{profile.username}</p>}
                {profile.bio && <p className="text-sm text-on-surface leading-snug line-clamp-2">{profile.bio}</p>}
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center justify-around mt-4 pt-4 border-t border-outline-variant/50">
              {[
                { label: "Followers", value: stats.followers },
                { label: "Following", value: stats.following },
                { label: "Challenges", value: stats.challenges },
                { label: "Quests", value: stats.quests },
              ].map(s => (
                <div key={s.label} className="flex flex-col items-center">
                  <span className="text-[17px] font-black text-on-surface">{s.value}</span>
                  <span className="text-[10px] text-on-surface-variant font-medium">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Follow button */}
            {myId && myId !== profileId && (
              <button
                onClick={handleFollow}
                disabled={followLoading}
                className={[
                  "mt-4 w-full h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
                  isFollowing
                    ? "bg-surface-container border border-outline-variant text-on-surface-variant hover:border-error hover:text-error"
                    : requestPending
                    ? "bg-surface-container border border-outline-variant text-on-surface-variant"
                    : "bg-secondary text-on-secondary hover:opacity-90",
                  followLoading ? "opacity-50 cursor-not-allowed" : "",
                ].join(" ")}
              >
                {followLoading
                  ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : isFollowing
                  ? <><UserMinus size={15} /> Unfollow</>
                  : requestPending
                  ? <><UserCheck size={15} /> Requested</>
                  : <><UserPlus size={15} /> Follow</>
                }
              </button>
            )}
          </div>
        </div>

        {/* Private account locked state */}
        {profile.is_private && !isFollowing && !isOwnProfile && (
          <div className="bg-white rounded-2xl border border-outline-variant p-8 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center">
              <span className="text-3xl">🔒</span>
            </div>
            <p className="text-[15px] font-bold text-on-surface">This account is private</p>
            <p className="text-sm text-on-surface-variant">
              Follow {displayName} to see their challenges and progress.
            </p>
          </div>
        )}

        {/* Active Challenges — only if public or following */}
        {canViewContent && activeChallenges.length > 0 && (
          <div className="bg-white rounded-2xl border border-outline-variant p-4">
            <h3 className="text-sm font-bold text-on-surface mb-3">Active Challenges</h3>
            <div className="grid grid-cols-3 gap-2">
              {activeChallenges.map(ch => (
                <Link key={ch.id} href={`/challenges/${ch.id}`}>
                  <div className="rounded-xl overflow-hidden border border-outline-variant/50">
                    <div className="w-full aspect-[4/3] bg-surface-container relative overflow-hidden">
                      {ch.thumbnail_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={ch.thumbnail_url} alt={ch.title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-2xl">🏆</div>
                      }
                    </div>
                    <div className="p-2">
                      <p className="text-[10px] font-bold text-on-surface line-clamp-1">{ch.title}</p>
                      <p className="text-[9px] text-on-surface-variant">
                        Day {ch.current_day}{ch.duration_days ? `/${ch.duration_days}` : ""}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
