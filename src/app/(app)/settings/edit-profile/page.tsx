"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import {
  getMyProfile, upsertMyProfile, getMySocialLinks,
  addMySocialLink, deleteMySocialLink, uploadMyAvatar, removeMyAvatar,
  type Profile, type SocialLink, type SocialPlatform,
  PROFILE_CONSTANTS,
} from "@/lib/supabase/profile";

const PLATFORMS: { value: SocialPlatform; label: string; icon: string }[] = [
  { value: "instagram", label: "Instagram",   icon: "📷" },
  { value: "linkedin",  label: "LinkedIn",    icon: "💼" },
  { value: "github",    label: "GitHub",      icon: "🐙" },
  { value: "twitter",   label: "X / Twitter", icon: "𝕏" },
  { value: "youtube",   label: "YouTube",     icon: "▶️" },
  { value: "portfolio", label: "Portfolio",   icon: "🌐" },
  { value: "other",     label: "Other",       icon: "🔗" },
];

export default function EditProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio]         = useState("");

  const [links, setLinks]     = useState<SocialLink[]>([]);
  const [addingLink, setAddingLink] = useState(false);
  const [newPlatform, setNewPlatform] = useState<SocialPlatform>("instagram");
  const [newUrl, setNewUrl]   = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const [p, sl] = await Promise.all([getMyProfile(), getMySocialLinks()]);
      setProfile(p);
      setFullName(p?.full_name ?? "");
      setUsername(p?.username ?? "");
      setBio(p?.bio ?? "");
      setLinks(sl);
      setLoading(false);
    })();
  }, [supabase, router]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const url = await uploadMyAvatar(file);
      setProfile(p => p ? { ...p, avatar_url: url } : p);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); }
  };

  const handleRemoveAvatar = async () => {
    setUploading(true); setError(null);
    try { await removeMyAvatar(); setProfile(p => p ? { ...p, avatar_url: null } : p); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to remove photo"); }
    finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!fullName.trim()) { setError("Full name is required"); return; }
    setSaving(true); setError(null);
    try {
      await upsertMyProfile({ full_name: fullName.trim(), username: username.trim() || undefined, bio: bio.trim() || undefined });
      setSuccess(true);
      setTimeout(() => { setSuccess(false); router.push("/profile"); }, 1200);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save changes. Please try again."); }
    finally { setSaving(false); }
  };

  const handleAddLink = async () => {
    if (!newUrl.trim()) return;
    try {
      const link = await addMySocialLink(newPlatform, newUrl.trim());
      setLinks(prev => [...prev, link]);
      setNewUrl(""); setAddingLink(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to add link"); }
  };

  const handleDeleteLink = async (id: string) => {
    try { await deleteMySocialLink(id); setLinks(prev => prev.filter(l => l.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to remove link"); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-7 h-7 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  const displayName = profile?.full_name || fullName || "Your Name";

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-5 py-4 bg-white border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface">
            <ArrowLeft size={20} />
          </button>
          <h1 className="type-headline-sm text-on-surface font-bold">Edit Profile</h1>
        </div>
        <button onClick={handleSave} disabled={saving || !fullName.trim()}
          className="flex items-center gap-1.5 text-secondary font-semibold text-[14px] disabled:opacity-40">
          {saving ? <Loader2 size={15} className="animate-spin" /> : success ? <Check size={15} /> : null}
          {saving ? "Saving…" : success ? "Saved!" : "Save"}
        </button>
      </div>

      {error && (
        <div className="mx-5 mt-3 px-4 py-3 rounded-xl bg-error-container border border-error/20 flex items-center gap-2">
          <p className="type-body-md text-error flex-1">{error}</p>
          <button onClick={() => setError(null)}><X size={14} className="text-error" /></button>
        </div>
      )}

      <div className="max-w-lg mx-auto px-5 py-5 flex flex-col gap-5">

        {/* Photo section */}
        <div className="bg-white rounded-2xl border border-outline-variant p-5 flex flex-col items-center gap-3">
          <div className="relative">
            <div className={`w-24 h-24 rounded-full overflow-hidden bg-secondary/10 border-2 border-outline-variant ${uploading ? "opacity-60" : ""}`}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                : <div className="w-full h-full flex items-center justify-center"><span className="text-3xl font-black text-secondary">{displayName.charAt(0)}</span></div>}
            </div>
            <label className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-secondary border-2 border-white flex items-center justify-center cursor-pointer shadow">
              {uploading ? <Loader2 size={12} className="text-white animate-spin" /> : <Camera size={12} className="text-white" />}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleAvatarChange} disabled={uploading} />
            </label>
          </div>
          <button onClick={() => document.querySelector<HTMLInputElement>('input[type=file]')?.click()}
            className="text-secondary font-semibold type-body-md hover:underline">
            Change Photo
          </button>
          {profile?.avatar_url && (
            <button onClick={handleRemoveAvatar} className="text-error text-[12px] font-medium hover:underline">Remove photo</button>
          )}
        </div>

        {/* Personal information */}
        <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden">
          <div className="px-4 pt-4 pb-1">
            <p className="type-label-caps text-on-surface-variant mb-3">Personal Information</p>
          </div>
          <div className="px-4 pb-4 flex flex-col gap-3">
            <div>
              <label className="block type-body-md font-medium text-on-surface mb-1">
                Full Name <span className="text-error">*</span>
              </label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} maxLength={80} placeholder="Your full name"
                className="w-full h-11 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-[14px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
            </div>
            <div>
              <label className="block type-body-md font-medium text-on-surface mb-1">Username</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[14px]">@</span>
                <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                  maxLength={30} placeholder="yourusername"
                  className="w-full h-11 rounded-xl border border-outline-variant bg-surface-container-lowest pl-7 pr-3 text-[14px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
              </div>
              <p className="text-[11px] text-on-surface-variant mt-1">This is your public username</p>
            </div>
            <div>
              <label className="block type-body-md font-medium text-on-surface mb-1">Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={150} rows={3}
                placeholder="Tell people a bit about yourself…"
                className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-[14px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary resize-none" />
              <p className="text-[11px] text-on-surface-variant mt-0.5 text-right">{bio.length}/150</p>
            </div>
          </div>
        </div>

        {/* Social links */}
        <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden">
          <div className="px-4 pt-4 pb-1">
            <div className="flex items-center justify-between mb-3">
              <p className="type-label-caps text-on-surface-variant">Social Links</p>
              <p className="text-[11px] text-on-surface-variant">{links.length}/{PROFILE_CONSTANTS.MAX_SOCIAL_LINKS}</p>
            </div>
          </div>
          <div className="px-4 pb-4 flex flex-col gap-2">
            {links.map(link => {
              const pl = PLATFORMS.find(p => p.value === link.platform);
              return (
                <div key={link.id} className="flex items-center gap-2.5 p-3 rounded-xl border border-outline-variant bg-surface-container-lowest">
                  <span className="text-lg shrink-0">{pl?.icon ?? "🔗"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-on-surface-variant">{pl?.label ?? link.platform}</p>
                    <p className="text-[12px] text-on-surface truncate">{link.url}</p>
                  </div>
                  <button onClick={() => handleDeleteLink(link.id)} className="text-error shrink-0 p-1"><Trash2 size={15} /></button>
                </div>
              );
            })}

            {!addingLink && links.length < PROFILE_CONSTANTS.MAX_SOCIAL_LINKS && (
              <button onClick={() => setAddingLink(true)}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-outline-variant text-secondary font-semibold type-body-md hover:bg-surface-container transition-colors">
                <Plus size={16} /> Add Another Link
              </button>
            )}

            {addingLink && (
              <div className="flex flex-col gap-2 p-3 rounded-xl border border-secondary/30 bg-secondary/5">
                <select value={newPlatform} onChange={e => setNewPlatform(e.target.value as SocialPlatform)}
                  className="h-10 rounded-lg border border-outline-variant bg-white px-3 text-[13px] text-on-surface">
                  {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
                </select>
                <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://…"
                  className="w-full h-10 rounded-lg border border-outline-variant bg-white px-3 text-[13px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={handleAddLink} disabled={!newUrl.trim()} fullWidth>Add Link</Button>
                  <Button variant="outline" size="sm" onClick={() => { setAddingLink(false); setNewUrl(""); }} fullWidth>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        <Button variant="secondary" size="lg" onClick={handleSave} disabled={saving || !fullName.trim()} fullWidth>
          {saving ? <><Loader2 size={16} className="animate-spin mr-2" />Saving…</> : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
