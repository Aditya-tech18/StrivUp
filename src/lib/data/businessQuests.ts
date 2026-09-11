/**
 * src/lib/data/businessQuests.ts
 * All Quest CRUD operations for the Business side.
 * Only operates on quests where creator_id = auth.uid().
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type QuestStatus = "draft"|"pending_review"|"published"|"active"|"paused"|"completed"|"expired"|"rejected"|"cancelled"|"archived";
export type ProofType = "photo"|"video"|"screenshot"|"photo_text"|"qr"|"bill_document"|"location"|"manual"|"none";
export type RewardType = "cash"|"coupon"|"gift_card"|"discount"|"product"|"subscription"|"voucher"|"certificate"|"internship"|"custom"|"other";

export interface QuestTask {
  id: string;
  quest_id: string;
  title: string;
  description: string | null;
  proof_type: ProofType;
  is_required: boolean;
  sort_order: number;
  instructions: string | null;
  created_at: string;
}

export interface QuestReward {
  id: string;
  quest_id: string;
  reward_type: RewardType;
  title: string;
  description: string | null;
  value: string | null;
  rank_from: number | null;
  rank_to: number | null;
  is_leaderboard: boolean;
  created_at: string;
}

export interface Quest {
  id: string;
  creator_id: string;
  business_id: string | null;
  business_name: string | null;
  title: string;
  description: string | null;
  category: string | null;
  cover_url: string | null;
  thumbnail_url: string | null;
  destination_link: string | null;
  location_name: string | null;
  start_date: string | null;
  end_date: string | null;
  visibility: "public"|"community_only"|"invite_only";
  quest_status: QuestStatus;
  rules: string | null;
  eligibility: string | null;
  reward_description: string | null;
  rejection_reason: string | null;
  participant_count: number;
  view_count: number;
  completion_count: number;
  proof_type: string;
  is_hot: boolean;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface QuestTaskSubmission {
  id: string;
  quest_id: string;
  task_id: string;
  user_id: string;
  media_url: string | null;
  caption: string | null;
  verification_status: "pending"|"approved"|"rejected"|"resubmission_required";
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string;
  // joined
  participant?: { full_name: string|null; avatar_url: string|null; username: string|null };
  task?: { title: string };
}

export const QUEST_CATEGORIES = [
  "Fitness & Health","Food & Beverage","Retail & Shopping","Education & Learning",
  "Technology","Fashion & Beauty","Travel & Adventure","Entertainment","Finance",
  "Professional Services","Community","Lifestyle","Sports","Other"
] as const;

export const PROOF_TYPES: { value: ProofType; label: string }[] = [
  { value: "photo",         label: "📷 Photo" },
  { value: "video",         label: "🎥 Video" },
  { value: "screenshot",    label: "📸 Screenshot" },
  { value: "photo_text",    label: "📝 Photo + Text" },
  { value: "qr",            label: "🔲 QR Code" },
  { value: "bill_document", label: "📄 Bill / Document" },
  { value: "location",      label: "📍 Location" },
  { value: "manual",        label: "✋ Manual Verification" },
  { value: "none",          label: "✅ No Proof Required" },
];

export const REWARD_TYPES: { value: RewardType; label: string }[] = [
  { value: "cash",          label: "💵 Cash Prize" },
  { value: "coupon",        label: "🏷 Coupon" },
  { value: "gift_card",     label: "🎁 Gift Card" },
  { value: "discount",      label: "% Discount" },
  { value: "product",       label: "📦 Product" },
  { value: "subscription",  label: "📱 Subscription" },
  { value: "voucher",       label: "🎫 Voucher" },
  { value: "certificate",   label: "🏆 Certificate" },
  { value: "internship",    label: "💼 Internship" },
  { value: "custom",        label: "⭐ Custom Reward" },
  { value: "other",         label: "Other" },
];

/* ── Get business quests ─────────────────────────────────────────── */
export async function getBusinessQuests(
  supabase: SupabaseClient,
  businessId: string,
  options: { status?: QuestStatus; limit?: number; offset?: number } = {}
): Promise<Quest[]> {
  let q = supabase.from("quests").select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 20);
  if (options.status) q = q.eq("quest_status", options.status);
  if (options.offset) q = q.range(options.offset, options.offset + (options.limit ?? 20) - 1);
  const { data, error } = await q;
  if (error) { console.error("[getBusinessQuests]", error.message); return []; }
  return (data ?? []) as Quest[];
}

/* ── Get single quest ────────────────────────────────────────────── */
export async function getQuestById(supabase: SupabaseClient, questId: string): Promise<Quest|null> {
  const { data, error } = await supabase.from("quests").select("*").eq("id", questId).maybeSingle();
  if (error) { console.error("[getQuestById]", error.message); return null; }
  return data as Quest|null;
}

/* ── Create or update quest ──────────────────────────────────────── */
export async function upsertQuest(
  supabase: SupabaseClient,
  fields: Partial<Quest> & { id?: string },
  businessId: string
): Promise<Quest> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { id, ...rest } = fields;
  const payload = { ...rest, creator_id: user.id, business_id: businessId };
  let result;
  if (id) {
    const { data, error } = await supabase.from("quests").update(payload).eq("id", id).eq("creator_id", user.id).select("*").single();
    if (error) throw new Error(error.message);
    result = data;
  } else {
    const { data, error } = await supabase.from("quests").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    result = data;
  }
  return result as Quest;
}

