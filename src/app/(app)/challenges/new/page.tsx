"use client";

/**
 * app/(app)/challenges/new/page.tsx — Create Challenge form
 *
 * Adds an inline "Tasks" section (optional) below the existing fields.
 * On submit: creates the challenge, uploads tasks in order, auto-joins creator.
 * If task inserts fail after the challenge row exists, a clear error is shown.
 */

import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BadgeCheck,
  Briefcase,
  Check,
  Globe,
  Lock,
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
import { getMyBusinessProfile } from "@/lib/data/business";
import { compressImage, IMAGE_PRESETS } from "@/lib/image";
import { ensureInviteCode, inviteUrl } from "@/lib/data/invites";
import { CoverPicker } from "@/components/features/challenge/CoverPicker";
import { CategoryPicker } from "@/components/features/challenge/CategoryPicker";
import {
  DurationPicker,
  type DurationChoice,
} from "@/components/features/challenge/DurationPicker";
import {
  StakePicker,
  type StakeChoice,
} from "@/components/features/challenge/StakePicker";
import { ProofSummary } from "@/components/features/challenge/ProofSummary";
import {
  coverToFile,
  inferProof,
  PROOF_OPTIONS,
  type CoverPreset,
} from "@/lib/challenges/presets";
import { CreatorPlans } from "@/components/features/CreatorPlans";
import {
  PhysicalActivityConfigFields,
  DEFAULT_PHYSICAL_CONFIG,
  type PhysicalConfigDraft,
} from "@/components/features/activity/PhysicalActivityConfigFields";
import { upsertChallengeTaskActivityConfig } from "@/lib/data/activity";
import {
  ProofRequirementPicker,
  type ProofRequirementDraft,
} from "@/components/features/proof/ProofRequirementPicker";
import { upsertChallengeTaskProofRequirement } from "@/lib/data/proofRequirements";

