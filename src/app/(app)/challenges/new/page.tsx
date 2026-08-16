"use client";

/**
 * app/(app)/challenges/new/page.tsx — Create Challenge form
 *
 * All form state is local. No backend submission yet (Step 9 wires
 * Supabase persistence). Clicking "Create Challenge" logs form values
 * and navigates to /feed as a stub.
 *
 * Icons: lucide-react only.
 * Primitives: Card, Button, Input, Badge from @/components/ui.
 */

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  CloudUpload,
  Image as ImageIcon,
  Lock,
  MapPin,
  Rocket,
  Users,
  X,
} from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/* ── Zod schema — only the required fields need validation ──────────────── */
const schema = z.object({
  title:       z.string().min(1, "Title is required."),
  orgName:     z.string().optional(),
  category:    z.string().min(1, "Please select a category."),
  duration:    z.string().min(1, "Please select a duration."),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/* ── Selects & chips config ─────────────────────────────────────────────── */
const CATEGORIES = ["Coding", "Fitness", "Writing", "Reading", "Business"] as const;
const DURATIONS  = ["30 Days", "60 Days", "90 Days", "Indefinite"] as const;
const DEFAULT_PROOF_TYPES = ["Running GPS", "Gym Selfie", "Coding Screenshot", "Page Reading"] as const;

/* ── ToggleSwitch ────────────────────────────────────────────────────────── */
function ToggleSwitch({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={[
        "relative w-11 h-6 rounded-full transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
        checked ? "bg-secondary" : "bg-outline-variant",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm",
          "transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
      <span className="sr-only">{checked ? "On" : "Off"}</span>
    </button>
  );
}

/* ── Shared select styling ──────────────────────────────────────────────── */
const selectCls = [
  "w-full h-10 px-3 rounded border border-outline-variant",
  "bg-surface-container-lowest text-on-surface",
  "text-[length:var(--font-size-body-lg)]",
  "transition-colors duration-150",
  "focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary",
  "disabled:opacity-40",
  "appearance-none",
].join(" ");

/* ── Live Preview Card ───────────────────────────────────────────────────── */
function LivePreviewCard({
  title,
  orgName,
  duration,
  thumbnail,
}: {
  title: string;
  orgName: string;
  duration: string;
  thumbnail: string | null;
}) {
  return (
    <Card bordered padding="none" className="overflow-hidden w-full max-w-sm mx-auto">
      {/* Cover image / placeholder */}
      <div className="relative aspect-video w-full bg-surface-container flex items-center justify-center">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt="Challenge cover preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon size={36} className="text-on-surface-variant/30" aria-hidden="true" />
        )}
        {/* Duration badge */}
        {duration && (
          <div className="absolute top-2 left-2">
            <Badge variant="primary">{duration}</Badge>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2">
        <h3 className="type-headline-sm text-on-surface font-semibold leading-snug line-clamp-2">
          {title || (
            <span className="text-on-surface-variant/50 italic font-normal">
              Your challenge title…
            </span>
          )}
        </h3>
        <p className="text-xs text-on-surface-variant">
          by {orgName || "Your organisation"}
        </p>

        {/* Member avatars + join */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {/* Placeholder avatar stack */}
            <div className="flex -space-x-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full bg-secondary/20 border-2 border-surface-container-low"
                />
              ))}
            </div>
            <span className="text-[11px] text-on-surface-variant flex items-center gap-0.5">
              <Users size={11} aria-hidden="true" /> 0 joined
            </span>
          </div>
          <Button variant="primary" size="sm" type="button" tabIndex={-1}>
            JOIN
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function CreateChallengePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Local state (non-validated fields) ──────────────────────────────── */
  const [thumbnail, setThumbnail]               = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile]       = useState<File | null>(null);
  const [isDragging, setIsDragging]             = useState(false);
  const [visibility, setVisibility]             = useState<"public" | "private">("public");
  const [dailyProof, setDailyProof]             = useState(true);
  const [locationEnabled, setLocationEnabled]   = useState(false);
  const [proofTypes, setProofTypes]             = useState<string[]>(["Gym Selfie"]);
  const [showCustomInput, setShowCustomInput]   = useState(false);
  const [customInput, setCustomInput]           = useState("");
  const [submitError, setSubmitError]           = useState<string | null>(null);

  /* ── RHF ─────────────────────────────────────────────────────────────── */
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", orgName: "", category: "", duration: "", description: "" },
  });

  const [titleVal, orgNameVal, durationVal] = watch(["title", "orgName", "duration"]);
  const canSubmit = !!watch("title") && !!watch("category") && !!watch("duration");

  /* ── File handlers ───────────────────────────────────────────────────── */
  const loadFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setThumbnailFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setThumbnail(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  /* ── Proof type chips ────────────────────────────────────────────────── */
  const toggleProofType = (type: string) =>
    setProofTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );

  const addCustomChip = () => {
    const trimmed = customInput.trim();
    if (trimmed && !proofTypes.includes(trimmed)) {
      setProofTypes((prev) => [...prev, trimmed]);
    }
    setCustomInput("");
    setShowCustomInput(false);
  };

  /* ── Submit ──────────────────────────────────────────────────────────── */
  const onSubmit = async (data: FormValues) => {
    setSubmitError(null);
    const supabase = createClient();

    // 1. Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setSubmitError("You must be signed in to create a challenge.");
      return;
    }

    // 2. Upload thumbnail if selected
    let thumbnailUrl: string | null = null;
    if (thumbnailFile) {
      const ext = thumbnailFile.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/thumbnails/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("proof-media")
        .upload(path, thumbnailFile, { upsert: false });
      if (uploadError) {
        setSubmitError(`Thumbnail upload failed: ${uploadError.message}`);
        return;
      }
      const { data: { publicUrl } } = supabase.storage
        .from("proof-media")
        .getPublicUrl(path);
      thumbnailUrl = publicUrl;
    }

    // 3. Map duration string → integer (null = Indefinite)
    const durationMap: Record<string, number | null> = {
      "30 Days": 30,
      "60 Days": 60,
      "90 Days": 90,
      "Indefinite": null,
    };
    const durationDays = durationMap[data.duration] ?? null;

    // 4. Insert challenge row
    const { data: challenge, error: insertError } = await supabase
      .from("challenges")
      .insert({
        title: data.title,
        description: data.description || null,
        category: data.category,
        duration_days: durationDays,
        visibility,
        proof_methods: proofTypes,
        thumbnail_url: thumbnailUrl,
        creator_id: user.id,
      })
      .select("id")
      .single();

    if (insertError || !challenge) {
      setSubmitError(insertError?.message ?? "Failed to create challenge.");
      return;
    }

    // 5. Auto-join creator as first participant
    await supabase.from("challenge_participants").insert({
      challenge_id: challenge.id,
      user_id: user.id,
      status: "active",
    });

    // 6. Redirect to the new challenge page
    router.push(`/challenges/${challenge.id}`);
  };

  /* ── Locked tab tooltip ──────────────────────────────────────────────── */
  function LockedTab({ label }: { label: string }) {
    return (
      <div className="relative group">
        <button
          type="button"
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-on-surface-variant/50 cursor-not-allowed select-none"
          aria-disabled="true"
          tabIndex={-1}
        >
          <Lock size={13} aria-hidden="true" />
          {label}
        </button>
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block group-focus-within:block z-50 pointer-events-none">
          <div className="bg-on-surface text-surface text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
            Coming soon
          </div>
          <div className="w-2 h-2 bg-on-surface rotate-45 mx-auto -mt-1" />
        </div>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-surface">

      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-outline-variant">
        <div className="max-w-2xl mx-auto px-4">
          {/* Top row */}
          <div className="flex items-center justify-between h-14">
            <button
              type="button"
              onClick={() => router.back()}
              className="w-9 h-9 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors"
              aria-label="Close"
            >
              <X size={20} aria-hidden="true" />
            </button>

            <div className="text-center">
              <p className="type-headline-sm text-on-surface font-semibold leading-tight">
                Create Challenge
              </p>
              <p className="text-[10px] text-on-surface-variant leading-tight">
                Build consistency in your community
              </p>
            </div>

            <button
              type="button"
              className="text-sm text-secondary font-semibold hover:underline transition-colors"
              onClick={() => console.log("Save draft:", watch())}
            >
              Save Draft
            </button>
          </div>

          {/* Tab row */}
          <div className="flex border-b border-outline-variant -mx-4 px-4">
            <button
              type="button"
              className="px-4 py-2.5 text-sm font-semibold text-secondary border-b-2 border-secondary"
            >
              Basic
            </button>
            <LockedTab label="Personal Branding" />
            <LockedTab label="Business" />
          </div>
        </div>
      </header>

      {/* ── Form ──────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-8 pb-48 md:pb-32">

          {/* Submit error banner */}
          {submitError && (
            <div
              role="alert"
              className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-error text-sm"
            >
              {submitError}
            </div>
          )}

          {/* ── Section 1: Challenge Essentials ─────────────────────── */}

          <section aria-label="Challenge Essentials">
            <h2 className="type-headline-sm text-on-surface font-semibold mb-4">
              Challenge Essentials
            </h2>

            <div className="space-y-4">
              {/* Title */}
              <Input
                id="challenge-title"
                label="Challenge Title"
                placeholder="e.g. 100 Days of LeetCode"
                error={errors.title?.message}
                {...register("title")}
              />

              {/* Thumbnail upload */}
              <div className="flex flex-col gap-1">
                <label className="type-body-md font-medium text-on-surface">
                  Thumbnail
                </label>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  aria-label="Upload thumbnail image"
                  className={[
                    "relative w-full aspect-video rounded-lg border-2 border-dashed",
                    "flex flex-col items-center justify-center gap-2",
                    "cursor-pointer transition-colors duration-150",
                    isDragging
                      ? "border-secondary bg-secondary/5"
                      : "border-outline-variant bg-surface-container-lowest hover:border-secondary hover:bg-surface-container",
                  ].join(" ")}
                >
                  {thumbnail ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnail}
                        alt="Thumbnail preview"
                        className="absolute inset-0 w-full h-full object-cover rounded-lg"
                      />
                      <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <span className="text-white text-sm font-medium">Change image</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <CloudUpload
                        size={32}
                        className="text-on-surface-variant/50"
                        aria-hidden="true"
                      />
                      <div className="text-center">
                        <p className="type-body-md text-on-surface-variant text-sm">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-on-surface-variant/60 mt-0.5">
                          High-resolution PNG or JPG recommended
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={handleFileInput}
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>

              {/* Org Name + Category side by side */}
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="challenge-org"
                  label="Organisation Name"
                  placeholder="e.g. Dev Collective"
                  {...register("orgName")}
                />
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="challenge-category"
                    className="type-body-md font-medium text-on-surface"
                  >
                    Category
                  </label>
                  <select
                    id="challenge-category"
                    className={[
                      selectCls,
                      errors.category
                        ? "border-error focus:ring-error/30 focus:border-error"
                        : "",
                    ].join(" ")}
                    aria-invalid={!!errors.category}
                    {...register("category")}
                  >
                    <option value="">Select…</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {errors.category && (
                    <p className="type-body-md text-error text-xs" role="alert">
                      {errors.category.message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 2: Duration + Visibility + Description ──────── */}
          <section aria-label="Duration and Visibility">
            <div className="space-y-4">
              {/* Duration + Visibility side by side */}
              <div className="grid grid-cols-2 gap-3">
                {/* Duration */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="challenge-duration"
                    className="type-body-md font-medium text-on-surface"
                  >
                    Duration
                  </label>
                  <select
                    id="challenge-duration"
                    className={[
                      selectCls,
                      errors.duration
                        ? "border-error focus:ring-error/30 focus:border-error"
                        : "",
                    ].join(" ")}
                    aria-invalid={!!errors.duration}
                    {...register("duration")}
                  >
                    <option value="">Select…</option>
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  {errors.duration && (
                    <p className="type-body-md text-error text-xs" role="alert">
                      {errors.duration.message}
                    </p>
                  )}
                </div>

                {/* Visibility segmented control */}
                <div className="flex flex-col gap-1">
                  <span
                    id="visibility-label"
                    className="type-body-md font-medium text-on-surface"
                  >
                    Visibility
                  </span>
                  <div
                    role="group"
                    aria-labelledby="visibility-label"
                    className="flex rounded border border-outline-variant overflow-hidden h-10"
                  >
                    {(["public", "private"] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setVisibility(opt)}
                        aria-pressed={visibility === opt}
                        className={[
                          "flex-1 text-sm font-medium capitalize transition-colors duration-150",
                          opt === "private" ? "border-l border-outline-variant" : "",
                          visibility === opt
                            ? "bg-secondary text-on-secondary"
                            : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container",
                        ].join(" ")}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Description textarea */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="challenge-description"
                  className="type-body-md font-medium text-on-surface"
                >
                  Description
                </label>
                <textarea
                  id="challenge-description"
                  rows={4}
                  placeholder="Describe what this challenge is about, what participants will gain, and what's expected of them…"
                  className={[
                    "w-full px-3 py-2 rounded border border-outline-variant",
                    "bg-surface-container-lowest text-on-surface",
                    "placeholder:text-on-surface-variant",
                    "text-[length:var(--font-size-body-lg)]",
                    "resize-none transition-colors duration-150",
                    "focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary",
                  ].join(" ")}
                  {...register("description")}
                />
              </div>
            </div>
          </section>

          {/* ── Section 3: Daily Proof Required ─────────────────────── */}
          <section aria-label="Daily Proof Settings">
            <Card bordered padding="md" className="space-y-4">
              {/* Toggle row */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="type-body-md font-semibold text-on-surface">
                    Daily Proof Required
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Participants must upload evidence daily
                  </p>
                </div>
                <ToggleSwitch
                  id="daily-proof-toggle"
                  checked={dailyProof}
                  onChange={() => setDailyProof((v) => !v)}
                />
              </div>

              {/* Proof type chips — visible when toggle is on */}
              {dailyProof && (
                <div className="space-y-2">
                  <p className="type-label-caps text-on-surface-variant text-[10px]">
                    SUGGESTED PROOF TYPES
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_PROOF_TYPES.map((type) => {
                      const selected = proofTypes.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleProofType(type)}
                          aria-pressed={selected}
                          className={[
                            "h-8 px-3 rounded-full border text-sm font-medium",
                            "transition-colors duration-150",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1",
                            selected
                              ? "bg-secondary text-on-secondary border-secondary"
                              : "bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:bg-surface-container",
                          ].join(" ")}
                        >
                          {type}
                        </button>
                      );
                    })}

                    {/* Custom chips */}
                    {proofTypes
                      .filter((t) => !(DEFAULT_PROOF_TYPES as readonly string[]).includes(t))
                      .map((custom) => (
                        <button
                          key={custom}
                          type="button"
                          onClick={() => toggleProofType(custom)}
                          aria-pressed={true}
                          className="h-8 px-3 rounded-full border bg-secondary text-on-secondary border-secondary text-sm font-medium"
                        >
                          {custom} ×
                        </button>
                      ))}

                    {/* + Add Custom */}
                    {showCustomInput ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="text"
                          value={customInput}
                          onChange={(e) => setCustomInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); addCustomChip(); }
                            if (e.key === "Escape") { setShowCustomInput(false); setCustomInput(""); }
                          }}
                          placeholder="Type & press Enter"
                          className={[
                            "h-8 px-3 rounded-full border border-secondary",
                            "bg-surface-container-lowest text-on-surface",
                            "text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30",
                            "w-40",
                          ].join(" ")}
                        />
                        <button
                          type="button"
                          onClick={addCustomChip}
                          className="text-secondary text-sm font-semibold hover:underline"
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowCustomInput(true)}
                        className={[
                          "h-8 px-3 rounded-full border border-dashed border-outline-variant",
                          "text-on-surface-variant text-sm hover:bg-surface-container transition-colors",
                        ].join(" ")}
                      >
                        + Add Custom
                      </button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </section>

          {/* ── Section 4: Enable Location ───────────────────────────── */}
          <section aria-label="Location Settings">
            <Card bordered padding="md">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin size={18} className="text-secondary" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="type-body-md font-semibold text-on-surface">
                      Enable Location
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Tag challenges to a physical spot
                    </p>
                  </div>
                </div>
                <ToggleSwitch
                  id="location-toggle"
                  checked={locationEnabled}
                  onChange={() => setLocationEnabled((v) => !v)}
                />
              </div>
            </Card>
          </section>

          {/* ── Live card preview ────────────────────────────────────── */}
          <section aria-label="Live card preview">
            <p className="type-label-caps text-on-surface-variant text-[10px] mb-3">
              LIVE CARD PREVIEW
            </p>
            <LivePreviewCard
              title={titleVal}
              orgName={orgNameVal ?? ""}
              duration={durationVal}
              thumbnail={thumbnail}
            />
          </section>

        </div>

        {/* ── Sticky bottom action bar ─────────────────────────────────── */}
        <div className="fixed bottom-16 md:bottom-0 left-0 md:left-64 right-0 z-30 bg-surface/95 backdrop-blur-sm border-t border-outline-variant px-4 py-3">
          <div className="max-w-2xl mx-auto flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="flex-shrink-0"
            >
              Back
            </Button>
            <Button
              id="create-challenge-btn"
              type="submit"
              variant="primary"
              fullWidth
              disabled={!canSubmit || isSubmitting}
            >
              <Rocket size={16} aria-hidden="true" className="mr-1.5" />
              {isSubmitting ? "Creating…" : "Create Challenge"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