/* ── Quest tasks ─────────────────────────────────────────────────── */
export async function getQuestTasks(supabase: SupabaseClient, questId: string): Promise<QuestTask[]> {
  const { data, error } = await supabase.from("quest_tasks").select("*")
    .eq("quest_id", questId).order("sort_order");
  if (error) { console.error("[getQuestTasks]", error.message); return []; }
  return (data ?? []) as QuestTask[];
}

export async function upsertQuestTask(supabase: SupabaseClient, task: Partial<QuestTask> & { quest_id: string }): Promise<QuestTask> {
  const { id, ...rest } = task;
  let result;
  if (id) {
    const { data, error } = await supabase.from("quest_tasks").update(rest).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    result = data;
  } else {
    const { data, error } = await supabase.from("quest_tasks").insert(rest).select("*").single();
    if (error) throw new Error(error.message);
    result = data;
  }
  return result as QuestTask;
}

export async function deleteQuestTask(supabase: SupabaseClient, taskId: string): Promise<void> {
  const { error } = await supabase.from("quest_tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message);
}

/* ── Quest rewards ───────────────────────────────────────────────── */
export async function getQuestRewards(supabase: SupabaseClient, questId: string): Promise<QuestReward[]> {
  const { data, error } = await supabase.from("quest_rewards").select("*").eq("quest_id", questId).order("rank_from");
  if (error) { console.error("[getQuestRewards]", error.message); return []; }
  return (data ?? []) as QuestReward[];
}

export async function upsertQuestReward(supabase: SupabaseClient, reward: Partial<QuestReward> & { quest_id: string }): Promise<QuestReward> {
  const { id, ...rest } = reward;
  let result;
  if (id) {
    const { data, error } = await supabase.from("quest_rewards").update(rest).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    result = data;
  } else {
    const { data, error } = await supabase.from("quest_rewards").insert(rest).select("*").single();
    if (error) throw new Error(error.message);
    result = data;
  }
  return result as QuestReward;
}

export async function deleteQuestReward(supabase: SupabaseClient, rewardId: string): Promise<void> {
  const { error } = await supabase.from("quest_rewards").delete().eq("id", rewardId);
  if (error) throw new Error(error.message);
}

/* ── Publish quest ───────────────────────────────────────────────── */
export async function publishQuest(supabase: SupabaseClient, questId: string, businessId: string): Promise<void> {
  // Validate business is verified
  const { data: bp } = await supabase.from("business_profiles").select("verification_status").eq("id", businessId).single();
  if (!bp || bp.verification_status !== "verified") throw new Error("Business must be verified before publishing a Quest.");
  // Check at least 1 task
  const { count } = await supabase.from("quest_tasks").select("id", { count: "exact", head: true }).eq("quest_id", questId);
  if (!count || count < 1) throw new Error("Quest must have at least one task.");
  const { error } = await supabase.from("quests").update({ quest_status: "active" }).eq("id", questId).eq("business_id", businessId);
  if (error) throw new Error(error.message);
}

/* ── Proof submissions ───────────────────────────────────────────── */
export async function getQuestSubmissions(
  supabase: SupabaseClient,
  questId: string,
  status?: "pending"|"approved"|"rejected"|"resubmission_required"
): Promise<QuestTaskSubmission[]> {
  let q = supabase.from("quest_task_submissions")
    .select("*, participant:profiles!user_id(full_name,avatar_url,username), task:quest_tasks!task_id(title)")
    .eq("quest_id", questId)
    .order("submitted_at", { ascending: false })
    .limit(50);
  if (status) q = q.eq("verification_status", status);
  const { data, error } = await q;
  if (error) { console.error("[getQuestSubmissions]", error.message); return []; }
  return (data ?? []) as QuestTaskSubmission[];
}

export async function reviewSubmission(
  supabase: SupabaseClient,
  submissionId: string,
  status: "approved"|"rejected"|"resubmission_required",
  rejectionReason?: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("quest_task_submissions").update({
    verification_status: status,
    rejection_reason: rejectionReason ?? null,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }).eq("id", submissionId);
  if (error) throw new Error(error.message);
}

/* ── Analytics ───────────────────────────────────────────────────── */
export async function getQuestAnalytics(supabase: SupabaseClient, questId: string) {
  const [questRes, eventsRes, participantsRes, submissionsRes] = await Promise.all([
    supabase.from("quests").select("view_count,participant_count,completion_count").eq("id", questId).single(),
    supabase.from("quest_events").select("event_type, created_at").eq("quest_id", questId),
    supabase.from("quest_participants").select("verification_status, joined_at, completed_at").eq("quest_id", questId),
    supabase.from("quest_task_submissions").select("verification_status, task_id").eq("quest_id", questId),
  ]);
  const quest = questRes.data;
  const events = eventsRes.data ?? [];
  const participants = participantsRes.data ?? [];
  const submissions = submissionsRes.data ?? [];
  const totalJoins = participants.length;
  const completed = participants.filter((p: { verification_status: string; completed_at: string|null }) => p.verification_status === "approved" || p.completed_at).length;
  const pending = submissions.filter((s: { verification_status: string }) => s.verification_status === "pending").length;
  const approved = submissions.filter((s: { verification_status: string }) => s.verification_status === "approved").length;
  const rejected = submissions.filter((s: { verification_status: string }) => s.verification_status === "rejected").length;
  return {
    views: quest?.view_count ?? 0,
    joins: totalJoins,
    completions: completed,
    completionRate: totalJoins > 0 ? Math.round((completed/totalJoins)*100) : 0,
    pendingProofs: pending,
    approvedProofs: approved,
    rejectedProofs: rejected,
    approvalRate: (approved+rejected) > 0 ? Math.round((approved/(approved+rejected))*100) : 0,
    eventTimeline: events,
  };
}
