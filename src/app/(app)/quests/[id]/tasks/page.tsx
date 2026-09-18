"use client";
/**
 * /quests/[id]/tasks — User task progress page for a business Quest.
 * Shows all tasks, their submission status, allows uploading proof (max 2 images).
 */
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, CheckCircle2, Clock, Lock, Upload, X, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface QuestTask {
  id: string;
  title: string;
  description: string | null;
  proof_type: string;
  is_required: boolean;
  sort_order: number;
  instructions: string | null;
}

interface TaskSubmission {
  id: string;
  task_id: string;
  verification_status: "pending" | "approved" | "rejected" | "resubmission_required";
  media_url: string | null;
  media_url_2: string | null;
  caption: string | null;
  rejection_reason: string | null;
  submitted_at: string;
}

interface QuestInfo {
  id: string;
  title: string;
  business_name: string | null;
  quest_status: string;
  cover_url: string | null;
  thumbnail_url: string | null;
}

const STATUS_CFG = {
  pending:               { label: "Pending Review",   cls: "text-amber-700 bg-amber-50", icon: Clock },
  approved:              { label: "Approved",          cls: "text-green-700 bg-green-50", icon: CheckCircle2 },
  rejected:              { label: "Rejected",          cls: "text-red-700 bg-red-50",     icon: XCircle },
  resubmission_required: { label: "Resubmit Required", cls: "text-purple-700 bg-purple-50", icon: XCircle },
} as const;

const PROOF_LABEL: Record<string, string> = {
  photo: "Upload up to 2 photos",
  video: "Upload video",
  screenshot: "Upload screenshot",
  photo_text: "Upload photo + write description",
  qr: "QR code verification",
  bill_document: "Upload bill / document",
  location: "Location check-in",
  manual: "Manual verification required",
  none: "No proof required",
};

