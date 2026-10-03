"use client";

/**
 * app/(app)/challenges/new/page.tsx — Create Challenge form
 *
 * Adds an inline "Tasks" section (optional) below the existing fields.
 * On submit: creates the challenge, uploads tasks in order, auto-joins creator.
 * If task inserts fail after the challenge row exists, a clear error is shown.
 */

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BadgeCheck,
  Briefcase,
  CloudUpload,
  GripVertical,
  Image as ImageIcon,
  MapPin,
  PenSquare,
  Receipt,
  Store,
  Plus,
  Rocket,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { CreatorPlans } from "@/components/features/CreatorPlans";

/* ── Zod schema ─────────────────────────────────────────────────────────── */
const schema = z.object({
  title:       z.string().min(1, "Title is required."),
  orgName:     z.string().optional(),
  category:    z.string().min(1, "Please select a category."),
  duration:    z.string().min(1, "Please select a duration."),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/* ── Task row type (local form state) ────────────────────────────────────── */
interface TaskRow {
  key: string;       // unique local key for React
  title: string;
  description: string;
  proofType: string; // 'photo' | 'video' | 'text' | 'link' | 'none'
  isRequired: boolean;
}

const PROOF_TYPES = ["photo", "video", "text", "link", "none"] as const;

/* ── Config ────────────────────────────────────────────────────────────── */
const CATEGORIES = ["Coding", "Fitness", "Writing", "Reading", "Business"] as const;
const DURATIONS  = ["30 Days", "60 Days", "90 Days", "Indefinite"] as const;
const DEFAULT_PROOF_TYPES = ["Running GPS", "Gym Selfie", "Coding Screenshot", "Page Reading"] as const;

/* ── ToggleSwitch ────────────────────────────────────────────────────────── */
function ToggleSwitch({ id, checked, onChange }: {
  id: string; checked: boolean; onChange: () => void;
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
      <span className={[
        "absolute top-1 left-1 w-4 h-4 rounded-full bg-white elev-1",
        "transition-transform duration-200",
        checked ? "translate-x-5" : "translate-x-0",
      ].join(" ")} />
      <span className="sr-only">{checked ? "On" : "Off"}</span>
    </button>
  );
}

/* ── Select styling ─────────────────────────────────────────────────────── */
const selectCls = [
  "w-full h-10 px-3 rounded border border-outline-variant",
  "bg-surface-container-lowest text-on-surface",
  "text-[length:var(--text-body-lg)]",
  "transition-colors duration-150",
  "focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary",
  "disabled:opacity-40 appearance-none",
].join(" ");

/* ── TaskRowEditor ───────────────────────────────────────────────────────── */
function TaskRowEditor({ task, index, onChange, onRemove }: {
  task: TaskRow;
  index: number;
  onChange: (updated: TaskRow) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3 elev-1 surface-raised">
      <div className="flex items-center gap-2">
        <GripVertical size={16} className="text-on-surface-variant/40 flex-shrink-0 cursor-grab" aria-hidden="true" />
        <span className="text-xs font-semibold text-on-surface-variant flex-shrink-0">Task {index + 1}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove task ${index + 1}`}
          className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-error-container hover:text-error transition-colors"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Title */}
      <div>
        <input aria-label="Task title (required)"
          type="text"
          value={task.title}
          onChange={(e) => onChange({ ...task, title: e.target.value })}
          placeholder="Task title (required)"
          required
          className={[
            "w-full h-9 px-3 rounded border border-outline-variant",
            "bg-surface text-on-surface text-sm",
            "placeholder:text-on-surface-variant/80",
            "focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary transition-colors",
          ].join(" ")}
        />
      </div>

      {/* Description */}
      <textarea aria-label="Description (optional)"
        value={task.description}
        onChange={(e) => onChange({ ...task, description: e.target.value })}
        placeholder="Description (optional)"
        rows={2}
        className={[
          "w-full px-3 py-2 rounded border border-outline-variant",
          "bg-surface text-on-surface text-sm resize-none",
          "placeholder:text-on-surface-variant/80",
          "focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary transition-colors",
        ].join(" ")}
      />

      <div className="flex items-center gap-3 flex-wrap">
        {/* Proof type select */}
        <div className="flex items-center gap-2 flex-1 min-w-32">
          <label className="text-xs text-on-surface-variant whitespace-nowrap">Proof type</label>
          <select aria-label="Proof type"
            value={task.proofType}
            onChange={(e) => onChange({ ...task, proofType: e.target.value })}
            className="flex-1 h-8 px-2 rounded border border-outline-variant bg-surface text-on-surface text-xs appearance-none focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary"
          >
            {PROOF_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Required toggle */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-on-surface-variant">Required</label>
          <ToggleSwitch
            id={`task-required-${task.key}`}
            checked={task.isRequired}
            onChange={() => onChange({ ...task, isRequired: !task.isRequired })}
          />
        </div>
      </div>
    </div>
  );
}

/* ── LivePreviewCard ─────────────────────────────────────────────────────── */
function LivePreviewCard({ title, orgName, duration, thumbnail }: {
  title: string; orgName: string; duration: string; thumbnail: string | null;
}) {
  return (
    <Card bordered padding="none" className="overflow-hidden w-full max-w-sm mx-auto">
      <div className="relative aspect-video w-full bg-surface-container flex items-center justify-center">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="Challenge cover preview" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={36} className="text-on-surface-variant/30" aria-hidden="true" />
        )}
        {duration && (
          <div className="absolute top-2 left-2">
            <Badge variant="primary">{duration}</Badge>
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <h3 className="text-headline-md text-on-surface font-semibold leading-snug line-clamp-2">
          {title || <span className="text-on-surface-variant italic font-normal">Your challenge title…</span>}
        </h3>
        <p className="text-xs text-on-surface-variant">by {orgName || "Your organisation"}</p>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-6 h-6 rounded-full bg-secondary/20 border-2 border-surface-container-low" />
              ))}
            </div>
            <span className="text-label-sm text-on-surface-variant flex items-center gap-0.5">
              <Users size={11} aria-hidden="true" /> 0 joined
            </span>
          </div>
          <Button variant="primary" size="sm" type="button" tabIndex={-1}>JOIN</Button>
        </div>
      </div>
    </Card>
  );
}

/* ── Creation modes ──────────────────────────────────────────────────────── */
type Mode = "basic" | "branding" | "business";

const MODES: { key: Mode; label: string; icon: typeof PenSquare }[] = [
  { key: "basic",    label: "Basic",             icon: PenSquare  },
  { key: "branding", label: "Personal Branding", icon: BadgeCheck },
  { key: "business", label: "Business",          icon: Briefcase  },
];

function BrandingPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h2 className="text-headline-md text-on-surface font-semibold">Personal Branding</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Promote your challenge and build your personal brand with professional visibility tools.
        </p>
      </div>
      <CreatorPlans />
      <button type="button" onClick={onBack}
        className="w-full h-12 rounded-xl bg-primary text-on-primary text-sm font-bold">
        Continue with a free Basic challenge →
      </button>
    </div>
  );
}

const BUSINESS_STEPS = [
  { icon: Store,      title: "Set up your business page", desc: "Logo, location, category and contact details." },
  { icon: PenSquare,  title: "Create a quest",            desc: "e.g. “Dine 3 times this month → free dessert”." },
  { icon: Receipt,    title: "Verify real visits",        desc: "Confirm customers actually visited before progress counts." },
  { icon: BadgeCheck, title: "Reward & measure",          desc: "Rewards unlock automatically; track visits and repeat customers." },
];

function BusinessPanel() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h2 className="text-headline-md text-on-surface font-semibold">Business Quests</h2>
        <p className="text-sm font-semibold text-secondary mt-1">Don&apos;t just advertise. Give people a reason to visit, act and return.</p>
        <p className="text-sm text-on-surface-variant mt-1">
          Businesses create Quests — real-world actions at your store, café, gym or restaurant that customers complete for a reward.
        </p>
      </div>
      <ol className="rounded-2xl border border-outline-variant bg-surface-container-lowest divide-y divide-outline-variant elev-1 surface-raised">
        {BUSINESS_STEPS.map(({ icon: Icon, title, desc }, i) => (
          <li key={title} className="flex items-start gap-3 p-4">
            <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
              <Icon size={18} className="text-secondary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">{i + 1}. {title}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{desc}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link href="/business"
        className="flex w-full h-12 items-center justify-center rounded-xl bg-primary text-on-primary text-sm font-bold">
        Continue as Business →
      </Link>
      <p className="text-center text-xs text-on-surface-variant">
        Takes you to business setup. Existing business accounts go straight to their dashboard.
      </p>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function CreateChallengePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Local state ─────────────────────────────────────────────────────── */
  const [thumbnail, setThumbnail]             = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile]     = useState<File | null>(null);
  const [isDragging, setIsDragging]           = useState(false);
  const [visibility, setVisibility]           = useState<"public" | "private">("public");
  const [dailyProof, setDailyProof]           = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [proofTypes, setProofTypes]           = useState<string[]>(["Gym Selfie"]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInput, setCustomInput]         = useState("");
  const [submitError, setSubmitError]         = useState<string | null>(null);
  const [mode, setMode]                       = useState<Mode>("basic");

  /* ── Task rows state ─────────────────────────────────────────────────── */
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  const addTask = () =>
    setTasks((prev) => [...prev, {
      key: crypto.randomUUID(),
      title: "",
      description: "",
      proofType: "photo",
      isRequired: true,
    }]);

  const updateTask = (key: string, updated: TaskRow) =>
    setTasks((prev) => prev.map((t) => (t.key === key ? updated : t)));

  const removeTask = (key: string) =>
    setTasks((prev) => prev.filter((t) => t.key !== key));

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
    setProofTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]);

  const addCustomChip = () => {
    const trimmed = customInput.trim();
    if (trimmed && !proofTypes.includes(trimmed)) setProofTypes((prev) => [...prev, trimmed]);
    setCustomInput("");
    setShowCustomInput(false);
  };

  /* ── Submit ──────────────────────────────────────────────────────────── */
  const onSubmit = async (data: FormValues) => {
    setSubmitError(null);
    const supabase = createClient();

    // Validate tasks — all must have a title
    const invalidTask = tasks.find((t) => !t.title.trim());
    if (invalidTask) {
      setSubmitError("All tasks must have a title. Fill in or remove empty tasks before submitting.");
      return;
    }

    // 1. Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setSubmitError("You must be signed in to create a challenge.");
      return;
    }

    // 2. Upload thumbnail
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
      const { data: { publicUrl } } = supabase.storage.from("proof-media").getPublicUrl(path);
      thumbnailUrl = publicUrl;
    }

    // 3. Duration map
    const durationMap: Record<string, number | null> = {
      "30 Days": 30, "60 Days": 60, "90 Days": 90, "Indefinite": null,
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

    const challengeId = challenge.id as string;

    // 5. Insert task rows (if any)
    if (tasks.length > 0) {
      const taskRows = tasks.map((t, idx) => ({
        challenge_id: challengeId,
        title: t.title.trim(),
        description: t.description.trim() || null,
        proof_type: t.proofType,
        is_required: t.isRequired,
        sort_order: idx,
      }));

      const { error: tasksError } = await supabase
        .from("challenge_tasks")
        .insert(taskRows);

      if (tasksError) {
        // Challenge exists but tasks failed — show a clear error with the challenge link
        setSubmitError(
          `Challenge was created (ID: ${challengeId}) but task insertion failed: ${tasksError.message}. ` +
          `You can add tasks later via the "Manage Tasks" link on the challenge page.`
        );
        // Still redirect so the challenge isn't orphaned
        router.push(`/challenges/${challengeId}`);
        return;
      }
    }

    // 6. Auto-join creator
    await supabase.from("challenge_participants").insert({
      challenge_id: challengeId,
      user_id: user.id,
      status: "active",
    });

    // 7. Redirect
    router.push(`/challenges/${challengeId}`);
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-surface">

      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 pt-safe z-40 bg-surface/95 backdrop-blur-sm border-b border-outline-variant">
        <div className="max-w-2xl mx-auto px-4">
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
              <p className="text-headline-md text-on-surface font-semibold leading-tight">Create Challenge</p>
              <p className="text-label-sm text-on-surface-variant leading-tight">Build consistency in your community</p>
            </div>
            <button
              type="button"
              className="text-sm text-secondary font-semibold hover:underline transition-colors"
              onClick={() => console.log("Save draft:", watch())}
            >
              Save Draft
            </button>
          </div>
          <div role="tablist" aria-label="Challenge type" className="flex -mx-4">
            {MODES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => setMode(key)}
                className={[
                  "flex-1 flex flex-col items-center gap-1 pt-2 pb-2.5 text-xs font-semibold border-b-2 transition-colors",
                  mode === key
                    ? "text-secondary border-secondary"
                    : "text-on-surface-variant border-transparent hover:text-on-surface",
                ].join(" ")}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {mode === "branding" && <BrandingPanel onBack={() => setMode("basic")} />}
      {mode === "business" && <BusinessPanel />}

      {/* ── Form ──────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate hidden={mode !== "basic"}>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-8 pb-48 md:pb-32">

          {/* Submit error banner */}
          {submitError && (
            <div role="alert" className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-error text-sm">
              {submitError}
            </div>
          )}

          {/* ── Section 1: Challenge Essentials ─────────────────────── */}
          <section aria-label="Challenge Essentials">
            <h2 className="text-headline-md text-on-surface font-semibold mb-4">Challenge Essentials</h2>
            <div className="space-y-4">
              <Input
                id="challenge-title"
                label="Challenge Title"
                placeholder="e.g. 100 Days of LeetCode"
                error={errors.title?.message}
                {...register("title")}
              />

              {/* Thumbnail upload */}
              <div className="flex flex-col gap-1">
                <label className="text-body-md font-medium text-on-surface">Thumbnail</label>
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
                    "flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors duration-150",
                    isDragging
                      ? "border-secondary bg-secondary/5"
                      : "border-outline-variant bg-surface-container-lowest hover:border-secondary hover:bg-surface-container",
                  ].join(" ")}
                >
                  {thumbnail ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbnail} alt="Thumbnail preview" className="absolute inset-0 w-full h-full object-cover rounded-lg" />
                      <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <span className="text-white text-sm font-medium">Change image</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <CloudUpload size={32} className="text-on-surface-variant/50" aria-hidden="true" />
                      <div className="text-center">
                        <p className="text-body-md text-on-surface-variant text-sm">Click to upload or drag and drop</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">High-resolution PNG or JPG recommended</p>
                      </div>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleFileInput} aria-hidden="true" tabIndex={-1} />
              </div>

              {/* Org Name + Category */}
              <div className="grid grid-cols-2 gap-3">
                <Input id="challenge-org" label="Organisation Name" placeholder="e.g. Dev Collective" {...register("orgName")} />
                <div className="flex flex-col gap-1">
                  <label htmlFor="challenge-category" className="text-body-md font-medium text-on-surface">Category</label>
                  <select
                    id="challenge-category"
                    className={[selectCls, errors.category ? "border-error focus:ring-error/30 focus:border-error" : ""].join(" ")}
                    aria-invalid={!!errors.category}
                    {...register("category")}
                  >
                    <option value="">Select…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {errors.category && <p className="text-body-md text-error text-xs" role="alert">{errors.category.message}</p>}
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 2: Duration + Visibility + Description ──────── */}
          <section aria-label="Duration and Visibility">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="challenge-duration" className="text-body-md font-medium text-on-surface">Duration</label>
                  <select
                    id="challenge-duration"
                    className={[selectCls, errors.duration ? "border-error focus:ring-error/30 focus:border-error" : ""].join(" ")}
                    aria-invalid={!!errors.duration}
                    {...register("duration")}
                  >
                    <option value="">Select…</option>
                    {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {errors.duration && <p className="text-body-md text-error text-xs" role="alert">{errors.duration.message}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <span id="visibility-label" className="text-body-md font-medium text-on-surface">Visibility</span>
                  <div role="group" aria-labelledby="visibility-label" className="flex rounded border border-outline-variant overflow-hidden h-10">
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
              <div className="flex flex-col gap-1">
                <label htmlFor="challenge-description" className="text-body-md font-medium text-on-surface">Description</label>
                <textarea
                  id="challenge-description"
                  rows={4}
                  placeholder="Describe what this challenge is about, what participants will gain, and what's expected of them…"
                  className={[
                    "w-full px-3 py-2 rounded border border-outline-variant",
                    "bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant",
                    "text-[length:var(--text-body-lg)] resize-none transition-colors duration-150",
                    "focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary",
                  ].join(" ")}
                  {...register("description")}
                />
              </div>
            </div>
          </section>

          {/* ── Section 3: Tasks (Optional) ──────────────────────────── */}
          <section aria-label="Challenge Tasks">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-headline-md text-on-surface font-semibold">Tasks</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Optional — define discrete tasks participants must complete.
                  If you skip this, the challenge uses a single daily proof upload instead.
                </p>
              </div>
              {tasks.length > 0 && (
                <span className="text-xs font-semibold text-secondary bg-secondary/10 rounded-full px-2.5 py-0.5">
                  {tasks.length} task{tasks.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="space-y-3">
              {tasks.map((task, idx) => (
                <TaskRowEditor
                  key={task.key}
                  task={task}
                  index={idx}
                  onChange={(updated) => updateTask(task.key, updated)}
                  onRemove={() => removeTask(task.key)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addTask}
              className={[
                "mt-3 w-full h-10 rounded-xl border-2 border-dashed border-outline-variant",
                "flex items-center justify-center gap-2",
                "text-sm text-on-surface-variant font-medium",
                "hover:border-secondary hover:text-secondary hover:bg-secondary/5 transition-colors",
              ].join(" ")}
            >
              <Plus size={16} aria-hidden="true" />
              {tasks.length === 0 ? "Add tasks (optional)" : "Add another task"}
            </button>
          </section>

          {/* ── Section 4: Daily Proof Required ─────────────────────── */}
          <section aria-label="Daily Proof Settings">
            <Card bordered padding="md" className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body-md font-semibold text-on-surface">Daily Proof Required</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Participants must upload evidence daily</p>
                </div>
                <ToggleSwitch id="daily-proof-toggle" checked={dailyProof} onChange={() => setDailyProof((v) => !v)} />
              </div>
              {dailyProof && (
                <div className="space-y-2">
                  <p className="text-overline text-on-surface-variant text-label-sm">SUGGESTED PROOF TYPES</p>
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
                            "h-8 px-3 rounded-full border text-sm font-medium transition-colors duration-150",
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
                    {proofTypes.filter((t) => !(DEFAULT_PROOF_TYPES as readonly string[]).includes(t)).map((custom) => (
                      <button key={custom} type="button" onClick={() => toggleProofType(custom)} aria-pressed={true}
                        className="h-8 px-3 rounded-full border bg-secondary text-on-secondary border-secondary text-sm font-medium">
                        {custom} ×
                      </button>
                    ))}
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
                          className="h-8 px-3 rounded-full border border-secondary bg-surface-container-lowest text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 w-40"
                        />
                        <button type="button" onClick={addCustomChip} className="text-secondary text-sm font-semibold hover:underline">Add</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setShowCustomInput(true)}
                        className="h-8 px-3 rounded-full border border-dashed border-outline-variant text-on-surface-variant text-sm hover:bg-surface-container transition-colors">
                        + Add Custom
                      </button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </section>

          {/* ── Section 5: Enable Location ───────────────────────────── */}
          <section aria-label="Location Settings">
            <Card bordered padding="md">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin size={18} className="text-secondary" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-body-md font-semibold text-on-surface">Enable Location</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">Tag challenges to a physical spot</p>
                  </div>
                </div>
                <ToggleSwitch id="location-toggle" checked={locationEnabled} onChange={() => setLocationEnabled((v) => !v)} />
              </div>
            </Card>
          </section>

          {/* ── Live card preview ────────────────────────────────────── */}
          <section aria-label="Live card preview">
            <p className="text-overline text-on-surface-variant text-label-sm mb-3">LIVE CARD PREVIEW</p>
            <LivePreviewCard title={titleVal} orgName={orgNameVal ?? ""} duration={durationVal} thumbnail={thumbnail} />
          </section>

        </div>

        {/* ── Sticky bottom action bar ─────────────────────────────────── */}
        <div className="fixed above-bottom-nav z-30 bg-surface/95 backdrop-blur-sm border-t border-outline-variant px-4 py-3">
          <div className="max-w-2xl mx-auto flex gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()} className="flex-shrink-0">Back</Button>
            <Button
              id="create-challenge-btn"
              type="submit"
              variant="primary"
              fullWidth
              disabled={!canSubmit || isSubmitting}
            >
              <Rocket size={16} aria-hidden="true" className="mr-1.5" />
              {isSubmitting ? "Creating…" : tasks.length > 0 ? `Create Challenge (${tasks.length} task${tasks.length > 1 ? "s" : ""})` : "Create Challenge"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
