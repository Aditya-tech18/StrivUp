"use client";
/**
 * Create / Edit Quest — 6-step wizard
 * Steps: Basic Info → Tasks → Rewards → Rules → Audience → Review
 */
import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, GripVertical, Plus, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import {
  upsertQuest, getQuestById, upsertQuestTask, deleteQuestTask,
  getQuestTasks, upsertQuestReward, deleteQuestReward, getQuestRewards,
  publishQuest, QUEST_CATEGORIES, PROOF_TYPES, REWARD_TYPES,
  type QuestTask, type QuestReward, type ProofType, type RewardType,
} from "@/lib/data/businessQuests";
import { Input } from "@/components/ui";

const TOTAL_STEPS = 6;
const STEP_LABELS = ["Basic Info","Tasks","Rewards","Rules","Audience","Review"];

/* ── Step Shell ─────────────────────────────────────────────────────── */
function StepShell({ step, title, subtitle, children, onBack, onNext, nextLabel = "Continue", nextDisabled = false, saving = false }: {
  step: number; title: string; subtitle?: string; children: React.ReactNode;
  onBack?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; saving?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col">
      <div className="h-1 bg-gray-200"><div className="h-1 bg-blue-600 transition-all duration-500" style={{ width: `${(step/TOTAL_STEPS)*100}%` }} /></div>
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 sticky top-0 z-30">
        {onBack && <button onClick={onBack} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"><ChevronLeft size={20} className="text-gray-600" /></button>}
        <div className="flex-1">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Step {step} of {TOTAL_STEPS} · {STEP_LABELS[step-1]}</p>
          <h1 className="text-[18px] font-black text-gray-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 pb-28 max-w-lg mx-auto w-full">{children}</div>
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 py-4 safe-area-bottom">
        <button onClick={onNext} disabled={nextDisabled || saving}
          className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2 transition-all">
          {saving ? "Saving…" : <>{nextLabel} <ChevronRight size={18} /></>}
        </button>
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
  const [destinationLink, setDestinationLink] = useState("");
  const [locationName, setLocationName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Step 2 — Tasks
  const [tasks, setTasks] = useState<Partial<QuestTask>[]>([
    { title: "", description: "", proof_type: "photo", is_required: true, instructions: "", sort_order: 0 }
  ]);

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
        await upsertQuestTask(supabase, { ...t, quest_id: questId, sort_order: i } as Partial<QuestTask> & { quest_id: string });
      }
      setStep(3);
    } catch(e) { setError(e instanceof Error ? e.message : "Failed to save tasks"); }
    finally { setSaving(false); }
  }, [questId, tasks, supabase]);

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
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  /* ── STEP 1: Basic Info ──────────────────────────────────────────── */
  if (step === 1) return (
    <StepShell step={1} title="Quest Details" subtitle="Tell participants what this Quest is about."
      onBack={() => router.push("/business/quests")}
      onNext={saveBasicInfo} nextDisabled={!title.trim()} saving={saving}>
      {error && <p className="text-red-600 text-sm mb-4 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
      <div className="flex flex-col gap-4">
        {/* Cover upload */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-700">Cover Image</label>
          <label className="relative cursor-pointer group">
            <div className="w-full h-40 rounded-2xl bg-gray-100 border-2 border-dashed border-gray-300 group-hover:border-blue-500 overflow-hidden flex items-center justify-center transition-colors">
              {coverUploading ? (
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              ) : coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Upload size={28} /><span className="text-sm">Upload Cover Image</span>
                </div>
              )}
            </div>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleCoverUpload} />
          </label>
          {coverUrl && <button type="button" onClick={() => setCoverUrl(null)} className="text-xs text-red-500 self-start">Remove image</button>}
        </div>
        <Input label="Quest Title *" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 30-Day Morning Run Challenge" maxLength={100} />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-gray-700">Description *</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={4}
            placeholder="Describe the quest, what participants need to do, and why they should join..."
            className="w-full rounded-xl border border-gray-200 bg-white text-gray-900 text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-100 resize-none" />
          <p className="text-xs text-gray-400 text-right">{description.length}/1000</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-gray-700">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:border-blue-500">
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
      {error && <p className="text-red-600 text-sm mb-4 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
      <div className="flex flex-col gap-3">
        {tasks.map((task, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical size={16} className="text-gray-300" />
                <span className="text-sm font-bold text-gray-700">Task {i + 1}</span>
              </div>
              {tasks.length > 1 && (
                <button type="button" onClick={() => {
                  if (task.id) deleteQuestTask(supabase, task.id).catch(console.error);
                  setTasks(prev => prev.filter((_, j) => j !== i));
                }} className="text-red-400 hover:text-red-600 transition-colors">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <input value={task.title ?? ""} onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, title: e.target.value } : t))}
              placeholder="Task title *" className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:border-blue-500 focus:bg-white" />
            <textarea value={task.description ?? ""} onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, description: e.target.value } : t))}
              placeholder="Task description..." rows={2}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:bg-white resize-none" />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Proof Type</label>
                <select value={task.proof_type ?? "photo"} onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, proof_type: e.target.value as ProofType } : t))}
                  className="w-full h-9 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-700 focus:outline-none focus:border-blue-500">
                  {PROOF_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={task.is_required ?? true}
                    onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, is_required: e.target.checked } : t))}
                    className="w-4 h-4 rounded border-gray-300 accent-blue-600" />
                  <span className="text-xs font-medium text-gray-600">Required</span>
                </label>
              </div>
            </div>
            <textarea value={task.instructions ?? ""} onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, instructions: e.target.value } : t))}
              placeholder="Instructions for participants (optional)..." rows={2}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:bg-white resize-none" />
          </div>
        ))}
        <button type="button" onClick={() => setTasks(prev => [...prev, { title: "", description: "", proof_type: "photo", is_required: true, instructions: "", sort_order: prev.length }])}
          className="flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-semibold hover:bg-blue-50 transition-colors">
          <Plus size={18} /> Add Another Task
        </button>
      </div>
    </StepShell>
  );

  /* ── STEP 3: Rewards ─────────────────────────────────────────────── */
  if (step === 3) return (
    <StepShell step={3} title="Rewards" subtitle="Define what participants can win."
      onBack={() => setStep(2)} onNext={saveRewards} nextLabel="Continue" saving={saving}>
      {error && <p className="text-red-600 text-sm mb-4 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 cursor-pointer">
          <input type="checkbox" checked={isLeaderboard} onChange={e => setIsLeaderboard(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 accent-blue-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Enable Leaderboard Ranking</p>
            <p className="text-xs text-gray-400">Rank participants and assign tiered rewards</p>
          </div>
        </label>
        {rewards.map((reward, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">Reward {i + 1}</span>
              <button type="button" onClick={() => {
                if (reward.id) deleteQuestReward(supabase, reward.id).catch(console.error);
                setRewards(prev => prev.filter((_, j) => j !== i));
              }} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Reward Type</label>
                <select value={reward.reward_type ?? "other"} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, reward_type: e.target.value as RewardType } : r))}
                  className="w-full h-9 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-700 focus:outline-none focus:border-blue-500">
                  {REWARD_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
                </select>
              </div>
            </div>
            <input value={reward.title ?? ""} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, title: e.target.value } : r))}
              placeholder="Reward title (e.g. ₹10,000 Cash Prize) *" className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:border-blue-500 focus:bg-white" />
            <input value={reward.value ?? ""} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
              placeholder="Value (e.g. ₹10,000)" className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:border-blue-500 focus:bg-white" />
            {isLeaderboard && (
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={reward.rank_from ?? ""} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, rank_from: parseInt(e.target.value) || null } : r))}
                  placeholder="Rank from" className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:border-blue-500" />
                <input type="number" value={reward.rank_to ?? ""} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, rank_to: parseInt(e.target.value) || null } : r))}
                  placeholder="Rank to" className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            )}
            <textarea value={reward.description ?? ""} onChange={e => setRewards(prev => prev.map((r, j) => j === i ? { ...r, description: e.target.value } : r))}
              placeholder="Additional details about this reward..." rows={2}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none" />
          </div>
        ))}
        <button type="button" onClick={() => setRewards(prev => [...prev, { reward_type: "other", title: "", is_leaderboard: isLeaderboard }])}
          className="flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-semibold hover:bg-blue-50 transition-colors">
          <Plus size={18} /> Add Reward
        </button>
        {rewards.length === 0 && (
          <p className="text-xs text-gray-400 text-center">You can skip this step if there are no rewards.</p>
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
          <label className="text-sm font-semibold text-gray-700">Eligibility</label>
          <textarea value={eligibility} onChange={e => setEligibility(e.target.value)} rows={3}
            placeholder="Who can participate? (e.g. Open to all, 18+ only, Indian residents only...)"
            className="w-full rounded-xl border border-gray-200 bg-white text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-100 resize-none" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-gray-700">Participation Rules</label>
          <textarea value={rules} onChange={e => setRules(e.target.value)} rows={6}
            placeholder="List the rules, proof requirements, reward criteria, disqualification rules..."
            className="w-full rounded-xl border border-gray-200 bg-white text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-100 resize-none" />
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-700 font-medium">By submitting, you confirm that all reward information provided is accurate and you are legally permitted to offer these rewards.</p>
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
          { value: "public", title: "Public", desc: "Anyone on STRIVUP can discover and join", icon: "🌍" },
          { value: "community_only", title: "Community Only", desc: "Only members of your community can join", icon: "👥" },
          { value: "invite_only", title: "Invite Only", desc: "Only people with an invite link can join", icon: "🔗" },
        ] as const).map(opt => (
          <button key={opt.value} type="button" onClick={() => setVisibility(opt.value)}
            className={`flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
              visibility === opt.value ? "border-blue-500 bg-blue-50" : "border-gray-100 bg-white hover:border-gray-200"
            }`}>
            <span className="text-2xl mt-0.5">{opt.icon}</span>
            <div>
              <p className={`text-sm font-bold ${visibility === opt.value ? "text-blue-700" : "text-gray-900"}`}>{opt.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </StepShell>
  );

  /* ── STEP 6: Review ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col">
      <div className="h-1 bg-blue-600 w-full" />
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 sticky top-0 z-30">
        <button onClick={() => setStep(5)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"><ChevronLeft size={20} className="text-gray-600" /></button>
        <div>
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Step 6 of 6 · Review</p>
          <h1 className="text-[18px] font-black text-gray-900">Review & Publish</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 pb-36 max-w-lg mx-auto w-full flex flex-col gap-4">
        {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">{error}</p>}

        {/* Cover preview */}
        {coverUrl && (
          <div className="w-full h-48 rounded-2xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-3">
          <h2 className="text-xl font-black text-gray-900">{title}</h2>
          {category && <span className="self-start text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">{category}</span>}
          {description && <p className="text-sm text-gray-600 leading-relaxed">{description}</p>}
        </div>

        {tasks.filter(t => t.title?.trim()).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Tasks ({tasks.filter(t => t.title?.trim()).length})</p>
            <div className="flex flex-col gap-2">
              {tasks.filter(t => t.title?.trim()).map((t, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-blue-600">{i+1}</span>
                  </div>
                  <p className="text-sm text-gray-800 font-medium">{t.title}</p>
                  <span className="ml-auto text-[10px] text-gray-400 shrink-0">{PROOF_TYPES.find(p => p.value === t.proof_type)?.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {rewards.filter(r => r.title?.trim()).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Rewards ({rewards.filter(r => r.title?.trim()).length})</p>
            {rewards.filter(r => r.title?.trim()).map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className="text-lg">🏆</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                  {r.rank_from && <p className="text-xs text-gray-400">Rank {r.rank_from}{r.rank_to ? `–${r.rank_to}` : "+"}</p>}
                </div>
                {r.value && <span className="text-sm font-bold text-green-600 shrink-0">{r.value}</span>}
              </div>
            ))}
          </div>
        )}

        {!isVerified && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4">
            <p className="text-sm font-bold text-amber-800">⚠ Business Verification Required</p>
            <p className="text-xs text-amber-700 mt-1">Your business must be verified before publishing a Quest. You can save as draft and publish once verified.</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 py-4 flex flex-col gap-2">
        {isVerified && (
          <button onClick={handlePublish} disabled={saving}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-[15px] transition-all">
            {saving ? "Publishing…" : "🚀 Publish Quest"}
          </button>
        )}
        <button onClick={handleSaveDraft} disabled={saving}
          className="w-full h-11 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors">
          Save as Draft
        </button>
      </div>
    </div>
  );
}

export default function CreateQuestPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}><CreateQuestContent /></Suspense>;
}