/* ── Zod schema ─────────────────────────────────────────────────────────── */
// Duration is not here. It is no longer a text value a <select> produces — it
// is a number of days, sometimes null for ongoing — so it lives beside the
// form as state and is checked in onSubmit, the way visibility and the cover
// already are. orgName is gone entirely; see the note on LivePreviewCard.
const schema = z.object({
  title:       z.string().min(1, "Title is required."),
  category:    z.string().min(1, "Please select a category."),
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

// "physical_activity" is verified automatically from the in-app step counter —
// see docs/physical-activity.md. Everything else needs a human to look at it.
const PROOF_TYPES = ["photo", "video", "text", "link", "none", "physical_activity"] as const;

const PROOF_TYPE_LABELS: Record<string, string> = {
  photo: "photo",
  video: "video",
  text: "text",
  link: "link",
  none: "none",
  physical_activity: "🏃 steps",
};

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

/* ── TaskRowEditor ───────────────────────────────────────────────────────── */
function TaskRowEditor({ task, index, onChange, onRemove, physicalConfig, onPhysicalConfigChange, proofRequirement, onProofRequirementChange }: {
  task: TaskRow;
  index: number;
  onChange: (updated: TaskRow) => void;
  onRemove: () => void;
  physicalConfig: PhysicalConfigDraft;
  onPhysicalConfigChange: (next: PhysicalConfigDraft) => void;
  proofRequirement: ProofRequirementDraft | null;
  onProofRequirementChange: (next: ProofRequirementDraft | null) => void;
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
          className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-error-container hover:text-error transition-colors tap-target"
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
            className="flex-1 h-8 px-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-xs appearance-none focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary tap-target"
          >
            {PROOF_TYPES.map((t) => (
              <option key={t} value={t}>{PROOF_TYPE_LABELS[t] ?? t}</option>
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

      {task.proofType === "physical_activity" && (
        <PhysicalActivityConfigFields
          value={physicalConfig}
          onChange={onPhysicalConfigChange}
        />
      )}

      {/* Steps verify themselves from the counter, and "none" asks for nothing —
          neither needs a photo spec. Everything else is judged against one. */}
      {task.proofType !== "physical_activity" && task.proofType !== "none" && (
        <ProofRequirementPicker
          value={proofRequirement}
          onChange={onProofRequirementChange}
          taskTitle={task.title}
          taskDescription={task.description}
        />
      )}
    </div>
  );
}

/* ── LivePreviewCard ─────────────────────────────────────────────────────── */
/**
 * There used to be an "Organisation Name" field above this card, feeding the
 * byline. It was asked for on every challenge and then dropped: `challenges`
 * has no organisation column and the insert never carried it, so whatever a
 * creator typed reached the preview and nothing else. The byline is now the
 * creator, which is what the published card actually shows — getFeaturedChallenges
 * reads it from profiles.full_name.
 */
function LivePreviewCard({ title, creatorName, duration, thumbnail }: {
  title: string; creatorName: string; duration: string; thumbnail: string | null;
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
        <p className="text-xs text-on-surface-variant">by {creatorName}</p>
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
    <div className="mx-auto measure-form px-4 py-6 space-y-5">
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
    <div className="mx-auto measure-form px-4 py-6 space-y-5">
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
/* useSearchParams needs a Suspense boundary above it, or this route cannot be
   prerendered at all. The form itself is unchanged. */
export default function CreateChallengePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <CreateChallengeForm />
    </Suspense>
  );
}

function CreateChallengeForm() {
  const router = useRouter();
  /* ?as=business is the ROUTE's intent, arriving from
     /business/challenges/new. It is a hint, not an authorisation: the stamp
     below is only applied after the signed-in account is confirmed to own a
     finished business profile, which RLS decides, not this parameter. A
     business owner creating a personal challenge still lands here without the
     parameter and gets creator_type 'user'. */
  const asBusiness = useSearchParams().get("as") === "business";

  /* ── Local state ─────────────────────────────────────────────────────── */
  const [thumbnail, setThumbnail]             = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile]     = useState<File | null>(null);
  const [visibility, setVisibility]           = useState<"public" | "private">("public");
  // null until chosen, so "not picked yet" is distinguishable from "ongoing",
  // which is a legitimate choice that also means duration_days IS NULL.
  const [duration, setDuration]               = useState<DurationChoice | null>(null);
  const [durationError, setDurationError]     = useState<string | null>(null);
  const [stake, setStake]                     = useState<StakeChoice>({ perDay: 0 });
  /* Null while the balance and age are still being read. Staking stays hidden
     until both are known rather than rendering an eligible-looking control
     that then changes its mind. */
  const [stakeCtx, setStakeCtx] = useState<{ balance: number; eligible: boolean } | null>(null);
  const [dailyProof, setDailyProof]           = useState(true);

  /* Balance and age for the stake step. Age lives in profile_private, which
     is owner-only under RLS, so this read returns a row for the signed-in
     user and nothing for anybody else. Declared inside the effect and guarded
     by `cancelled` — the pattern react-hooks/set-state-in-effect wants. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setStakeCtx({ balance: 0, eligible: false });
        return;
      }

      const [{ data: balance }, { data: priv }] = await Promise.all([
        supabase.rpc("striv_coin_balance", { p_user_id: user.id }),
        supabase.from("profile_private").select("age").eq("id", user.id).maybeSingle(),
      ]);

      if (cancelled) return;
      const age = (priv?.age as number | null) ?? null;
      /* Unknown age is treated as ineligible, not as an adult. A loss-framed
         mechanic is the wrong thing to default anyone into. */
      setStakeCtx({ balance: (balance as number | null) ?? 0, eligible: age !== null && age >= 18 });
    })();

    return () => { cancelled = true; };
  }, []);
  const [locationEnabled, setLocationEnabled] = useState(false);
  // Cover: either a generated preset or an uploaded file, never both.
  const [coverPreset, setCoverPreset]         = useState<CoverPreset | null>(null);
  // Set only when the creator overrides the derived proof; null means "use
  // whatever the challenge implies", which is the normal path.
  const [proofOverride, setProofOverride]     = useState<string | null>(null);
  // Filled after a private challenge is created, so the creator leaves with
  // the link in hand instead of having to hunt for it.
  const [inviteLink, setInviteLink]           = useState<string | null>(null);
  const [inviteCopied, setInviteCopied]       = useState(false);
  const [createdId, setCreatedId]             = useState<string | null>(null);
  const [submitError, setSubmitError]         = useState<string | null>(null);
  const [mode, setMode]                       = useState<Mode>("basic");

  /* ── Task rows state ─────────────────────────────────────────────────── */
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  // Physical targets, keyed by the task's local React key — a drafted task has
  // no database id until the insert below returns one.
  const [physicalConfigs, setPhysicalConfigs] = useState<Record<string, PhysicalConfigDraft>>({});

  // What each task's proof must show, keyed by local task key like the above.
  const [proofRequirements, setProofRequirements] =
    useState<Record<string, ProofRequirementDraft | null>>({});

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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", category: "", description: "" },
  });

  const [titleVal, categoryVal, descriptionVal] =
    watch(["title", "category", "description"]);

  // Recomputed on every keystroke, so the proof card tracks the challenge as
  // it is described rather than being chosen once and forgotten.
  const inferredProof = inferProof(titleVal ?? "", descriptionVal ?? "", categoryVal ?? "");
  const effectiveProof = proofOverride
    ? PROOF_OPTIONS.find((o) => o.id === proofOverride) ?? inferredProof
    : inferredProof;
  const canSubmit = !!watch("title") && !!watch("category") && duration !== null;

  /* ── File handlers ───────────────────────────────────────────────────── */
  const loadFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    // A cover is one thing or the other; keeping both would make the submit
    // path guess which the creator meant.
    setCoverPreset(null);
    setThumbnailFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setThumbnail(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  /* ── Submit ──────────────────────────────────────────────────────────── */
  const onSubmit = async (data: FormValues) => {
    setSubmitError(null);
    setDurationError(null);
    const supabase = createClient();

    // Duration is outside the zod schema, so it needs its own guard. The
    // submit button is disabled without one; this catches a form submitted by
    // Enter from a text field, which bypasses the button entirely.
    if (duration === null) {
      setDurationError("Choose how long this challenge runs.");
      return;
    }

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

    // 2. Upload the cover. A preset is painted to a PNG here and uploaded
    //    exactly like a photo, so thumbnail_url stays an ordinary URL and no
    //    screen downstream has to know a preset was involved.
    let thumbnailUrl: string | null = null;
    const coverFile = thumbnailFile ?? (coverPreset ? await coverToFile(coverPreset) : null);
    if (coverFile) {
      // Compress before upload — a raw 10 MB phone photo used to land in
      // Storage at full size for a card rendered a few hundred pixels wide.
      const { file: thumb } = await compressImage(coverFile, IMAGE_PRESETS.thumbnail);
      const ext = thumb.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/thumbnails/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("proof-media")
        .upload(path, thumb, { upsert: false });
      if (uploadError) {
        setSubmitError(`Thumbnail upload failed: ${uploadError.message}`);
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from("proof-media").getPublicUrl(path);
      thumbnailUrl = publicUrl;
    }

    /* Only a confirmed business profile earns creator_type 'business'. The
       read goes through RLS as this user, so it can only ever return their
       own business. */
    let creatorType = "user";
    if (asBusiness) {
      const biz = await getMyBusinessProfile(supabase);
      if (biz?.onboarding_done && biz.id === user.id) creatorType = "business";
    }

    // 3. Insert challenge row
    const { data: challenge, error: insertError } = await supabase
      .from("challenges")
      .insert({
        title: data.title,
        description: data.description || null,
        category: data.category,
        duration_days: duration.days,
        /* Belt and braces with challenges_daily_stake_check: an ineligible
           account cannot send a stake even if the control was somehow
           rendered, because eligibility is decided here too. */
        daily_stake: stakeCtx?.eligible ? stake.perDay : 0,
        visibility,
        // The short label stays in proof_methods for the cards; the sentence
        // participants actually read goes in proof_instructions.
        proof_methods: dailyProof ? [effectiveProof.label] : [],
        proof_instructions: dailyProof ? effectiveProof.instruction : null,
        proof_type: dailyProof ? effectiveProof.proofType : "none",
        thumbnail_url: thumbnailUrl,
        creator_id: user.id,
        creator_type: creatorType,
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

      // select() so the physical targets can be attached to the new task ids
      const { data: insertedTasks, error: tasksError } = await supabase
        .from("challenge_tasks")
        .insert(taskRows)
        .select("id, sort_order");

      if (!tasksError && insertedTasks) {
        const bySortOrder = new Map(
          insertedTasks.map((r) => [r.sort_order as number, r.id as string])
        );
        for (let idx = 0; idx < tasks.length; idx++) {
          const t = tasks[idx];
          const taskId = bySortOrder.get(idx);
          if (!taskId) continue;

          // Save the proof spec first — it is what the participant is shown and
          // what the AI reviewer judges against, so a task without it silently
          // falls back to lenient review.
          const req = proofRequirements[t.key];
          if (req && req.required_elements.length > 0) {
            const { error: reqError } = await upsertChallengeTaskProofRequirement(
              supabase,
              taskId,
              {
                activity_category: req.activity_category,
                custom_activity: req.custom_activity,
                activity_label: req.activity_label,
                required_elements: req.required_elements,
                optional_elements: req.optional_elements,
                reject_if: req.reject_if,
                participant_hint: req.participant_hint,
                generated_by: req.generated_by,
              }
            );
            if (reqError) {
              setSubmitError(`Proof requirements for "${t.title}" could not be saved: ${reqError}`);
            }
          }

          if (t.proofType !== "physical_activity") continue;

          const cfg = physicalConfigs[t.key] ?? DEFAULT_PHYSICAL_CONFIG;
          const { error: cfgError } = await upsertChallengeTaskActivityConfig(supabase, {
            challenge_task_id: taskId,
            challenge_id: challengeId,
            activity_type: cfg.activity_type,
            target_value: cfg.target_value,
            unit: cfg.unit,
            tracking_mode: cfg.tracking_mode,
            frequency: cfg.frequency,
            specific_date: cfg.specific_date,
            timezone: "Asia/Kolkata",
            allow_manual_proof: cfg.allow_manual_proof,
          });
          // A task without its target would render a progress bar with no goal,
          // so surface it rather than letting it fail silently.
          if (cfgError) {
            setSubmitError(`Activity settings for "${t.title}" could not be saved: ${cfgError}`);
          }
        }
      }

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

    // 7. A private challenge is invisible to everyone who was not invited, so
    //    sending the creator straight to the detail page leaves them with a
    //    challenge nobody can reach and no obvious way to fix that. Issue the
    //    code now and hand them the link.
    if (visibility === "private") {
      const { code } = await ensureInviteCode(supabase, challengeId);
      if (code) {
        setInviteLink(inviteUrl(code));
        setCreatedId(challengeId);
        return;
      }
      // The code could not be issued; the challenge still exists, and the
      // detail page has its own invite sheet to fall back on.
    }

    router.push(`/challenges/${challengeId}`);
  };

  /* ── Created: hand over the invite link ──────────────────────────────── */
  // Private challenges only. A private challenge cannot be found by browsing —
  // that is the point of it — so a creator dropped straight onto the detail
  // page would have something nobody else can reach and no obvious next step.
  if (inviteLink && createdId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-gutter py-12">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 elev-2 surface-raised">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-success-container">
              <Check size={24} className="text-success" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="text-headline-md font-bold text-on-surface">Your challenge is live</h1>
              <p className="text-body-md text-on-surface-variant">
                It is private, so it will not show up in Explore. The only way
                in is this link.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="invite-link" className="text-label-sm font-semibold text-on-surface">
              Invite link
            </label>
            <div className="flex gap-2">
              <input
                id="invite-link"
                readOnly
                value={inviteLink}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-container px-3 py-2 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteLink);
                    setInviteCopied(true);
                    window.setTimeout(() => setInviteCopied(false), 2000);
                  } catch {
                    // Clipboard can be blocked; the field is selectable, so
                    // there is still a way to copy by hand.
                    setInviteCopied(false);
                  }
                }}
                className="shrink-0 rounded-xl bg-secondary px-4 text-body-md font-semibold text-on-secondary elev-brand transition-opacity hover:opacity-90"
              >
                {inviteCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-label-sm text-on-surface-variant">
              Anyone with this link can join. You can rotate it later from the
              challenge page, which invalidates every link already shared.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/challenges/${createdId}`)}
            className="w-full rounded-xl border border-outline-variant py-2.5 text-body-md font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            Go to the challenge
          </button>
        </div>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-surface">

      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 pt-safe z-40 bg-surface/95 backdrop-blur-sm border-b border-outline-variant">
        <div className="mx-auto measure-form px-4">
          <div className="flex items-center justify-between h-14">
            <button
              type="button"
              onClick={() => router.back()}
              className="w-9 h-9 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors tap-target"
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
        <div className="mx-auto measure-form px-4 py-6 space-y-8 pb-48 md:pb-32">

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

              <CoverPicker
                presetId={coverPreset?.id ?? null}
                uploadedUrl={thumbnail}
                onSelectPreset={(preset) => {
                  // A preset replaces any uploaded file, so the submit path
                  // never has to guess which the creator meant.
                  setCoverPreset(preset);
                  setThumbnailFile(null);
                  setThumbnail(null);
                }}
                onUpload={loadFile}
              />

              <CategoryPicker
                value={categoryVal ?? ""}
                onChange={(next) =>
                  setValue("category", next, { shouldValidate: true, shouldDirty: true })
                }
                error={errors.category?.message}
              />
            </div>
          </section>

          {/* ── Section 2: Duration + Visibility + Description ──────── */}
          <section aria-label="Duration and Visibility">
            <div className="space-y-4">
              <DurationPicker
                value={duration}
                onChange={(next) => {
                  setDuration(next);
                  setDurationError(null);
                }}
                error={durationError}
              />

              {stakeCtx ? (
                <StakePicker
                  value={stake}
                  onChange={setStake}
                  balance={stakeCtx.balance}
                  durationDays={duration?.days ?? null}
                  eligible={stakeCtx.eligible}
                />
              ) : null}

              {/* Visibility. Was a bare public/private segmented toggle with
                  no indication of what either one does — and "private" has a
                  real consequence (the challenge becomes unfindable, reachable
                  only through a link) that a creator should know before they
                  pick it, not after. */}
              <div className="space-y-2">
                <span id="visibility-label" className="text-body-md font-medium text-on-surface">
                  Who can join
                </span>
                <div role="radiogroup" aria-labelledby="visibility-label" className="grid gap-2 sm:grid-cols-2">
                  {([
                    {
                      value: "public" as const,
                      Icon: Globe,
                      title: "Public",
                      body: "Anyone can find it in Explore and join.",
                    },
                    {
                      value: "private" as const,
                      Icon: Lock,
                      title: "Private",
                      body: "Hidden from Explore. Only people you send the link to can join.",
                    },
                  ]).map(({ value, Icon, title, body }) => {
                    const selected = visibility === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setVisibility(value)}
                        className={[
                          "flex items-start gap-3 rounded-xl border p-3 text-left transition-all duration-150",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1",
                          selected
                            ? "border-secondary bg-secondary/5 ring-1 ring-secondary"
                            : "border-outline-variant bg-surface-container-lowest hover:border-secondary/40",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            selected ? "bg-secondary text-on-secondary" : "bg-surface-container text-on-surface-variant",
                          ].join(" ")}
                        >
                          <Icon size={16} aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-body-md font-semibold text-on-surface">{title}</span>
                          <span className="mt-0.5 block text-label-sm text-on-surface-variant">{body}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {visibility === "private" ? (
                  <p className="text-label-sm text-on-surface-variant">
                    You will get the invite link as soon as the challenge is created.
                  </p>
                ) : null}
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
                  physicalConfig={physicalConfigs[task.key] ?? DEFAULT_PHYSICAL_CONFIG}
                  onPhysicalConfigChange={(next) =>
                    setPhysicalConfigs((prev) => ({ ...prev, [task.key]: next }))
                  }
                  proofRequirement={proofRequirements[task.key] ?? null}
                  onProofRequirementChange={(next) =>
                    setProofRequirements((prev) => ({ ...prev, [task.key]: next }))
                  }
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
              {dailyProof ? (
                <ProofSummary
                  inferred={inferredProof}
                  overrideId={proofOverride}
                  onOverride={setProofOverride}
                  onClearOverride={() => setProofOverride(null)}
                />
              ) : null}
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
            <LivePreviewCard
              title={titleVal}
              creatorName="you"
              duration={
                duration === null
                  ? ""
                  : duration.days === null
                    ? "Ongoing"
                    : `${duration.days} Days`
              }
              thumbnail={thumbnail}
            />
          </section>

        </div>

        {/* ── Sticky bottom action bar ─────────────────────────────────── */}
        <div className="fixed above-bottom-nav z-30 bg-surface/95 backdrop-blur-sm border-t border-outline-variant px-4 py-3">
          <div className="mx-auto measure-form flex gap-3">
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
