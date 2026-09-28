"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserCheck, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface UserRow {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  verification_status: string;
}

export default function FollowersPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState<UserRow[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [following, setFollowing] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setMyId(user.id);

      // Get followers
      const { data: followerRows } = await supabase
        .from("followers")
        .select("follower_id, profiles!follower_id(id, full_name, username, avatar_url, verification_status)")
        .eq("followed_id", user.id)
        .eq("request_status", "accepted")
        .order("created_at", { ascending: false })
        .limit(100);

      const followerList = (followerRows ?? []).map((r: { profiles: UserRow | UserRow[] }) =>
        Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      ).filter(Boolean) as UserRow[];
      setFollowers(followerList);

      // Get who I follow
      const { data: followingRows } = await supabase
        .from("followers")
        .select("followed_id")
        .eq("follower_id", user.id)
        .eq("request_status", "accepted");
      setFollowing(new Set((followingRows ?? []).map((r: { followed_id: string }) => r.followed_id)));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFollow = async (targetId: string) => {
    if (!myId) return;
    const isFollowing = following.has(targetId);
    if (isFollowing) {
      await supabase.from("followers").delete().eq("follower_id", myId).eq("followed_id", targetId);
      setFollowing(prev => { const n = new Set(prev); n.delete(targetId); return n; });
    } else {
      await supabase.from("followers").upsert({ follower_id: myId, followed_id: targetId, request_status: "accepted" });
      setFollowing(prev => new Set([...prev, targetId]));
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-28">
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-5 py-3.5">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
            <ArrowLeft size={19} className="text-on-surface" />
          </button>
          <h1 className="text-[17px] font-bold text-on-surface flex-1">Followers</h1>
          <span className="text-sm font-bold text-secondary">{followers.length}</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-4">
        {followers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <UserPlus size={36} className="text-on-surface-variant opacity-30" />
            <p className="text-sm text-on-surface-variant">No followers yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden divide-y divide-outline-variant/40">
            {followers.map(user => (
              <div key={user.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-11 h-11 rounded-full bg-secondary/10 overflow-hidden shrink-0 flex items-center justify-center">
                  {user.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={user.avatar_url} alt={user.full_name ?? ""} className="w-full h-full object-cover" />
                    : <span className="font-bold text-secondary text-base">{(user.full_name ?? user.username ?? "?").charAt(0).toUpperCase()}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-on-surface truncate">{user.full_name ?? user.username ?? "Unknown"}</p>
                    {user.verification_status === "verified" && (
                      <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="9" fill="#3B82F6"/><path d="M5 9l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                  </div>
                  {user.username && <p className="text-xs text-on-surface-variant">@{user.username}</p>}
                </div>
                {user.id !== myId && (
                  <button onClick={() => handleFollow(user.id)}
                    className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
                      following.has(user.id)
                        ? "bg-surface-container border border-outline-variant text-on-surface-variant"
                        : "bg-secondary text-on-secondary"
                    }`}>
                    {following.has(user.id) ? <><UserCheck size={13} />Following</> : <><UserPlus size={13} />Follow</>}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
