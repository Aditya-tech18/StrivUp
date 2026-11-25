"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bell, ChevronRight, HelpCircle,
  Info, Lock, LogOut, Shield, Trash2,
  BadgeCheck, ShieldCheck, Sparkles, User, UserMinus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getMyProfile, type Profile } from "@/lib/supabase/profile";
import { openStrivyFromSettings } from "@/components/features/strivy/StrivyLauncher";

interface SettingsItem {
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  href: string;
  destructive?: boolean;
  verified?: boolean;
}

function AppearanceGroup() {
  return (
    <section aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="mb-2.5 font-display text-headline-sm font-bold text-on-surface">
        Appearance
      </h2>
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 [&>[role=radiogroup]]:grid [&>[role=radiogroup]]:grid-cols-2 [&_[role=radio]]:gap-1.5 [&_[role=radio]]:px-2 sm:[&_[role=radio]]:gap-3 sm:[&_[role=radio]]:px-4">
        <ThemeToggle />
      </div>
    </section>
  );
}

function StrivyGroup() {
  return (
    <section
      aria-labelledby="settings-strivy-heading"
      className="rounded-2xl border border-outline-variant bg-surface-container-lowest bg-[radial-gradient(ellipse_at_top_right,color-mix(in_srgb,var(--color-streak)_16%,transparent),transparent_70%)] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-streak/18 text-streak-ink">
          <Sparkles size={23} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="settings-strivy-heading" className="font-display text-headline-md font-bold text-on-surface">
            STRIVY Copilot
          </h2>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            Check your progress, plan your next step and manage STRIVY reminders.
          </p>
        </div>
      </div>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={(event) => openStrivyFromSettings(event.currentTarget)}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-streak px-4 text-body-sm font-bold text-on-streak transition-colors hover:bg-streak/85"
      >
        Open STRIVY <ChevronRight size={16} aria-hidden="true" />
      </button>
    </section>
  );
}

function SettingsGroup({
  title,
  items,
}: {
  title: string;
  items: SettingsItem[];
}) {
  return (
    <section>
      <h2 className="mb-2.5 font-display text-headline-sm font-bold text-on-surface">{title}</h2>
      <div className="divide-y divide-outline-variant overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex min-h-14 items-center gap-3 px-3.5 py-3 transition-colors hover:bg-surface-container active:bg-surface-container-high focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-secondary"
          >
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${item.destructive ? "bg-error-container text-on-error-container" : "bg-surface-container text-secondary"}`}>
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-body-md font-semibold leading-tight ${item.destructive ? "text-error" : "text-on-surface"}`}>
                {item.label}
              </span>
              <span className="mt-0.5 block text-body-sm leading-snug text-on-surface-variant">
                {item.subtitle}
              </span>
            </span>
            {item.verified && (
              <span className="rounded-full bg-streak/15 px-2 py-1 text-label-sm font-bold text-streak-ink">
                Verified
              </span>
            )}
            <ChevronRight size={16} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function SettingsView({ strivyEnabled }: { strivyEnabled: boolean }) {
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
  }, [router, supabase]);

  const handleLogOut = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const profileItems: SettingsItem[] = [
    {
      icon: <User size={17} aria-hidden="true" />,
      label: "Edit Profile",
      subtitle: "Name, photo, bio and username",
      href: "/settings/edit-profile",
    },
    {
      icon: <Lock size={17} aria-hidden="true" />,
      label: "Account Privacy",
      subtitle: "Control who can see your profile",
      href: "/settings/privacy",
    },
    {
      icon: <BadgeCheck size={17} aria-hidden="true" />,
      label: "Verification",
      subtitle: profile?.verification_status === "approved" ? "View your verification details" : "Apply for a verified profile seal",
      href: "/settings/verification",
      verified: profile?.verification_status === "approved",
    },
    {
      icon: <Bell size={17} aria-hidden="true" />,
      label: "Interests",
      subtitle: "Topics that personalise your experience",
      href: "/settings/interests",
    },
  ];

  const permissionItems: SettingsItem[] = [
    {
      icon: <ShieldCheck size={17} aria-hidden="true" />,
      label: "Permissions",
      subtitle: "Notifications and location",
      href: "/settings/permissions",
    },
  ];

  const accountItems: SettingsItem[] = [
    {
      icon: <Shield size={17} aria-hidden="true" />,
      label: "Account Details",
      subtitle: "Email, phone, age and account info",
      href: "/settings/account-details",
    },
    {
      icon: <UserMinus size={17} aria-hidden="true" />,
      label: "Deactivate Account",
      subtitle: "Temporarily pause your account",
      href: "/settings/deactivate",
    },
    {
      icon: <Trash2 size={17} aria-hidden="true" />,
      label: "Delete Account",
      subtitle: "Permanently remove all your data",
      href: "/settings/delete-account",
      destructive: true,
    },
  ];

  const supportItems: SettingsItem[] = [
    {
      icon: <HelpCircle size={17} aria-hidden="true" />,
      label: "Help & Support",
      subtitle: "Get in touch with our team",
      href: "/settings/help",
    },
    {
      icon: <Shield size={17} aria-hidden="true" />,
      label: "Privacy Policy",
      subtitle: "How we handle your data",
      href: "/settings/privacy-policy",
    },
    {
      icon: <Info size={17} aria-hidden="true" />,
      label: "About STRIVUP",
      subtitle: "Version and platform information",
      href: "/settings/about",
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface" role="status" aria-label="Loading settings">
        <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
      </div>
    );
  }

  const initial = (profile?.full_name ?? profile?.username ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-surface pb-28">
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/95 pt-safe backdrop-blur-sm">
        <div className="mx-auto flex min-h-14 max-w-2xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.back()}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <h1 className="font-display text-headline-md font-bold text-on-surface">Settings</h1>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6">
        {strivyEnabled && <StrivyGroup />}

        {profile && (
          <div className="flex items-center gap-3.5 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-secondary/10">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="size-full object-cover" />
              ) : (
                <span className="font-display text-headline-md font-bold text-secondary">{initial}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-lg font-bold text-on-surface">
                {profile.full_name ?? "Your Name"}
              </p>
              {profile.username && (
                <p className="text-body-sm text-on-surface-variant">@{profile.username}</p>
              )}
            </div>
            <Link
              href="/settings/edit-profile"
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-surface-container px-4 text-body-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
            >
              Edit
            </Link>
          </div>
        )}

        <SettingsGroup title="Identity & profile" items={profileItems} />
        <SettingsGroup title="Permissions" items={permissionItems} />
        <AppearanceGroup />
        <SettingsGroup title="Account & security" items={accountItems} />
        <SettingsGroup title="Support" items={supportItems} />

        <button
          type="button"
          onClick={handleLogOut}
          disabled={loggingOut}
          className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-body-md font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
        >
          <LogOut size={16} className="text-on-surface-variant" aria-hidden="true" />
          {loggingOut ? "Signing out…" : "Sign Out"}
        </button>
      </div>
    </div>
  );
}
