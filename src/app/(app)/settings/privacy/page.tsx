"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Globe, Lock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyProfile, upsertMyProfile, type Profile } from "@/lib/supabase/profile";

export default function PrivacyPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const p = await getMyProfile();
      setProfile(p);
      setLoading(false);
    })();
  }, [supabase, router]);

  const toggle = async () => {
    if (!profile) return;
    setSaving(true); setError(null);
    const next = !profile.is_private;
    try {
      await upsertMyProfile({ is_private: next });
      setProfile(p => p ? { ...p, is_private: next } : p);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save. Try again."); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-7 h-7 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  const isPrivate = profile?.is_private ?? false;

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      <div className="sticky top-0 z-30 flex items-center gap-3 px-5 py-4 bg-white border-b border-outline-variant">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={20} />
        </button>
        <h1 className="type-headline-sm text-on-surface font-bold">Account Privacy</h1>
      </div>

      <div className="max-w-lg mx-auto px-5 py-5 flex flex-col gap-4">
        {error && (
          <div className="px-4 py-3 rounded-xl bg-error-container border border-error/20">
            <p className="type-body-md text-error">{error}</p>
          </div>
        )}

        {/* Toggle card */}
        <div className="bg-white rounded-2xl border border-outline-variant p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPrivate ? "bg-secondary/10" : "bg-surface-container"}`}>
              {isPrivate ? <Lock size={18} className="text-secondary" /> : <Globe size={18} className="text-on-surface-variant" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="type-body-md font-bold text-on-surface">
                {isPrivate ? "Private Account" : "Public Account"}
              </p>
              <p className="text-[12px] text-on-surface-variant leading-snug mt-0.5">
                {isPrivate
                  ? "Only approved followers can see your profile, challenges, and activity."
                  : "Anyone can discover and view your public profile."}
              </p>
            </div>
            {/* Toggle switch */}
            <button onClick={toggle} disabled={saving}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 ${isPrivate ? "bg-secondary" : "bg-outline-variant"} disabled:opacity-50`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${isPrivate ? "translate-x-6" : "translate-x-0.5"}`} />
              {saving && <Loader2 size={12} className="absolute inset-0 m-auto text-white animate-spin" />}
            </button>
          </div>
        </div>

        {/* Info card when private */}
        {isPrivate && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <div className="flex items-start gap-2.5 mb-2">
              <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-white text-[10px] font-bold">i</span>
              </div>
              <p className="type-body-md font-semibold text-secondary">When your account is private:</p>
            </div>
            <ul className="space-y-1.5 ml-7">
              {[
                "Only your followers can see your profile",
                "You control who can follow you",
                "Your challenges and activity are hidden from non-followers",
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-secondary mt-0.5 shrink-0">•</span>
                  <span className="text-[13px] text-on-surface">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Info card when public */}
        {!isPrivate && (
          <div className="bg-surface-container rounded-2xl border border-outline-variant p-4">
            <p className="type-body-md font-semibold text-on-surface mb-2">Public Account</p>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">
              Your profile, challenges, and achievements are visible to everyone on STRIVUP. Anyone can follow you and see your activity.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
