"use client";

/**
 * EditChallengeClient — the form behind /challenges/[id]/edit.
 *
 * Scope is deliberate. Title, cover, category, description, reward and proof
 * wording are presentation: changing them is safe at any point in a
 * challenge's life. Duration and the daily proof method are not, because
 * participants' streaks and pending submissions are keyed to them, so they
 * are shown read-only with a line saying why.
 *
 * Every write checks its own error before reporting success. A silent failure
 * here would be worse than a visible one: the creator would walk away
 * believing a correction had been saved.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Loader2, Lock, Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui";
import { CategoryPicker } from "@/components/features/challenge/CategoryPicker";
import { compressImage, IMAGE_PRESETS } from "@/lib/image";

export interface EditableChallenge {
  id: string;
  title: string;
  description: string;
  category: string;
  visibility: "public" | "private";
  thumbnailUrl: string | null;
  rewardDescription: string;
  proofInstructions: string;
  durationDays: number | null;
}

const MAX_COVER_BYTES = 10 * 1024 * 1024;

export function EditChallengeClient({
  challenge,
  memberCount,
}: {
  challenge: EditableChallenge;
  memberCount: number;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(challenge.title);
  const [description, setDescription] = useState(challenge.description);
  const [category, setCategory] = useState(challenge.category);
  const [visibility, setVisibility] = useState(challenge.visibility);
  const [reward, setReward] = useState(challenge.rewardDescription);
  const [proofInstructions, setProofInstructions] = useState(
    challenge.proofInstructions
  );

  // Preview is either the stored cover or an object URL for a new pick; the
  // file itself is only uploaded on save, so abandoning the form leaves no
  // orphan in Storage.
  const [coverPreview, setCoverPreview] = useState(challenge.thumbnailUrl);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleError = title.trim().length === 0 ? "A title is required." : null;
  const canSave = !saving && !titleError;

  function pickCover(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for the cover.");
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setError("That image is over 10 MB. Pick a smaller one.");
      return;
    }
    setError(null);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Your session has expired. Sign in again to save.");
      setSaving(false);
      return;
    }

    let thumbnailUrl = challenge.thumbnailUrl;

    if (coverFile) {
      const { file: compressed } = await compressImage(
        coverFile,
        IMAGE_PRESETS.thumbnail
      );
      const ext = compressed.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/thumbnails/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("proof-media")
        .upload(path, compressed, { upsert: false });
      if (uploadError) {
        setError(`Cover upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from("proof-media").getPublicUrl(path);
      thumbnailUrl = publicUrl;
    }

    const { error: updateError } = await supabase
      .from("challenges")
      .update({
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        visibility,
        reward_description: reward.trim() || null,
        proof_instructions: proofInstructions.trim() || null,
        thumbnail_url: thumbnailUrl,
      })
      .eq("id", challenge.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    router.push(`/challenges/${challenge.id}`);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-surface px-gutter py-6 pb-28 md:px-gutter-md">
      <div className="mx-auto flex measure-form flex-col gap-6">
        <header className="flex items-center gap-2">
          <Link
            href="/creator/challenges"
            aria-label="Back to my challenges"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-on-surface hover:bg-surface-container"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-headline-md text-on-surface">
              Edit challenge
            </h1>
            <p className="text-body-sm text-on-surface-variant">
              {memberCount === 1
                ? "1 person has joined"
                : `${memberCount} people have joined`}
            </p>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-body-md text-error"
          >
            {error}
          </div>
        )}

        {/* Cover */}
        <section aria-label="Cover image" className="space-y-2">
          <span className="text-body-md font-medium text-on-surface">Cover</span>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-outline bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
          >
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverPreview}
                alt="Challenge cover"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex flex-col items-center gap-1 text-body-sm">
                <ImagePlus size={24} aria-hidden="true" />
                Add a cover image
              </span>
            )}
          </button>
          {coverPreview && (
            <p className="text-body-sm text-on-surface-variant">
              Tap the image to replace it.
            </p>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={pickCover}
            className="sr-only"
            aria-label="Choose a cover image"
          />
        </section>

        <Input
          id="challenge-title"
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={titleError ?? undefined}
          maxLength={120}
        />

        <CategoryPicker value={category} onChange={setCategory} />

        <div className="flex flex-col gap-1">
          <label
            htmlFor="challenge-description"
            className="text-body-md font-medium text-on-surface"
          >
            Description
          </label>
          <textarea
            id="challenge-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={2000}
            className="rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            placeholder="What is this challenge about?"
          />
        </div>

        <Input
          id="challenge-reward"
          label="Reward"
          value={reward}
          onChange={(e) => setReward(e.target.value)}
          hint="What a finisher gets. Leave blank if there is nothing to claim."
          maxLength={200}
        />

        <div className="flex flex-col gap-1">
          <label
            htmlFor="challenge-proof-instructions"
            className="text-body-md font-medium text-on-surface"
          >
            Proof instructions
          </label>
          <textarea
            id="challenge-proof-instructions"
            value={proofInstructions}
            onChange={(e) => setProofInstructions(e.target.value)}
            rows={3}
            maxLength={500}
            className="rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            placeholder="What should someone upload each day?"
          />
          <p className="text-body-sm text-on-surface-variant">
            Wording only. The proof method itself stays as it was set, so
            submissions already in review stay valid.
          </p>
        </div>

        {/* Visibility */}
        <fieldset className="space-y-2">
          <legend className="text-body-md font-medium text-on-surface">
            Visibility
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: "public", label: "Public", icon: Globe, desc: "Anyone can find and join" },
              { id: "private", label: "Private", icon: Lock, desc: "Invite code only" },
            ] as const).map(({ id, label, icon: Icon, desc }) => {
              const active = visibility === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVisibility(id)}
                  aria-pressed={active}
                  className={[
                    "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                    active
                      ? "border-secondary bg-secondary/10"
                      : "border-outline-variant bg-surface-container-lowest hover:border-outline",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-1.5 text-body-md font-semibold text-on-surface">
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </span>
                  <span className="text-body-sm text-on-surface-variant">{desc}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Locked after launch */}
        <section
          aria-label="Fixed after launch"
          className="rounded-xl border border-outline-variant bg-surface-container px-4 py-3"
        >
          <p className="text-body-md font-medium text-on-surface">
            Duration:{" "}
            {challenge.durationDays
              ? `${challenge.durationDays} days`
              : "Ongoing"}
          </p>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            The schedule is fixed once a challenge is live. Participants&apos;
            streaks are counted against it, so changing it would rewrite
            progress people have already earned.
          </p>
        </section>

        <div className="flex gap-3">
          <Link
            href="/creator/challenges"
            className="flex h-12 flex-1 items-center justify-center rounded-xl border border-outline-variant text-body-md font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-body-md font-bold text-on-primary disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
