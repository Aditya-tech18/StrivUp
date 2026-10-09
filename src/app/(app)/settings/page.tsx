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
      <p className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-[0.08em] mb-2 px-1">
        {title}
      </p>
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden elev-1 surface-raised">
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
                  "text-body-md font-semibold leading-tight",
                  item.destructive ? "text-error" : "text-on-surface",
                ].join(" ")}
              >
                {item.label}
              </p>
              <p className="text-body-sm text-on-surface-variant mt-0.5 leading-snug">
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
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
      </div>
    );
  }

  const initial = (profile?.full_name ?? profile?.username ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-surface pb-28">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 pt-safe z-40 bg-surface/95 backdrop-blur-md border-b border-outline-variant">
        <div className="mx-auto measure-form flex items-center gap-3 px-5 py-3.5">
          <button aria-label="Back"
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors tap-target"
          >
            <ArrowLeft size={19} className="text-on-surface" />
          </button>
          <h1 className="text-body-lg font-bold text-on-surface tracking-[-0.01em]">Settings</h1>
        </div>
      </div>

      <div className="mx-auto measure-form px-5 pt-5 flex flex-col gap-5">

        {/* ── Profile card ─────────────────────────────────────────────── */}
        {profile && (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant elev-1 surface-raised p-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-secondary/10 overflow-hidden shrink-0 flex items-center justify-center border border-outline-variant">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-headline-md font-bold text-secondary">{initial}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body-lg font-bold text-on-surface truncate">
                  {profile.full_name ?? "Your Name"}
                </p>
                {profile.username && (
                  <p className="text-body-md text-on-surface-variant">@{profile.username}</p>
                )}
              </div>
              <button
                onClick={() => router.push("/settings/edit-profile")}
                className="shrink-0 px-3.5 py-1.5 rounded-xl border border-outline-variant text-body-md font-semibold text-on-surface bg-surface-container hover:bg-surface-container-high transition-colors tap-target"
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
          className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-body-md font-semibold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-50 elev-1 surface-raised"
        >
          <LogOut size={16} className="text-on-surface-variant" />
          {loggingOut ? "Signing out…" : "Sign Out"}
        </button>

        <p className="text-center text-label-sm text-on-surface-variant pb-2">
          STRIVUP · India&apos;s Platform for Growth
        </p>
      </div>
    </div>
  );
}
