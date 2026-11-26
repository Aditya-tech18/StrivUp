const DAY_MS = 86_400_000;

export function challengeDeadline(start: string | null, durationDays: number | null) {
  if (!start || !durationDays || durationDays < 0) return null;
  const end = Date.parse(start) + durationDays * DAY_MS;
  return Number.isFinite(end) ? new Date(end).toISOString() : null;
}

export function isPastDeadline(deadline: string | null | undefined, now = Date.now()) {
  return Boolean(deadline && Date.parse(deadline) <= now);
}

export interface QuestSchedule {
  start_date?: string | null;
  end_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  status?: string | null;
  quest_status?: string | null;
  business_id?: string | null;
}

export type QuestPhase = "upcoming" | "live" | "closed";

export function questPhase(quest: QuestSchedule, now = Date.now()): QuestPhase {
  const status = quest.quest_status;
  const end = quest.end_date ?? quest.ends_at;
  if (["completed", "expired", "cancelled", "archived"].includes(status ?? "") || isPastDeadline(end, now)) return "closed";

  const start = quest.start_date ?? quest.starts_at;
  if (start && Date.parse(start) > now) return "upcoming";
  if (status === "active" || status === "published") return "live";

  if (quest.business_id) return "upcoming";
  if (quest.status === "active") return "live";
  if (quest.status === "inactive") return "closed";
  return "upcoming";
}
