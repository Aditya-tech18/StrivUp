"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronRight, Heart, Info, Lock, LogOut,
  Mail, Shield, Trash2, User, UserX, ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyProfile, type Profile } from "@/lib/supabase/profile";

interface SettingsRow {
  icon: React.ReactNode;
  label: string;
  description: string;
  href?: string;
  action?: () => void;
  danger?: boolean;
  red?: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const p = await getMyProfile();
      setProfile(p);
      setLoading(false);
    })();
  }, [supabase, router]);

  const handleLogOut = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const profileRows: SettingsRow[] = [
    {
      icon: <User size={18} className="text-secondary" />,
      label: "Edit Profile",
      description: "Update your name, photo, bio and username",
      href: "/settings/edit-profile",
    },
    {
      icon: <Lock size={18} className="text-secondary" />,
      label: "Account Privacy",
      description: "Manage your profile visibility",
      href: "/settings/privacy",
    },
    {
      icon: <Heart size={18} className="text-secondary" />,
      label: "Interests",
      description: "Choose topics you're passionate about",
      href: "/settings/interests",
    },
  ];

  const accountRows: SettingsRow[] = [
    {
      icon: <Mail size={18} className="text-secondary" />,
      label: "Account Details",
      description: "View your email, phone and personal details",
      href: "/settings/account-details",
    },
    {
      icon: <UserX size={18} className="text-on-surface-variant" />,
      label: "Deactivate Account",
      description: "Temporarily disable your account",
      href: "/settings/deactivate",
    },
    {
      icon: <Trash2 size={18} className="text-error" />,
      label: "Delete Account",
      description: "Permanently delete your account",
      href: "/settings/delete-account",
      red: true,
    },
  ];

  const supportRows: SettingsRow[] = [
    {
      icon: <Mail size={18} className="text-secondary" />,
      label: "Help & Support",
      description: "Get help or contact us",
      href: "/settings/help",
    },
    {
      icon: <Shield size={18} className="text-secondary" />,
      label: "Privacy Policy",
      description: "Read our privacy policy",
      href: "/settings/privacy-policy",
    },
    {
      icon: <Info size={18} className="text-secondary" />,
      label: "About STRIVUP",
      description: "Version and platform information",
      href: "/settings/about",
    },
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-7 h-7 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-5 py-4 bg-white border-b border-outline-variant">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="type-headline-sm text-on-surface font-bold">Settings</h1>
      </div>

      <div className="max-w-lg mx-auto px-5 py-5 flex flex-col gap-5">

        {/* Profile summary */}
        {profile && (
          <div className="bg-white rounded-2xl border border-outline-variant p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary/10 overflow-hidden shrink-0 flex items-center justify-center">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                : <span className="text-lg font-bold text-secondary">{(profile.full_name ?? "?").charAt(0)}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="type-body-md font-bold text-on-surface truncate">{profile.full_name ?? "Your Name"}</p>
              {profile.username && <p className="text-[12px] text-on-surface-variant">@{profile.username}</p>}
            </div>
            <button onClick={() => router.push("/settings/edit-profile")}
              className="px-3 py-1.5 rounded-lg border border-outline-variant text-[12px] font-semibold text-on-surface bg-surface-container hover:bg-surface-container-high transition-colors shrink-0">
              Edit
            </button>
          </div>
        )}

        {/* PROFILE section */}
        <SettingsSection title="Profile" rows={profileRows} onNav={router.push.bind(router)} />

        {/* ACCOUNT section */}
        <SettingsSection title="Account" rows={accountRows} onNav={router.push.bind(router)} />

        {/* SUPPORT section */}
        <SettingsSection title="Support" rows={supportRows} onNav={router.push.bind(router)} />

        {/* Log Out */}
        <button
          onClick={handleLogOut}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-outline-variant text-on-surface font-semibold type-body-md hover:bg-surface-container transition-colors disabled:opacity-50">
          <LogOut size={17} />
          {loggingOut ? "Logging out…" : "Log Out"}
        </button>

        <p className="text-center text-[11px] text-on-surface-variant">STRIVUP · India's Platform for Growth</p>
      </div>
    </div>
  );
}

function SettingsSection({ title, rows, onNav }: { title: string; rows: SettingsRow[]; onNav: (href: string) => void }) {
  return (
    <div>
      <p className="type-label-caps text-on-surface-variant mb-2 px-1">{title}</p>
      <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden divide-y divide-outline-variant">
        {rows.map(row => (
          <button key={row.label} onClick={() => row.href ? onNav(row.href) : row.action?.()}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-container transition-colors text-left">
            <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
              {row.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`type-body-md font-semibold ${row.red ? "text-error" : "text-on-surface"}`}>{row.label}</p>
              <p className="text-[11px] text-on-surface-variant leading-snug">{row.description}</p>
            </div>
            <ChevronRight size={16} className="text-outline shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
