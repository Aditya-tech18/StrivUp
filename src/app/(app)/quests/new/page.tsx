/**
 * src/app/(app)/quests/new/page.tsx — Create new quest
 *
 * Form to create a new quest with fields:
 *  - title, description, category, business_name, location_name
 *  - latitude/longitude (two number inputs)
 *  - reward_description, proof_type select, thumbnail upload
 *
 * is_hot and status default to false/'active' (admin-only for now).
 */

"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Upload, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input } from "@/components/ui";
import { createQuest, type CreateQuestInput } from "@/lib/data/quests";

export default function CreateQuestPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [rewardDescription, setRewardDescription] = useState("");
  const [proofType, setProofType] = useState<"photo" | "checkin" | "none">(
    "photo"
  );
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);

  // Handle thumbnail file selection
  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file for the thumbnail.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Thumbnail size must be under 5 MB.");
      return;
    }

    setThumbnailFile(file);
    setError(null);

    // Preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setThumbnailPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      // Validation
      if (!title.trim()) {
        setError("Title is required.");
        return;
      }
      if (!description.trim()) {
        setError("Description is required.");
        return;
      }
      if (!category.trim()) {
        setError("Category is required.");
        return;
      }
      if (!businessName.trim()) {
        setError("Business name is required.");
        return;
      }
      if (!locationName.trim()) {
        setError("Location name is required.");
        return;
      }

      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      if (isNaN(lat) || isNaN(lon)) {
        setError("Latitude and longitude must be valid numbers.");
        return;
      }

      if (!rewardDescription.trim()) {
        setError("Reward description is required.");
        return;
      }

      startTransition(async () => {
        try {
          let thumbnailUrl: string | null = null;

          // Upload thumbnail if provided
          if (thumbnailFile) {
            setUploadingThumbnail(true);
            const fileName = `quest_thumbnails/${Date.now()}_${thumbnailFile.name}`;
            const { error: uploadErr } = await supabase.storage
              .from("proof-media")
              .upload(fileName, thumbnailFile, { upsert: false });

            if (uploadErr) {
              throw new Error(`Thumbnail upload failed: ${uploadErr.message}`);
            }

            const { data } = supabase.storage
              .from("proof-media")
              .getPublicUrl(fileName);

            thumbnailUrl = data?.publicUrl ?? null;
            setUploadingThumbnail(false);
          }

          // Get current user
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) {
            throw new Error("Not authenticated.");
          }

          // Create quest
          const input: CreateQuestInput = {
            title: title.trim(),
            description: description.trim(),
            category: category.trim(),
            business_name: businessName.trim(),
            location_name: locationName.trim(),
            latitude: lat,
            longitude: lon,
            reward_description: rewardDescription.trim(),
            proof_type: proofType,
            thumbnail_url: thumbnailUrl,
          };

          const questId = await createQuest(supabase, user.id, input);

          if (questId) {
            router.push(`/quests/${questId}`);
          } else {
            throw new Error("Failed to create quest.");
          }
        } catch (err) {
          setUploadingThumbnail(false);
          setError(
            err instanceof Error ? err.message : "Failed to create quest."
          );
        }
      });
    },
    [
      title,
      description,
      category,
      businessName,
      locationName,
      latitude,
      longitude,
      rewardDescription,
      proofType,
      thumbnailFile,
      supabase,
      router,
    ]
  );

  return (
    <div className="min-h-screen bg-surface pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-surface-container-low border-b border-outline-variant px-4 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="text-on-surface-variant hover:text-on-surface"
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <h1 className="type-body-md font-semibold text-on-surface">
          Create a Quest
        </h1>
      </div>

      {/* Form */}
      <div className="mx-auto max-w-2xl px-4 py-6">
        {error && (
          <div className="flex gap-2 rounded-lg bg-error/10 border border-error/30 px-3 py-2 mb-4">
            <AlertCircle
              size={16}
              className="shrink-0 mt-0.5 text-error"
              aria-hidden="true"
            />
            <p className="type-body-md text-error text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <Card bordered padding="md">
            <Input
              label="Quest Title"
              placeholder="e.g., Volunteer at Local Park"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </Card>

          {/* Description */}
          <Card bordered padding="md">
            <label className="block type-label-caps text-on-surface-variant mb-2">
              Description
            </label>
            <textarea
              placeholder="Describe the quest and what participants need to do…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={4}
              className="w-full type-body-md rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface placeholder-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary resize-none"
            />
            <p className="type-body-sm text-on-surface-variant mt-1">
              {description.length} / 1000
            </p>
          </Card>

          {/* Category */}
          <Card bordered padding="md">
            <Input
              label="Category"
              placeholder="e.g., Volunteering, Local Experience, Dining"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={50}
            />
          </Card>

          {/* Business Name */}
          <Card bordered padding="md">
            <Input
              label="Business Name"
              placeholder="e.g., Central Park Conservancy"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={100}
            />
          </Card>

          {/* Location Name */}
          <Card bordered padding="md">
            <Input
              label="Location Name"
              placeholder="e.g., Central Park, NYC"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              maxLength={100}
            />
          </Card>

          {/* Latitude & Longitude */}
          <Card bordered padding="md" className="space-y-3">
            <p className="type-label-caps text-on-surface-variant">
              Coordinates
            </p>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="Latitude"
                step="0.0001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="w-full type-body-md rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface placeholder-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary"
              />
              <input
                type="number"
                placeholder="Longitude"
                step="0.0001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="w-full type-body-md rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface placeholder-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary"
              />
            </div>
            <p className="type-body-sm text-on-surface-variant text-xs">
              Enter decimal coordinates (e.g., 40.7829 for latitude)
            </p>
          </Card>

          {/* Reward Description */}
          <Card bordered padding="md">
            <Input
              label="Reward Description"
              placeholder="e.g., Free coffee voucher"
              value={rewardDescription}
              onChange={(e) => setRewardDescription(e.target.value)}
              maxLength={200}
            />
          </Card>

          {/* Proof Type */}
          <Card bordered padding="md">
            <label className="block type-label-caps text-on-surface-variant mb-2">
              Proof Type
            </label>
            <select
              value={proofType}
              onChange={(e) =>
                setProofType(e.target.value as "photo" | "checkin" | "none")
              }
              className="w-full type-body-md rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary"
            >
              <option value="photo">Photo Upload</option>
              <option value="checkin">Check-in</option>
              <option value="none">Auto-Complete (No Proof)</option>
            </select>
          </Card>

          {/* Thumbnail Upload */}
          <Card bordered padding="md">
            <p className="type-label-caps text-on-surface-variant mb-3">
              Quest Thumbnail
            </p>
            {thumbnailPreview ? (
              <div className="space-y-2">
                <div className="relative w-full aspect-video rounded-lg bg-surface-container overflow-hidden border border-outline-variant">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailPreview}
                    alt="Thumbnail preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  fullWidth
                  size="sm"
                  onClick={() => {
                    setThumbnailFile(null);
                    setThumbnailPreview(null);
                  }}
                >
                  Change Thumbnail
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-3 py-8 rounded-lg border-2 border-dashed border-outline-variant hover:border-secondary/50 bg-surface-container/50 hover:bg-surface-container cursor-pointer transition-colors">
                <Upload
                  size={32}
                  className="text-on-surface-variant"
                  aria-hidden="true"
                />
                <div className="text-center">
                  <p className="type-body-md font-medium text-on-surface">
                    Upload thumbnail
                  </p>
                  <p className="type-body-sm text-on-surface-variant">
                    JPG, PNG or WebP • Max 5 MB
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleThumbnailChange}
                />
              </label>
            )}
          </Card>

          {/* Submit */}
          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={isPending || uploadingThumbnail}
          >
            {isPending || uploadingThumbnail
              ? "Creating Quest…"
              : "Create Quest"}
          </Button>
        </form>
      </div>
    </div>
  );
}
