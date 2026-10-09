"use client";
/**
 * Create / Edit Quest — 6-step wizard
 * Steps: Basic Info → Tasks → Rewards → Rules → Audience → Review
 */
import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Globe, GripVertical, ImageIcon, Link as LinkIcon, Plus, Rocket, Trash2, Trophy, Upload, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import {
  upsertQuest, getQuestById, upsertQuestTask, deleteQuestTask,
  getQuestTasks, upsertQuestReward, deleteQuestReward, getQuestRewards,
  publishQuest, QUEST_CATEGORIES, PROOF_TYPES, REWARD_TYPES,
  type QuestTask, type QuestReward, type ProofType, type RewardType,
} from "@/lib/data/businessQuests";
import { Input } from "@/components/ui";
import {
  PhysicalActivityConfigFields,
  DEFAULT_PHYSICAL_CONFIG,
  type PhysicalConfigDraft,
} from "@/components/features/activity/PhysicalActivityConfigFields";
import { upsertTaskActivityConfig } from "@/lib/data/activity";

const TOTAL_STEPS = 6;
const STEP_LABELS = ["Basic Info","Tasks","Rewards","Rules","Audience","Review"];

/* ── Step Shell ─────────────────────────────────────────────────────── */
function StepShell({ step, title, subtitle, children, onBack, onNext, nextLabel = "Continue", nextDisabled = false, saving = false }: {
  step: number; title: string; subtitle?: string; children: React.ReactNode;
  onBack?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; saving?: boolean;
}) {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="h-1 bg-surface-container-highest"><div className="h-1 bg-secondary transition-all duration-500" style={{ width: `${(step/TOTAL_STEPS)*100}%` }} /></div>
      {/* Header, form and footer all share one measure. They did not before:
          the header and the sticky footer ran the full viewport while the form
          was clamped narrow, so on a laptop the step title sat far left of the
          fields it described and Next was a 100vw-wide button. */}
      <div className="sticky top-0 z-30 border-b border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto flex measure-form items-center gap-3 px-5 py-4">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container pressable focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary tap-target"
            >
              <ChevronLeft size={20} className="text-on-surface-variant" aria-hidden="true" />
            </button>
          )}
          <div className="flex-1">
            <p className="text-overline text-on-surface-variant">Step {step} of {TOTAL_STEPS} · {STEP_LABELS[step-1]}</p>
            <h1 className="text-headline-md font-black leading-tight text-on-surface">{title}</h1>
            {subtitle && <p className="mt-0.5 text-body-md text-on-surface-variant">{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="mx-auto measure-form flex-1 overflow-y-auto px-5 py-5 pb-28">{children}</div>
      <div className="fixed above-bottom-nav z-40 border-t border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto measure-form px-5 py-4">
          <button onClick={onNext} disabled={nextDisabled || saving}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary font-bold text-white transition-all elev-brand hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
            {saving ? "Saving…" : <>{nextLabel} <ChevronRight size={18} aria-hidden="true" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────── */
function CreateQuestContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [questId, setQuestId] = useState<string | null>(editId);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  // Step 1 — Basic Info
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [taskImageUploading, setTaskImageUploading] = useState<number | null>(null);
  const [destinationLink, setDestinationLink] = useState("");
  const [locationName, setLocationName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Step 2 — Tasks
  const [tasks, setTasks] = useState<Partial<QuestTask>[]>([
    { title: "", description: "", proof_type: "photo", is_required: true, instructions: "", image_url: null, sort_order: 0 }
  ]);

  // Physical config is keyed by task index, not task id: a task being drafted
  // has no id until saveTasks runs. The two are married up there.
  const [physicalConfigs, setPhysicalConfigs] = useState<Record<number, PhysicalConfigDraft>>({});

  // Step 3 — Rewards
  const [rewards, setRewards] = useState<Partial<QuestReward>[]>([]);
  const [isLeaderboard, setIsLeaderboard] = useState(false);

  // Step 4 — Rules
  const [rules, setRules] = useState("");
  const [eligibility, setEligibility] = useState("");

  // Step 5 — Audience
  const [visibility, setVisibility] = useState<"public"|"community_only"|"invite_only">("public");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const bp = await getMyBusinessProfile(supabase);
      if (!bp?.onboarding_done) { router.replace("/business/onboarding"); return; }
      setBusinessId(bp.id);
      setIsVerified(bp.verification_status === "verified");

      if (editId) {
        const [q, t, r] = await Promise.all([
          getQuestById(supabase, editId),
          getQuestTasks(supabase, editId),
          getQuestRewards(supabase, editId),
        ]);
        if (q) {
          setTitle(q.title); setDescription(q.description ?? "");
          setCategory(q.category ?? ""); setCoverUrl(q.cover_url ?? null);
          setDestinationLink(q.destination_link ?? ""); setLocationName(q.location_name ?? "");
          setStartDate(q.start_date ? q.start_date.split("T")[0] : "");
          setEndDate(q.end_date ? q.end_date.split("T")[0] : "");
          setRules(q.rules ?? ""); setEligibility(q.eligibility ?? "");
          setVisibility(q.visibility as typeof visibility);
        }
        if (t.length > 0) setTasks(t);
        if (r.length > 0) { setRewards(r); setIsLeaderboard(r.some(rw => rw.is_leaderboard)); }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveBasicInfo = useCallback(async () => {
    if (!businessId) return;
    setSaving(true); setError(null);
    try {
      const q = await upsertQuest(supabase, {
        id: questId ?? undefined,
        title: title.trim(),
        description: description.trim() || null,
        category: category || null,
        cover_url: coverUrl,
        destination_link: destinationLink.trim() || null,
        location_name: locationName.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        quest_status: "draft",
        proof_type: "photo",
        status: "active",
      }, businessId);
      setQuestId(q.id);
      setStep(2);
    } catch(e) { setError(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  }, [businessId, questId, title, description, category, coverUrl, destinationLink, locationName, startDate, endDate, supabase]);

  const saveTasks = useCallback(async () => {
    if (!questId) return;
    setSaving(true); setError(null);
    try {
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        if (!t.title?.trim()) continue;
        const saved = await upsertQuestTask(supabase, { ...t, quest_id: questId, sort_order: i } as Partial<QuestTask> & { quest_id: string });

        // A physical task is only meaningful with its target attached, so the
        // config is written in the same pass as the task itself.
        if (t.proof_type === "physical_activity" && saved?.id) {
          const cfg = physicalConfigs[i] ?? DEFAULT_PHYSICAL_CONFIG;
          const { error: cfgError } = await upsertTaskActivityConfig(supabase, {
            task_id: saved.id,
            quest_id: questId,
            activity_type: cfg.activity_type,
            target_value: cfg.target_value,
            unit: cfg.unit,
            tracking_mode: cfg.tracking_mode,
            frequency: cfg.frequency,
            specific_date: cfg.specific_date,
            timezone: "Asia/Kolkata",
            allow_manual_proof: cfg.allow_manual_proof,
          });
          if (cfgError) throw new Error(`Activity settings for "${t.title}": ${cfgError}`);
        }
      }
      setStep(3);
    } catch(e) { setError(e instanceof Error ? e.message : "Failed to save tasks"); }
    finally { setSaving(false); }
  }, [questId, tasks, physicalConfigs, supabase]);

  const saveRewards = useCallback(async () => {
    if (!questId) return;
    setSaving(true); setError(null);
    try {
      for (const r of rewards) {
        if (!r.title?.trim()) continue;
        await upsertQuestReward(supabase, { ...r, quest_id: questId, is_leaderboard: isLeaderboard } as Partial<QuestReward> & { quest_id: string });
      }
      setStep(4);
    } catch(e) { setError(e instanceof Error ? e.message : "Failed to save rewards"); }
    finally { setSaving(false); }
  }, [questId, rewards, isLeaderboard, supabase]);

  const saveRules = useCallback(async () => {
    if (!questId || !businessId) return;
    setSaving(true); setError(null);
    try {
      await upsertQuest(supabase, { id: questId, rules: rules.trim() || null, eligibility: eligibility.trim() || null }, businessId);
      setStep(5);
    } catch(e) { setError(e instanceof Error ? e.message : "Failed to save rules"); }
    finally { setSaving(false); }
  }, [questId, businessId, rules, eligibility, supabase]);

  const saveAudience = useCallback(async () => {
    if (!questId || !businessId) return;
    setSaving(true); setError(null);
    try {
      await upsertQuest(supabase, { id: questId, visibility }, businessId);
      setStep(6);
    } catch(e) { setError(e instanceof Error ? e.message : "Failed to save audience"); }
    finally { setSaving(false); }
  }, [questId, businessId, visibility, supabase]);

  const handlePublish = async () => {
    if (!questId || !businessId) return;
    setSaving(true); setError(null);
    try {
      await publishQuest(supabase, questId, businessId);
      router.push("/business/quests");
    } catch(e) { setError(e instanceof Error ? e.message : "Failed to publish"); setSaving(false); }
  };

  const handleSaveDraft = async () => {
    router.push("/business/quests");
  };

  /**
   * Per-task thumbnail. The Quest detail page renders one image per task, so a
   * Quest whose tasks all look alike reads as a single repeated item — this is
   * what makes each task visually distinct.
   */
  const handleTaskImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setTaskImageUploading(index);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/quest-tasks/${Date.now()}-${index}.${ext}`;
      const { error } = await supabase.storage.from("proof-media").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("proof-media").getPublicUrl(path);
      setTasks(prev => prev.map((t, j) => j === index ? { ...t, image_url: data.publicUrl } : t));
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed"); }
    finally { setTaskImageUploading(null); }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCoverUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/quest-covers/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("proof-media").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("proof-media").getPublicUrl(path);
      setCoverUrl(data.publicUrl);
    } catch(err) { setError(err instanceof Error ? err.message : "Upload failed"); }
    finally { setCoverUploading(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  /* ── STEP 1: Basic Info ──────────────────────────────────────────── */
  if (step === 1) return (
    <StepShell step={1} title="Quest Details" subtitle="Tell participants what this Quest is about."
      onBack={() => router.push("/business/quests")}
      onNext={saveBasicInfo} nextDisabled={!title.trim()} saving={saving}>
      {error && <p className="text-on-error-container text-sm mb-4 bg-error-container rounded-xl px-4 py-3">{error}</p>}
      <div className="flex flex-col gap-4">
        {/* Cover upload */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-on-surface-variant">Cover Image</label>
          <label className="relative cursor-pointer group">
            <div className="w-full h-40 rounded-2xl bg-surface-container border-2 border-dashed border-outline group-hover:border-secondary overflow-hidden flex items-center justify-center transition-colors">
              {coverUploading ? (
                <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
              ) : coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-on-surface-variant">
                  <Upload size={28} /><span className="text-sm">Upload Cover Image</span>
                </div>
              )}
            </div>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleCoverUpload} />
          </label>
          {coverUrl && <button type="button" onClick={() => setCoverUrl(null)} className="text-xs text-error self-start">Remove image</button>}
        </div>
        <Input label="Quest Title *" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 30-Day Morning Run Challenge" maxLength={100} />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-on-surface-variant">Description *</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={4}
            placeholder="Describe the quest, what participants need to do, and why they should join..."
            className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:border-secondary focus:ring-secondary/30 resize-none" />
          <p className="text-xs text-on-surface-variant text-right">{description.length}/1000</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-on-surface-variant">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="h-10 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface-variant focus:outline-none focus:border-secondary tap-target">
            <option value="">Select category…</option>
            {QUEST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Input label="Destination Link" type="url" value={destinationLink} onChange={e => setDestinationLink(e.target.value)} placeholder="https://…" hint="Optional — where users can learn more" />
        <Input label="Location" value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="e.g. Mumbai, Maharashtra" hint="Optional" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>
    </StepShell>
  );

  /* ── STEP 2: Tasks ───────────────────────────────────────────────── */
  if (step === 2) return (
    <StepShell step={2} title="Quest Tasks" subtitle="Define what participants need to complete."
      onBack={() => setStep(1)} onNext={saveTasks}
      nextDisabled={tasks.filter(t => t.title?.trim()).length === 0} saving={saving}>
      {error && <p className="text-on-error-container text-sm mb-4 bg-error-container rounded-xl px-4 py-3">{error}</p>}
      <div className="flex flex-col gap-3">
        {tasks.map((task, i) => (
          <div key={i} className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 flex flex-col gap-3 elev-1 surface-raised">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical size={16} className="text-on-surface-variant" />
                <span className="text-sm font-bold text-on-surface-variant">Task {i + 1}</span>
              </div>
              {tasks.length > 1 && (
                <button type="button" onClick={() => {
                  if (task.id) deleteQuestTask(supabase, task.id).catch(console.error);
                  setTasks(prev => prev.filter((_, j) => j !== i));
                }} className="text-error hover:text-on-error-container transition-colors">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <input value={task.title ?? ""} onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, title: e.target.value } : t))}
              placeholder="Task title *" className="w-full h-10 rounded-xl border border-outline-variant bg-surface-container-low px-3 text-sm focus:outline-none focus:border-secondary focus:bg-surface-container-lowest tap-target" />
            <textarea value={task.description ?? ""} onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, description: e.target.value } : t))}
              placeholder="Task description..." rows={2}
              className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:border-secondary focus:bg-surface-container-lowest resize-none" />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-1 block">Proof Type</label>
                <select value={task.proof_type ?? "photo"} onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, proof_type: e.target.value as ProofType } : t))}
                  className="w-full h-9 rounded-xl border border-outline-variant bg-surface-container-low px-3 text-xs text-on-surface-variant focus:outline-none focus:border-secondary tap-target">
                  {PROOF_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={task.is_required ?? true}
                    onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, is_required: e.target.checked } : t))}
                    className="w-4 h-4 rounded-xl border-outline accent-blue-600" />
                  <span className="text-xs font-medium text-on-surface-variant">Required</span>
                </label>
              </div>
            </div>
            {/* Per-task thumbnail */}
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-surface-container-low border border-outline-variant shrink-0 flex items-center justify-center">
                {task.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={task.image_url} alt="" className="w-full h-full object-cover" />
                  : <ImageIcon size={18} className="text-on-surface-variant" aria-hidden="true" />}
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider block mb-1">
                  Task image
                </label>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant cursor-pointer hover:bg-surface-container-low transition-colors">
                    <Upload size={12} />
                    {taskImageUploading === i ? "Uploading…" : task.image_url ? "Replace" : "Upload"}
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => handleTaskImageUpload(i, e)} />
                  </label>
                  {task.image_url && (
                    <button type="button"
                      onClick={() => setTasks(prev => prev.map((t, j) => j === i ? { ...t, image_url: null } : t))}
                      className="text-xs font-semibold text-on-surface-variant hover:text-error transition-colors">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* What an order-verification task actually does, stated where it is chosen */}
            {task.proof_type === "order_verification" && (
              <div className="rounded-xl bg-secondary-fixed border border-secondary-fixed-dim px-3.5 py-3">
                <p className="text-xs font-bold text-on-secondary-fixed">STRIVUP order verification</p>
                <p className="text-xs text-secondary leading-relaxed mt-1">
                  Participants get a code to put in their Zomato / Swiggy order
                  description. You confirm it at{" "}
                  <span className="font-semibold">Order Verification</span>, then write
                  the bill code STRIVUP gives you on their bill to complete the task.
                </p>
              </div>
            )}

            <textarea value={task.instructions ?? ""} onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, instructions: e.target.value } : t))}
              placeholder="Instructions for participants (optional)..." rows={2}
              className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:border-secondary focus:bg-surface-container-lowest resize-none" />

            {task.proof_type === "physical_activity" && (
              <PhysicalActivityConfigFields
                value={physicalConfigs[i] ?? DEFAULT_PHYSICAL_CONFIG}
                onChange={next => setPhysicalConfigs(prev => ({ ...prev, [i]: next }))}
              />
            )}
          </div>
        ))}
        <button type="button" onClick={() => setTasks(prev => [...prev, { title: "", description: "", proof_type: "photo", is_required: true, instructions: "", image_url: null, sort_order: prev.length }])}
          className="flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-dashed border-secondary-fixed-dim text-secondary text-sm font-semibold hover:bg-secondary-fixed transition-colors">
          <Plus size={18} /> Add Another Task
        </button>
      </div>
    </StepShell>
  );

  /* ── STEP 3: Rewards ─────────────────────────────────────────────── */
  if (step === 3) return (
    <StepShell step={3} title="Rewards" subtitle="Define what participants can win."
      onBack={() => setStep(2)} onNext={saveRewards} nextLabel="Continue" saving={saving}>
      {error && <p className="text-on-error-container text-sm mb-4 bg-error-container rounded-xl px-4 py-3">{error}</p>}
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-3 bg-surface-container-lowest rounded-xl border border-outline-variant px-4 py-3 cursor-pointer elev-1 surface-raised">
          <input type="checkbox" checked={isLeaderboard} onChange={e => setIsLeaderboard(e.target.checked)}
            className="w-4 h-4 rounded-xl border-outline accent-blue-600" />
          <div>
            <p className="text-sm font-semibold text-on-surface">Enable Leaderboard Ranking</p>
            <p className="text-xs text-on-surface-variant">Rank participants and assign tiered rewards</p>
          </div>
        </label>
        {rewards.map((reward, i) => (
          <div key={i} className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 flex flex-col gap-3 elev-1 surface-raised">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-on-surface-variant">Reward {i + 1}</span>
              <button type="button" onClick={() => {
                if (reward.id) deleteQuestReward(supabase, reward.id).catch(console.error);
                setRewards(prev => prev.filter((_, j) => j !== i));
              }} className="text-error hover:text-on-error-container"><Trash2 size={16} /></button>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-1 block">Reward Type</label>
                <select value={reward.reward_type ?? "other"} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, reward_type: e.target.value as RewardType } : r))}
                  className="w-full h-9 rounded-xl border border-outline-variant bg-surface-container-low px-3 text-xs text-on-surface-variant focus:outline-none focus:border-secondary tap-target">
                  {REWARD_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
                </select>
              </div>
            </div>
            <input value={reward.title ?? ""} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, title: e.target.value } : r))}
              placeholder="Reward title (e.g. ₹10,000 Cash Prize) *" className="w-full h-10 rounded-xl border border-outline-variant bg-surface-container-low px-3 text-sm focus:outline-none focus:border-secondary focus:bg-surface-container-lowest tap-target" />
            <input value={reward.value ?? ""} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
              placeholder="Value (e.g. ₹10,000)" className="w-full h-10 rounded-xl border border-outline-variant bg-surface-container-low px-3 text-sm focus:outline-none focus:border-secondary focus:bg-surface-container-lowest tap-target" />
            {isLeaderboard && (
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={reward.rank_from ?? ""} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, rank_from: parseInt(e.target.value) || null } : r))}
                  placeholder="Rank from" className="h-10 rounded-xl border border-outline-variant bg-surface-container-low px-3 text-sm focus:outline-none focus:border-secondary tap-target" />
                <input type="number" value={reward.rank_to ?? ""} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, rank_to: parseInt(e.target.value) || null } : r))}
                  placeholder="Rank to" className="h-10 rounded-xl border border-outline-variant bg-surface-container-low px-3 text-sm focus:outline-none focus:border-secondary tap-target" />
              </div>
            )}
            <textarea value={reward.description ?? ""} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, description: e.target.value } : r))}
              placeholder="Additional details about this reward..." rows={2}
              className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:border-secondary resize-none" />
          </div>
        ))}
        <button type="button" onClick={() => setRewards(prev => [...prev, { reward_type: "other", title: "", is_leaderboard: isLeaderboard }])}
          className="flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-dashed border-secondary-fixed-dim text-secondary text-sm font-semibold hover:bg-secondary-fixed transition-colors">
          <Plus size={18} /> Add Reward
        </button>
        {rewards.length === 0 && (
          <p className="text-xs text-on-surface-variant text-center">You can skip this step if there are no rewards.</p>
        )}
      </div>
    </StepShell>
  );

  /* ── STEP 4: Rules ───────────────────────────────────────────────── */
  if (step === 4) return (
    <StepShell step={4} title="Rules & Eligibility" subtitle="Set the terms for participation and rewards."
      onBack={() => setStep(3)} onNext={saveRules} saving={saving}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-on-surface-variant">Eligibility</label>
          <textarea value={eligibility} onChange={e => setEligibility(e.target.value)} rows={3}
            placeholder="Who can participate? (e.g. Open to all, 18+ only, Indian residents only...)"
            className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:border-secondary focus:ring-secondary/30 resize-none" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-on-surface-variant">Participation Rules</label>
          <textarea value={rules} onChange={e => setRules(e.target.value)} rows={6}
            placeholder="List the rules, proof requirements, reward criteria, disqualification rules..."
            className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:border-secondary focus:ring-secondary/30 resize-none" />
        </div>
        <div className="bg-secondary-fixed border border-secondary-fixed-dim rounded-xl px-4 py-3">
          <p className="text-xs text-secondary font-medium">By submitting, you confirm that all reward information provided is accurate and you are legally permitted to offer these rewards.</p>
        </div>
      </div>
    </StepShell>
  );

  /* ── STEP 5: Audience ────────────────────────────────────────────── */
  if (step === 5) return (
    <StepShell step={5} title="Visibility & Audience" subtitle="Who can see and join this Quest?"
      onBack={() => setStep(4)} onNext={saveAudience} saving={saving}>
      <div className="flex flex-col gap-3">
        {([
          { value: "public", title: "Public", desc: "Anyone on STRIVUP can discover and join", Icon: Globe },
          { value: "community_only", title: "Community Only", desc: "Only members of your community can join", Icon: Users },
          { value: "invite_only", title: "Invite Only", desc: "Only people with an invite link can join", Icon: LinkIcon },
        ] as const).map(opt => (
          <button key={opt.value} type="button" onClick={() => setVisibility(opt.value)}
            className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              visibility === opt.value ? "border-secondary bg-secondary-fixed" : "border-outline-variant bg-surface-container-lowest hover:border-outline-variant"
            }`}>
            <opt.Icon size={22} className={`mt-0.5 shrink-0 ${visibility === opt.value ? "text-secondary" : "text-on-surface-variant"}`} aria-hidden="true" />
            <div>
              <p className={`text-sm font-bold ${visibility === opt.value ? "text-secondary" : "text-on-surface"}`}>{opt.title}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{opt.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </StepShell>
  );

  /* ── STEP 6: Review ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="h-1 bg-secondary w-full" />
      <div className="sticky top-0 z-30 border-b border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto flex measure-form items-center gap-3 px-5 py-4">
          <button
            onClick={() => setStep(5)}
            aria-label="Back to visibility"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container pressable focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary tap-target"
          >
            <ChevronLeft size={20} className="text-on-surface-variant" aria-hidden="true" />
          </button>
          <div>
            <p className="text-overline text-on-surface-variant">Step 6 of 6 · Review</p>
            <h1 className="text-headline-md font-black text-on-surface">Review &amp; Publish</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto flex measure-form flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 pb-36">
        {error && <p className="text-on-error-container text-sm bg-error-container rounded-xl px-4 py-3">{error}</p>}

        {/* Cover preview */}
        {coverUrl && (
          <div className="w-full h-48 rounded-2xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 flex flex-col gap-3 elev-1 surface-raised">
          <h2 className="text-headline-md font-black text-on-surface">{title}</h2>
          {category && <span className="self-start text-xs font-semibold text-secondary bg-secondary-fixed px-3 py-1 rounded-full">{category}</span>}
          {description && <p className="text-sm text-on-surface-variant leading-relaxed">{description}</p>}
        </div>

        {tasks.filter(t => t.title?.trim()).length > 0 && (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 elev-1 surface-raised">
            <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Tasks ({tasks.filter(t => t.title?.trim()).length})</p>
            <div className="flex flex-col gap-2">
              {tasks.filter(t => t.title?.trim()).map((t, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-outline-variant last:border-0">
                  <div className="w-6 h-6 rounded-full bg-secondary-fixed flex items-center justify-center shrink-0">
                    <span className="text-label-sm font-black text-secondary">{i+1}</span>
                  </div>
                  <p className="text-sm text-on-surface font-medium">{t.title}</p>
                  <span className="ml-auto text-label-sm text-on-surface-variant shrink-0">{PROOF_TYPES.find(p => p.value === t.proof_type)?.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {rewards.filter(r => r.title?.trim()).length > 0 && (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 elev-1 surface-raised">
            <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Rewards ({rewards.filter(r => r.title?.trim()).length})</p>
            {rewards.filter(r => r.title?.trim()).map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-outline-variant last:border-0">
                <Trophy size={16} className="shrink-0 text-warning" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-on-surface">{r.title}</p>
                  {r.rank_from && <p className="text-xs text-on-surface-variant">Rank {r.rank_from}{r.rank_to ? `–${r.rank_to}` : "+"}</p>}
                </div>
                {r.value && <span className="text-sm font-bold text-on-success-container shrink-0">{r.value}</span>}
              </div>
            ))}
          </div>
        )}

        {!isVerified && (
          <div className="bg-warning-container border border-warning-outline rounded-2xl px-4 py-4">
            <p className="flex items-center gap-1.5 text-body-md font-bold text-on-warning-container">
              <AlertTriangle size={15} aria-hidden="true" /> Business Verification Required
            </p>
            <p className="text-xs text-on-warning-container mt-1">Your business must be verified before publishing a Quest. You can save as draft and publish once verified.</p>
          </div>
        )}
      </div>

      <div className="fixed above-bottom-nav z-40 border-t border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto flex measure-form flex-col gap-2 px-5 py-4">
          {isVerified && (
            <button onClick={handlePublish} disabled={saving}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary font-bold text-body-lg text-white transition-all elev-brand hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
              {saving ? "Publishing…" : <><Rocket size={18} aria-hidden="true" /> Publish Quest</>}
            </button>
          )}
          <button onClick={handleSaveDraft} disabled={saving}
            className="h-11 w-full rounded-xl border border-outline-variant text-body-md font-semibold text-on-surface-variant transition-colors pressable hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
            Save as Draft
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreateQuestPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-surface"><div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" /></div>}><CreateQuestContent /></Suspense>;
}
