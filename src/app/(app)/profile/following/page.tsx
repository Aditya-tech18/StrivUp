"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserCheck, UserMinus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface UserRow {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  verification_status: string;
}

export default function FollowingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState<UserRow[]>([]);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setMyId(user.id);
      const { data } = await supabase
        .from("followers")
        .select("followed_id, profiles!followed_id(id, full_name, username, avatar_url, verification_status)")
        .eq("follower_id", user.id)
        .eq("request_status", "accepted")
        .order("created_at", { ascending: false })
        .limit(100);
      const list = (data ?? []).map((r: { profiles: UserRow | UserRow[] }) =>
        Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      ).filter(Boolean) as UserRow[];
      setFollowing(list);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUnfollow = async (targetId: string) => {
    if (!myId) return;
    await supabase.from("followers").delete().eq("follower_id", myId).eq("followed_id", targetId);
    setFollowing(prev => prev.filter(u => u.id !== targetId));
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
          <h1 className="text-[17px] font-bold text-on-surface flex-1">Following</h1>
          <span className="text-sm font-bold text-secondary">{following.length}</span>
        </div>
      </div>
      <div className="max-w-lg mx-auto px-5 pt-4">
        {following.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="text-sm text-on-surface-variant">Not following anyone yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden divide-y divide-outline-variant/40">
            {following.map(user => (
              <div key={user.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-11 h-11 rounded-full bg-secondary/10 overflow-hidden shrink-0 flex items-center justify-center">
                  {user.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
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
                <button onClick={() => handleUnfollow(user.id)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-surface-container border border-outline-variant text-on-surface-variant hover:text-error hover:border-error/30 transition-colors">
                  <UserCheck size={13} /> Following
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
