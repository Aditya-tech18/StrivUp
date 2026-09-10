"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bell, ChevronRight, HelpCircle,
  Info, Lock, LogOut, Shield, Trash2,
  User, UserMinus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyProfile, type Profile } from "@/lib/supabase/profile";

interface SettingsItem {
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  href: string;
  destructive?: boolean;
}

function SettingsGroup({
  title,
  items,
}: {
  title: string;
  items: SettingsItem[];
}) {
  const router = useRouter();
  return (
    <section>
      <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.08em] mb-2 px-1">
        {title}
      </p>
      <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        {items.map((item, idx) => (
          <button
            key={item.label}
            onClick={() => router.push(item.href)}
            className={[
              "w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors",
              "hover:bg-surface-container-low active:bg-surface-container",
              idx < items.length - 1 ? "border-b border-outline-variant" : "",
            ].join(" ")}
          >
            <div
              className={[
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                item.destructive ? "bg-error-container" : "bg-surface-container",
              ].join(" ")}
            >
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={[
                  "text-[14px] font-semibold leading-tight",
                  item.destructive ? "text-error" : "text-on-surface",
                ].join(" ")}
              >
                {item.label}
              </p>
              <p className="text-[12px] text-on-surface-variant mt-0.5 leading-snug">
                {item.subtitle}
              </p>
            </div>
            <ChevronRight size={16} className="text-outline shrink-0" />
          </button>
        ))}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/login"); return; }
        const p = await getMyProfile();
        setProfile(p);
      } catch (e) {
        console.error("Settings load error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogOut = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const profileItems: SettingsItem[] = [
    {
      icon: <User size={17} className="text-secondary" />,
      label: "Edit Profile",
      subtitle: "Name, photo, bio and username",
      href: "/settings/edit-profile",
    },
    {
      icon: <Lock size={17} className="text-secondary" />,
      label: "Account Privacy",
      subtitle: "Control who can see your profile",
      href: "/settings/privacy",
    },
    {
      icon: <Bell size={17} className="text-secondary" />,
      label: "Interests",
      subtitle: "Topics that personalise your experience",
      href: "/settings/interests",
    },
  ];

  const accountItems: SettingsItem[] = [
    {
      icon: <Shield size={17} className="text-secondary" />,
      label: "Account Details",
      subtitle: "Email, phone, age and account info",
      href: "/settings/account-details",
    },
    {
      icon: <UserMinus size={17} className="text-on-surface-variant" />,
      label: "Deactivate Account",
      subtitle: "Temporarily pause your account",
      href: "/settings/deactivate",
    },
    {
      icon: <Trash2 size={17} className="text-error" />,
      label: "Delete Account",
      subtitle: "Permanently remove all your data",
      href: "/settings/delete-account",
      destructive: true,
    },
  ];

  const supportItems: SettingsItem[] = [
    {
      icon: <HelpCircle size={17} className="text-secondary" />,
      label: "Help & Support",
      subtitle: "Get in touch with our team",
      href: "/settings/help",
    },
    {
      icon: <Shield size={17} className="text-secondary" />,
      label: "Privacy Policy",
      subtitle: "How we handle your data",
      href: "/settings/privacy-policy",
    },
    {
      icon: <Info size={17} className="text-secondary" />,
      label: "About STRIVUP",
      subtitle: "Version and platform information",
      href: "/settings/about",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
      </div>
    );
  }

  const initial = (profile?.full_name ?? profile?.username ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-28">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-5 py-3.5">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
          >
            <ArrowLeft size={19} className="text-on-surface" />
          </button>
          <h1 className="text-[17px] font-bold text-on-surface tracking-[-0.01em]">Settings</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-5 flex flex-col gap-5">

        {/* ── Profile card ─────────────────────────────────────────────── */}
        {profile && (
          <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-secondary/10 overflow-hidden shrink-0 flex items-center justify-center border border-outline-variant">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[18px] font-bold text-secondary">{initial}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-on-surface truncate">
                  {profile.full_name ?? "Your Name"}
                </p>
                {profile.username && (
                  <p className="text-[13px] text-on-surface-variant">@{profile.username}</p>
                )}
              </div>
              <button
                onClick={() => router.push("/settings/edit-profile")}
                className="shrink-0 px-3.5 py-1.5 rounded-lg border border-outline-variant text-[13px] font-semibold text-on-surface bg-surface-container hover:bg-surface-container-high transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        )}

        {/* ── Sections ─────────────────────────────────────────────────── */}
        <SettingsGroup title="Profile" items={profileItems} />
        <SettingsGroup title="Account" items={accountItems} />
        <SettingsGroup title="Support" items={supportItems} />

        {/* ── Log out ──────────────────────────────────────────────────── */}
        <button
          onClick={handleLogOut}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-white border border-outline-variant text-[14px] font-semibold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-50 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
        >
          <LogOut size={16} className="text-on-surface-variant" />
          {loggingOut ? "Signing out…" : "Sign Out"}
        </button>

        <p className="text-center text-[11px] text-on-surface-variant pb-2">
          STRIVUP · India's Platform for Growth
        </p>
      </div>
    </div>
  );
}
