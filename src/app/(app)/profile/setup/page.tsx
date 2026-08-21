"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card, Badge } from "@/components/ui";
import {
  getMyProfile,
  upsertMyProfile,
  getAllInterests,
  getMyInterestIds,
  setMyInterests,
  getMySocialLinks,
  addMySocialLink,
  deleteMySocialLink,
  uploadMyAvatar,
  removeMyAvatar,
  deleteMyAccount,
  PROFILE_CONSTANTS,
  type Profile,
  type Interest,
  type SocialLink,
  type SocialPlatform,
} from "@/lib/supabase/profile";

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "github", label: "GitHub" },
  { value: "twitter", label: "X / Twitter" },
  { value: "youtube", label: "YouTube" },
  { value: "portfolio", label: "Portfolio" },
  { value: "other", label: "Other" },
];

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [username, setUsername] = useState("");

  const [allInterests, setAllInterests] = useState<Interest[]>([]);
  const [myInterestIds, setMyInterestIds] = useState<number[]>([]);
  const [interestsModalOpen, setInterestsModalOpen] = useState(false);
  const [draftInterestIds, setDraftInterestIds] = useState<number[]>([]);

  const [links, setLinks] = useState<SocialLink[]>([]);
  const [addingLink, setAddingLink] = useState(false);
  const [newPlatform, setNewPlatform] = useState<SocialPlatform>("instagram");
  const [newUrl, setNewUrl] = useState("");

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function loadAll() {
    const [p, interests, myIds, socialLinks] = await Promise.all([
      getMyProfile(),
      getAllInterests(),
      getMyInterestIds(),
      getMySocialLinks(),
    ]);
    setProfile(p);
    setFullName(p?.full_name ?? "");
    setAge(p?.age ? String(p.age) : "");
    setBio(p?.bio ?? "");
    setUsername(p?.username ?? "");
    setAllInterests(interests);
    setMyInterestIds(myIds);
    setLinks(socialLinks);
  }

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }
        await loadAll();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadMyAvatar(file);
      setProfile((p) => (p ? { ...p, avatar_url: url } : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo");
    }
  }

  async function handleRemoveAvatar() {
    try {
      await removeMyAvatar();
      setProfile((p) => (p ? { ...p, avatar_url: null } : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo");
    }
  }

  async function handleSaveBasics() {
    try {
      await upsertMyProfile({
        full_name: fullName.trim(),
        age: age ? Number(age) : null,
        bio: bio.trim() || null,
        username: username.trim() || null,
      });
      await loadAll();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    }
  }

  function openInterestsModal() {
    setDraftInterestIds(myInterestIds);
    setInterestsModalOpen(true);
  }

  function toggleDraftInterest(id: number) {
    setDraftInterestIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSaveInterests() {
    try {
      await setMyInterests(draftInterestIds);
      setMyInterestIds(draftInterestIds);
      setInterestsModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save interests");
    }
  }

  async function handleAddLink() {
    try {
      const link = await addMySocialLink(newPlatform, newUrl.trim());
      setLinks((prev) => [...prev, link]);
      setNewUrl("");
      setAddingLink(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add link");
    }
  }

  async function handleDeleteLink(id: string) {
    try {
      await deleteMySocialLink(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove link");
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount();
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="type-body-md text-on-surface-variant">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface px-5 py-8 pb-24">
      <div className="mx-auto max-w-md flex flex-col gap-6">
        {error && (
          <p className="type-body-md text-error text-center" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col items-center text-center gap-3">
          <label className="relative cursor-pointer">
            <div className="w-24 h-24 rounded-full bg-surface-container flex items-center justify-center overflow-hidden border border-outline-variant">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt={profile.full_name ?? "Profile"} className="w-full h-full object-cover" />
              ) : (
                <Camera size={28} className="text-on-surface-variant" aria-hidden="true" />
              )}
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handleAvatarChange}
            />
          </label>
          {profile?.avatar_url && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              className="type-body-md text-error"
            >
              Remove photo
            </button>
          )}

          <div>
            <div className="flex items-center justify-center gap-1.5">
              <h1 className="type-title-lg text-on-surface">{profile?.full_name || "Unnamed"}</h1>
              {profile?.verification_status === "verified" && (
                <Badge variant="secondary">Verified</Badge>
              )}
            </div>
            {profile?.username && (
              <p className="type-body-md text-on-surface-variant">@{profile.username}</p>
            )}
          </div>

          {profile?.bio && <p className="type-body-lg text-on-surface">{profile.bio}</p>}

          <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Edit Profile"}
          </Button>
        </div>

        {editing && (
          <Card bordered padding="lg" className="flex flex-col gap-4">
            <p className="type-label-caps text-on-surface-variant">Personal Information</p>
            <Input label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} />
            <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} />
            <Input label="Age" type="number" value={age} onChange={(e) => setAge(e.target.value)} min={13} max={120} />
            <Input label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} hint="Optional" />
            <Button type="button" variant="primary" onClick={handleSaveBasics}>
              Save changes
            </Button>
          </Card>
        )}

        <Card bordered padding="lg" className="flex flex-col gap-2">
          <p className="type-label-caps text-on-surface-variant">Interests</p>
          <div className="flex items-center justify-between">
            <p className="type-body-lg text-on-surface">{myInterestIds.length} selected</p>
            <Button type="button" variant="outline" size="sm" onClick={openInterestsModal}>
              Edit Interests
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {allInterests
              .filter((i) => myInterestIds.includes(i.id))
              .map((i) => (
                <Badge key={i.id} variant="secondary">
                  {i.name}
                </Badge>
              ))}
          </div>
        </Card>

        <Card bordered padding="lg" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="type-label-caps text-on-surface-variant">Social Links</p>
            <span className="type-body-md text-on-surface-variant">Optional</span>
          </div>

          {links.map((link) => (
            <div key={link.id} className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="type-body-md font-medium text-on-surface capitalize">{link.platform}</p>
                <p className="type-body-md text-on-surface-variant truncate">{link.url}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteLink(link.id)}
                aria-label="Remove link"
                className="text-error shrink-0"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          {addingLink ? (
            <div className="flex flex-col gap-2">
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value as SocialPlatform)}
                className="h-10 rounded border border-outline-variant bg-surface-container-lowest px-3 type-body-lg text-on-surface"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://…"
              />
              <div className="flex gap-2">
                <Button type="button" variant="primary" size="sm" onClick={handleAddLink} disabled={!newUrl.trim()}>
                  Add
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setAddingLink(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            links.length < PROFILE_CONSTANTS.MAX_SOCIAL_LINKS && (
              <button
                type="button"
                onClick={() => setAddingLink(true)}
                className="flex items-center gap-1.5 type-body-md text-secondary font-medium"
              >
                <Plus size={16} /> Add Social Link
              </button>
            )
          )}
        </Card>

        <Card bordered padding="lg" className="flex flex-col gap-3 border-error/40">
          <p className="type-label-caps text-error">Danger Zone</p>
          <Button type="button" variant="outline" className="border-error text-error" onClick={() => setDeleteModalOpen(true)}>
            Delete Account
          </Button>
        </Card>
      </div>

      {interestsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-t-xl sm:rounded-xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="type-headline-sm text-on-surface">Choose your interests</h2>
              <button type="button" onClick={() => setInterestsModalOpen(false)} aria-label="Close" className="text-on-surface-variant">
                <X size={20} />
              </button>
            </div>
            <p className="type-body-md text-on-surface-variant mb-4">
              Select at least {PROFILE_CONSTANTS.MIN_INTERESTS} interests — {draftInterestIds.length} / {allInterests.length} selected
            </p>
            <div className="flex flex-wrap gap-2 mb-6">
              {allInterests.map((interest) => {
                const selected = draftInterestIds.includes(interest.id);
                return (
                  <button
                    key={interest.id}
                    type="button"
                    onClick={() => toggleDraftInterest(interest.id)}
                    className={[
                      "px-4 py-2 rounded-full type-body-md border transition-colors duration-150",
                      selected
                        ? "bg-secondary text-on-secondary border-secondary"
                        : "bg-surface-container text-on-surface-variant border-outline-variant hover:border-outline",
                    ].join(" ")}
                  >
                    {interest.name}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="primary"
              fullWidth
              disabled={draftInterestIds.length < PROFILE_CONSTANTS.MIN_INTERESTS}
              onClick={handleSaveInterests}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm bg-surface-container-lowest rounded-xl p-5">
            <h2 className="type-headline-sm text-on-surface mb-2">Delete your STRIV account?</h2>
            <p className="type-body-md text-on-surface-variant mb-4">
              This permanently removes your profile and account data. This action cannot be undone.
            </p>
            <p className="type-body-md text-on-surface mb-1">
              Type <span className="font-semibold">DELETE</span> to confirm
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="mb-4"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteConfirmText("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                fullWidth
                className="bg-error hover:opacity-90"
                disabled={deleteConfirmText !== "DELETE" || deleting}
                onClick={handleDeleteAccount}
              >
                {deleting ? "Deleting…" : "Delete Account"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