export default function QuestTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: questId } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [quest, setQuest] = useState<QuestInfo | null>(null);
  const [tasks, setTasks] = useState<QuestTask[]>([]);
  const [submissions, setSubmissions] = useState<Map<string, TaskSubmission>>(new Map());
  const [isParticipant, setIsParticipant] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Upload state per task
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [caption, setCaption] = useState<Record<string, string>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string[]>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File[]>>({});

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace(`/login?redirectTo=/quests/${questId}/tasks`); return; }
      setUserId(user.id);

      const [questRes, tasksRes, participantRes, submissionsRes] = await Promise.all([
        supabase.from("quests").select("id,title,business_name,quest_status,cover_url,thumbnail_url").eq("id", questId).maybeSingle(),
        supabase.from("quest_tasks").select("*").eq("quest_id", questId).order("sort_order"),
        supabase.from("quest_participants").select("id").eq("quest_id", questId).eq("user_id", user.id).maybeSingle(),
        supabase.from("quest_task_submissions").select("*").eq("quest_id", questId).eq("user_id", user.id),
      ]);

      if (!questRes.data) { router.replace("/quests"); return; }
      setQuest(questRes.data as QuestInfo);
      setTasks((tasksRes.data ?? []) as QuestTask[]);
      setIsParticipant(!!participantRes.data);

      // Build map: task_id → submission
      const subMap = new Map<string, TaskSubmission>();
      for (const s of (submissionsRes.data ?? [])) {
        subMap.set(s.task_id, s as TaskSubmission);
      }
      setSubmissions(subMap);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questId]);

  const handleFileSelect = (taskId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    // Max 2 images
    const existingSub = submissions.get(taskId);
    const existingCount = existingSub?.media_url ? (existingSub.media_url_2 ? 2 : 1) : 0;
    const newSelected = selectedFiles[taskId] ?? [];
    const allowed = 2 - existingCount - newSelected.length;

    if (allowed <= 0) {
      setUploadError(`Maximum 2 images allowed per task.`);
      return;
    }

    const toAdd = files.slice(0, allowed);
    const previews = toAdd.map(f => URL.createObjectURL(f));

    setSelectedFiles(prev => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), ...toAdd] }));
    setPreviewUrls(prev => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), ...previews] }));
    setUploadError(null);
  };

  const removeSelectedFile = (taskId: string, idx: number) => {
    setSelectedFiles(prev => {
      const arr = [...(prev[taskId] ?? [])];
      arr.splice(idx, 1);
      return { ...prev, [taskId]: arr };
    });
    setPreviewUrls(prev => {
      const arr = [...(prev[taskId] ?? [])];
      URL.revokeObjectURL(arr[idx]);
      arr.splice(idx, 1);
      return { ...prev, [taskId]: arr };
    });
  };

  const handleSubmit = async (task: QuestTask) => {
    if (!userId) return;
    const files = selectedFiles[task.id] ?? [];
    const existingSub = submissions.get(task.id);

    // For non-photo tasks with no file requirement
    if (task.proof_type === "none" || task.proof_type === "manual") {
      // Submit without media
      const { data, error } = await supabase.from("quest_task_submissions").upsert({
        quest_id: questId,
        task_id: task.id,
        user_id: userId,
        verification_status: task.proof_type === "none" ? "approved" : "pending",
        caption: caption[task.id] ?? null,
      }, { onConflict: "quest_id,task_id,user_id" }).select().single();
      if (error) { setUploadError(error.message); return; }
      setSubmissions(prev => new Map(prev).set(task.id, data as TaskSubmission));
      return;
    }

    if (files.length === 0 && !existingSub?.media_url) {
      setUploadError("Please select at least one image.");
      return;
    }

    setUploading(task.id);
    setUploadError(null);

    try {
      let url1 = existingSub?.media_url ?? null;
      let url2 = existingSub?.media_url_2 ?? null;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${userId}/quest-proofs/${questId}/${task.id}-${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage.from("proof-media").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("proof-media").getPublicUrl(path);
        if (!url1) url1 = pub.publicUrl;
        else if (!url2) url2 = pub.publicUrl;
      }

      const { data, error } = await supabase.from("quest_task_submissions").upsert({
        quest_id: questId,
        task_id: task.id,
        user_id: userId,
        media_url: url1,
        media_url_2: url2,
        caption: caption[task.id] ?? null,
        verification_status: "pending",
      }, { onConflict: "quest_id,task_id,user_id" }).select().single();

      if (error) throw error;
      setSubmissions(prev => new Map(prev).set(task.id, data as TaskSubmission));
      setSelectedFiles(prev => ({ ...prev, [task.id]: [] }));
      setPreviewUrls(prev => ({ ...prev, [task.id]: [] }));
      setCaption(prev => ({ ...prev, [task.id]: "" }));

      // Notify if all tasks approved
      const allApproved = tasks.every(t => {
        const s = t.id === task.id ? data : submissions.get(t.id);
        return !t.is_required || s?.verification_status === "approved";
      });
      if (allApproved) {
        await supabase.from("quest_participants").update({ completed_at: new Date().toISOString(), verification_status: "approved" })
          .eq("quest_id", questId).eq("user_id", userId);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const handleJoin = async () => {
    if (!userId) return;
    const { error } = await supabase.from("quest_participants").insert({ quest_id: questId, user_id: userId, verification_status: "pending" });
    if (!error) setIsParticipant(true);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!quest) return null;

  const completedCount = tasks.filter(t => {
    const s = submissions.get(t.id);
    return s?.verification_status === "approved";
  }).length;
  const totalRequired = tasks.filter(t => t.is_required).length;

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 sticky top-0 z-30">
        <Link href={`/quests/${questId}`}><ArrowLeft size={22} className="text-gray-600" /></Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 font-medium">{quest.business_name ?? "Quest"}</p>
          <h1 className="text-[15px] font-black text-gray-900 truncate">{quest.title}</h1>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400">Progress</p>
          <p className="text-sm font-black text-blue-600">{completedCount}/{totalRequired}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100">
        <div className="h-1.5 bg-blue-600 transition-all duration-500"
          style={{ width: totalRequired > 0 ? `${(completedCount/totalRequired)*100}%` : "0%" }} />
      </div>

      <div className="px-5 py-5 max-w-lg mx-auto flex flex-col gap-4">
        {uploadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
            {uploadError}
          </div>
        )}

        {!isParticipant && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-semibold text-blue-900">Join this Quest to complete tasks</p>
            <button onClick={handleJoin}
              className="h-10 px-6 rounded-xl bg-blue-600 text-white font-bold text-sm">
              Join Quest
            </button>
          </div>
        )}

        {tasks.map((task, index) => {
          const sub = submissions.get(task.id);
          const sc = sub ? STATUS_CFG[sub.verification_status] : null;
          const isSubmitting = uploading === task.id;
          const files = selectedFiles[task.id] ?? [];
          const previews = previewUrls[task.id] ?? [];
          const isApproved = sub?.verification_status === "approved";
          const canResubmit = sub?.verification_status === "rejected" || sub?.verification_status === "resubmission_required";
          const needsFile = !["none","manual"].includes(task.proof_type);
          const hasExistingMedia = !!(sub?.media_url);
          const existingCount = hasExistingMedia ? (sub?.media_url_2 ? 2 : 1) : 0;
          const canAddMore = existingCount + files.length < 2;

          return (
            <div key={task.id} className={`bg-white rounded-2xl border overflow-hidden ${isApproved ? "border-green-200" : "border-gray-100"}`}>
              {/* Task header */}
              <div className={`px-4 py-3 flex items-start gap-3 border-b ${isApproved ? "bg-green-50 border-green-100" : "border-gray-50"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 font-black text-sm ${
                  isApproved ? "bg-green-600 text-white" : "bg-blue-100 text-blue-600"
                }`}>
                  {isApproved ? <Check size={14} strokeWidth={3} /> : index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-gray-900">{task.title}</p>
                    {task.is_required && <span className="text-[10px] text-red-500 font-semibold">Required</span>}
                  </div>
                  {task.description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{task.description}</p>}
                  {task.instructions && <p className="text-xs text-blue-600 mt-1 italic">{task.instructions}</p>}
                  <p className="text-[11px] text-gray-400 mt-1">{PROOF_LABEL[task.proof_type] ?? task.proof_type}</p>
                </div>
              </div>

              {/* Status badge */}
              {sc && (
                <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 ${sc.cls}`}>
                  <sc.icon size={14} />
                  <span className="text-xs font-semibold">{sc.label}</span>
                  {sub?.rejection_reason && (
                    <span className="text-xs ml-1 opacity-75">— {sub.rejection_reason}</span>
                  )}
                </div>
              )}

              {/* Submission area — only if not approved or can resubmit */}
              {isParticipant && !isApproved && (!sub || canResubmit) && (
                <div className="p-4 flex flex-col gap-3">
                  {/* Existing uploaded images */}
                  {hasExistingMedia && (
                    <div className="flex gap-2">
                      {[sub?.media_url, sub?.media_url_2].filter(Boolean).map((url, i) => (
                        <div key={i} className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url!} alt="proof" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      <div className="flex items-center">
                        <span className="text-xs text-gray-400">{existingCount}/2 uploaded</span>
                      </div>
                    </div>
                  )}

                  {/* New file previews */}
                  {previews.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {previews.map((url, i) => (
                        <div key={i} className="relative w-20 h-20">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="preview" className="w-20 h-20 rounded-xl object-cover" />
                          <button onClick={() => removeSelectedFile(task.id, i)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center">
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* File upload */}
                  {needsFile && canAddMore && (
                    <label className="flex items-center justify-center gap-2 h-10 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-semibold cursor-pointer hover:bg-blue-50 transition-colors">
                      <Upload size={16} /> {canAddMore ? `Add Photo (${2 - existingCount - files.length} remaining)` : "Max photos uploaded"}
                      <input type="file" accept="image/*" className="sr-only" multiple onChange={e => handleFileSelect(task.id, e)} />
                    </label>
                  )}

                  {/* Caption */}
                  {(task.proof_type === "photo_text" || task.proof_type === "text") && (
                    <textarea value={caption[task.id] ?? ""} onChange={e => setCaption(prev => ({ ...prev, [task.id]: e.target.value }))}
                      placeholder="Describe your activity..." rows={2}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none" />
                  )}

                  <button onClick={() => handleSubmit(task)} disabled={isSubmitting || (needsFile && files.length === 0 && !hasExistingMedia)}
                    className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
                    {isSubmitting
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting…</>
                      : <><Upload size={15} />{canResubmit ? "Resubmit Proof" : "Submit Proof"}</>
                    }
                  </button>
                </div>
              )}

              {/* No proof needed */}
              {isParticipant && task.proof_type === "none" && !sub && (
                <div className="p-4">
                  <button onClick={() => handleSubmit(task)}
                    className="w-full h-10 rounded-xl bg-green-600 text-white font-bold text-sm flex items-center justify-center gap-2">
                    <Check size={15} /> Mark as Complete
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* All done */}
        {isParticipant && tasks.length > 0 && completedCount === totalRequired && totalRequired > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-green-600 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-white" />
            </div>
            <h3 className="text-[17px] font-black text-green-900">Quest Completed! 🎉</h3>
            <p className="text-sm text-green-700">All tasks approved. Rewards will be announced by the business.</p>
          </div>
        )}
      </div>
    </div>
  );
}
