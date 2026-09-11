"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getMyProfile, upsertMyProfile,
  getMySocialLinks, addMySocialLink, deleteMySocialLink,
  uploadMyAvatar, removeMyAvatar,
  type Profile, type SocialLink, type SocialPlatform,
  PROFILE_CONSTANTS,
} from "@/lib/supabase/profile";

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "instagram", label: "Instagram"    },
  { value: "linkedin",  label: "LinkedIn"     },
  { value: "github",    label: "GitHub"       },
  { value: "twitter",   label: "X / Twitter"  },
  { value: "youtube",   label: "YouTube"      },
  { value: "portfolio", label: "Portfolio"    },
  { value: "other",     label: "Other"        },
];

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-50 text-pink-600",
  linkedin:  "bg-blue-50 text-blue-600",
  github:    "bg-gray-50 text-gray-700",
  twitter:   "bg-sky-50 text-sky-600",
  youtube:   "bg-red-50 text-red-600",
  portfolio: "bg-violet-50 text-violet-600",
  other:     "bg-surface-container text-on-surface-variant",
};

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-[0.05em]">
        {label}{required && <span className="text-error ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-on-surface-variant">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full h-11 rounded-xl border border-outline-variant bg-white px-3.5 text-[14px] " +
  "text-on-surface placeholder:text-on-surface-variant focus:outline-none " +
  "focus:ring-2 focus:ring-secondary/25 focus:border-secondary transition-colors";

export default function EditProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [saved,     setSaved]     = useState(false);

  const [profile,  setProfile]  = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio,      setBio]      = useState("");

  const [links,      setLinks]      = useState<SocialLink[]>([]);
  const [addingLink, setAddingLink] = useState(false);
  const [newPlatform,setNewPlatform]= useState<SocialPlatform>("instagram");
  const [newUrl,     setNewUrl]     = useState("");
  const [linkError,  setLinkError]  = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/login"); return; }
        const [p, sl] = await Promise.all([getMyProfile(), getMySocialLinks()]);
        setProfile(p);
        setFullName(p?.full_name ?? "");
        setUsername(p?.username ?? "");
        setBio(p?.bio ?? "");
        setLinks(sl);
      } catch (e) {
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const url = await uploadMyAvatar(file);
      setProfile(p => p ? { ...p, avatar_url: url } : p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setUploading(true); setError(null);
    try {
      await removeMyAvatar();
      setProfile(p => p ? { ...p, avatar_url: null } : p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove photo");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) { setError("Full name is required"); return; }
    setSaving(true); setError(null);
    try {
      await upsertMyProfile({
        full_name: fullName.trim(),
        username:  username.trim() || undefined,
        bio:       bio.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); router.push("/profile"); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddLink = async () => {
    setLinkError("");
    if (!newUrl.trim()) { setLinkError("Please enter a URL"); return; }
    if (!newUrl.startsWith("http")) { setLinkError("URL must start with http:// or https://"); return; }
    try {
      const link = await addMySocialLink(newPlatform, newUrl.trim());
      setLinks(prev => [...prev, link]);
      setNewUrl("");
      setAddingLink(false);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Failed to add link");
    }
  };

  const handleDeleteLink = async (id: string) => {
    try {
      await deleteMySocialLink(id);
      setLinks(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove link");
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  const displayName = fullName || profile?.full_name || "You";

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-28">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-lg mx-auto flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
            >
              <ArrowLeft size={19} className="text-on-surface" />
            </button>
            <h1 className="text-[17px] font-bold text-on-surface tracking-[-0.01em]">Edit Profile</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !fullName.trim()}
            className="flex items-center gap-1.5 text-[14px] font-bold text-secondary disabled:opacity-40 transition-opacity"
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : saved ? (
              <Check size={15} />
            ) : null}
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="max-w-lg mx-auto px-5 mt-4">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-error-container border border-error/20">
            <p className="text-[13px] text-error flex-1">{error}</p>
            <button onClick={() => setError(null)}>
              <X size={14} className="text-error" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-5 pt-5 flex flex-col gap-5">

        {/* ── Avatar ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 flex flex-col items-center gap-3">
          <div className="relative">
            <div className={[
              "w-24 h-24 rounded-full overflow-hidden border-2 border-outline-variant bg-surface-container",
              uploading ? "opacity-60" : "",
            ].join(" ")}>
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-secondary/8">
                  <span className="text-[32px] font-black text-secondary">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <label className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-secondary border-2 border-white flex items-center justify-center cursor-pointer shadow-md">
              {uploading
                ? <Loader2 size={12} className="text-white animate-spin" />
                : <Camera size={12} className="text-white" />
              }
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleAvatar}
                disabled={uploading}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <label className="px-4 py-1.5 rounded-lg bg-secondary text-white text-[13px] font-semibold cursor-pointer hover:opacity-90 transition-opacity">
              Change Photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleAvatar}
                disabled={uploading}
              />
            </label>
            {profile?.avatar_url && (
              <button
                onClick={handleRemoveAvatar}
                className="px-4 py-1.5 rounded-lg border border-outline-variant text-[13px] font-semibold text-error hover:bg-error-container/50 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-on-surface-variant">JPEG, PNG or WebP · Max 5 MB</p>
        </div>

        {/* ── Personal information ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 flex flex-col gap-4">
          <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.08em]">
            Personal Information
          </p>
          <Field label="Full Name" required>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              maxLength={80}
              placeholder="Your full name"
              className={inputCls}
            />
          </Field>
          <Field label="Username" hint="Lowercase letters, numbers, . and _ only">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[14px] select-none">@</span>
              <input
                value={username}
                onChange={e =>
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))
                }
                maxLength={30}
                placeholder="yourusername"
                className={inputCls + " pl-8"}
              />
            </div>
          </Field>
          <Field label="Bio">
            <div className="relative">
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                maxLength={150}
                rows={3}
                placeholder="Tell people a bit about yourself"
                className="w-full rounded-xl border border-outline-variant bg-white px-3.5 py-2.5 text-[14px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:border-secondary transition-colors resize-none"
              />
              <span className="absolute bottom-2 right-3 text-[11px] text-on-surface-variant">
                {bio.length}/150
              </span>
            </div>
          </Field>
        </div>

        {/* ── Social links ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-outline-variant shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.08em]">
              Social Links
            </p>
            <p className="text-[11px] text-on-surface-variant">
              {links.length} / {PROFILE_CONSTANTS.MAX_SOCIAL_LINKS}
            </p>
          </div>

          {links.map(link => {
            const pl = PLATFORMS.find(p => p.value === link.platform);
            const colorCls = PLATFORM_COLORS[link.platform] ?? PLATFORM_COLORS.other;
            const displayUrl = link.url
              .replace(/^https?:\/\/(www\.)?/, "")
              .split("/")
              .slice(0, 3)
              .join("/");
            return (
              <div
                key={link.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-outline-variant bg-surface-container-low"
              >
                <span
                  className={[
                    "text-[11px] font-bold px-2 py-1 rounded-lg shrink-0",
                    colorCls,
                  ].join(" ")}
                >
                  {pl?.label ?? link.platform}
                </span>
                <p className="flex-1 text-[13px] text-on-surface truncate">{displayUrl}</p>
                <button
                  onClick={() => handleDeleteLink(link.id)}
                  className="text-on-surface-variant hover:text-error transition-colors shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}

          {!addingLink && links.length < PROFILE_CONSTANTS.MAX_SOCIAL_LINKS && (
            <button
              onClick={() => setAddingLink(true)}
              className="flex items-center gap-2 text-[13px] font-semibold text-secondary hover:text-secondary/80 transition-colors"
            >
              <Plus size={15} /> Add Social Link
            </button>
          )}

          {addingLink && (
            <div className="flex flex-col gap-2.5 p-3.5 rounded-xl border border-secondary/20 bg-secondary/4">
              <select
                value={newPlatform}
                onChange={e => setNewPlatform(e.target.value as SocialPlatform)}
                className="h-10 rounded-lg border border-outline-variant bg-white px-3 text-[13px] text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
              >
                {PLATFORMS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <input
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                placeholder="https://…"
                className="h-10 rounded-lg border border-outline-variant bg-white px-3 text-[13px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
              />
              {linkError && (
                <p className="text-[12px] text-error">{linkError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleAddLink}
                  disabled={!newUrl.trim()}
                  className="flex-1 h-9 rounded-lg bg-secondary text-white text-[13px] font-semibold disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  onClick={() => { setAddingLink(false); setNewUrl(""); setLinkError(""); }}
                  className="flex-1 h-9 rounded-lg border border-outline-variant text-on-surface text-[13px] font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Save button ───────────────────────────────────────────────── */}
        <button
          onClick={handleSave}
          disabled={saving || !fullName.trim()}
          className="w-full h-12 rounded-xl bg-secondary text-white text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity shadow-[0_2px_8px_rgba(29,78,216,0.25)]"
        >
          {saving
            ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
            : "Save Changes"
          }
        </button>
      </div>
    </div>
  );
}
