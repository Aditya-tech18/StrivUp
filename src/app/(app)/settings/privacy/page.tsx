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
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/login"); return; }
        setProfile(await getMyProfile());
      } catch { setError("Failed to load settings"); }
      finally { setLoading(false); }
    })();
  }, []);

  const toggle = async () => {
    if (!profile) return;
    setSaving(true); setError(null);
    const next = !profile.is_private;
    try {
      await upsertMyProfile({ is_private: next });
      setProfile(p => p ? { ...p, is_private: next } : p);
    } catch { setError("Couldn't save. Please try again."); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  const isPrivate = profile?.is_private ?? false;

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-28">
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-5 py-3.5">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors">
            <ArrowLeft size={19} className="text-on-surface" />
          </button>
          <h1 className="text-[17px] font-bold text-on-surface tracking-[-0.01em]">Account Privacy</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-5 flex flex-col gap-4">
        {error && (
          <div className="px-4 py-3 rounded-xl bg-error-container border border-error/20">
            <p className="text-[13px] text-error">{error}</p>
          </div>
        )}

        {/* Toggle row */}
        <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
          <div className="flex items-center gap-3.5">
            <div className={[
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
              isPrivate ? "bg-secondary/10" : "bg-surface-container",
            ].join(" ")}>
              {isPrivate
                ? <Lock size={18} className="text-secondary" />
                : <Globe size={18} className="text-on-surface-variant" />}
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-on-surface">
                {isPrivate ? "Private Account" : "Public Account"}
              </p>
              <p className="text-[12px] text-on-surface-variant mt-0.5 leading-snug">
                {isPrivate
                  ? "Only approved followers can see your content"
                  : "Anyone can discover and view your profile"}
              </p>
            </div>
            <button
              onClick={toggle}
              disabled={saving}
              aria-label="Toggle privacy"
              className={[
                "relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 disabled:opacity-50",
                isPrivate ? "bg-secondary" : "bg-outline-variant",
              ].join(" ")}
            >
              <div className={[
                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200",
                isPrivate ? "translate-x-6" : "translate-x-0.5",
              ].join(" ")} />
              {saving && <Loader2 size={12} className="absolute inset-0 m-auto text-white animate-spin" />}
            </button>
          </div>
        </div>

        {/* Info card */}
        <div className={[
          "rounded-2xl border p-4",
          isPrivate ? "bg-blue-50 border-blue-100" : "bg-surface-container-low border-outline-variant",
        ].join(" ")}>
          {isPrivate ? (
            <>
              <p className="text-[13px] font-semibold text-secondary mb-2">When your account is private</p>
              <ul className="space-y-1.5">
                {[
                  "Only your followers can see your profile and challenges",
                  "You approve or decline follow requests",
                  "Your activity is hidden from people you haven't approved",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 shrink-0" />
                    <span className="text-[13px] text-on-surface">{item}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-on-surface mb-1">Public Account</p>
              <p className="text-[13px] text-on-surface-variant leading-relaxed">
                Your profile, challenges, and achievements are visible to everyone on STRIVUP.
                Anyone can follow you and view your progress.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
