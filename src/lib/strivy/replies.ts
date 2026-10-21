/**
 * src/lib/strivy/replies.ts
 *
 * Template replies in Strivy's voice: a smart accountability buddy. Short by
 * default (1 to 3 sentences; lists only when the person asks for details),
 * slightly cheeky, never shaming, and in the person's own language style.
 *
 * Every user-specific detail in a reply is read from the facts object. The
 * wording comes from phrases.ts, per language with an English fallback; the
 * values never do.
 *
 * Quest and challenge facts never mix: "how's my quest progress?" is answered
 * from the quest's own tasks, never from challenge days or the weekly
 * overview (IntentResult.topic / detail carry what was asked).
 *
 * Tone guard: teasing only when things are going fine. After a rejection, a
 * broken streak or a low moment, Strivy is encouraging instead. The rules and
 * the words Strivy never uses live in persona.ts.
 *
 * These drafts are the source of truth for every reply. A future model may
 * only rephrase them, and grounding.ts rejects any rephrase that adds facts.
 */
import { STARTER_PROMPTS } from "./config";
import { formatAnswer, solveMath } from "./general";
import { STRIVUP_COMPANY, STRIVUP_TEAM } from "./knowledge";
import type { StrivyLang } from "./language";
import { count, pick, say, spanOf, whatLabel, type PhraseKey, type Vars } from "./phrases";
import type {
  ChallengeFact,
  ChallengeTaskFact,
  KnowledgeSnippet,
  ProofFact,
  QuestFact,
  StrivyChip,
  StrivyContext,
  StrivyFacts,
  StrivyIntent,
  StrivyLink,
  StrivyReply,
  StrivyTopic,
} from "./types";

/* ── Small helpers ───────────────────────────────────────────────────────── */

/** Everything one reply needs to phrase itself. */
interface R {
  lang: StrivyLang;
  dialect?: StrivyContext["dialect"];
  seed: string;
  /** The person asked for the full list ("details", "sab dikhao"). */
  detail: boolean;
  facts: StrivyFacts;
}

const WANTS_DETAIL =
  /\b(details?|detailed|list|all of them|breakdown|full|everything|each|sab|saare|sabhi|poora|pura|samjha|samjhao|elaborate)\b|सब|सारे|पूरा|समझा|विस्तार/i;

const SUGGEST = {
  streak: "How's my streak?",
  quest: "What's my quest?",
  pending: "What's pending?",
  today: "What should I do today?",
  rewards: "Did I earn anything?",
  progress: "How's my progress?",
  time: "How much time do I have?",
  proof: "Did my proof get verified?",
  left: "What's left?",
};

/** A title as Strivy writes it: 'Veer Ji Chaap'. */
function q(title: string): string {
  return `'${title}'`;
}

function t(r: R, key: PhraseKey, vars: Vars = {}): string {
  return say(r.lang, key, vars, r.seed, r.dialect);
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

function reply(
  intent: StrivyIntent,
  text: string,
  extra: Partial<Omit<StrivyReply, "intent" | "text">> = {}
): StrivyReply {
  return {
    intent,
    text,
    chips: extra.chips ?? [],
    links: extra.links ?? [],
    suggestions: extra.suggestions ?? [],
  };
}

function couldNotLoad(r: R, intent: StrivyIntent, what: string): StrivyReply {
  return reply(intent, t(r, "couldNotLoad", { what: whatLabel(r.lang, what) }), {
    suggestions: ["How does STRIVUP work?"],
  });
}

function taskName(r: R, task: ChallengeTaskFact): string {
  if (task.title === task.challengeTitle) return q(task.challengeTitle);
  switch (r.lang) {
    case "en":
      return `${q(task.title)} in ${q(task.challengeTitle)}`;
    case "hinglish":
      return `${q(task.challengeTitle)} ka ${q(task.title)}`;
    case "hi":
      return `${q(task.challengeTitle)} का ${q(task.title)}`;
    case "bho":
      return `${q(task.challengeTitle)} के ${q(task.title)}`;
  }
}

const TASK_STATE: Record<StrivyLang, Record<ChallengeTaskFact["state"], string>> = {
  en: {
    done: "done ✅",
    pending: "proof pending review",
    rejected: "rejected, resubmit",
    todo: "to do",
  },
  hinglish: {
    done: "done ✅",
    pending: "review me",
    rejected: "reject hua, resubmit kar",
    todo: "baaki",
  },
  hi: {
    done: "पूरा ✅",
    pending: "review में",
    rejected: "reject हुआ, resubmit करो",
    todo: "बाकी",
  },
  bho: {
    done: "पूरा ✅",
    pending: "review में",
    rejected: "reject भइल, resubmit करीं",
    todo: "बाकी",
  },
};

function taskLine(r: R, task: ChallengeTaskFact): string {
  return `• ${taskName(r, task)} (${task.dayLabel}): ${TASK_STATE[r.lang][task.state]}`;
}

function openQuests(quests: QuestFact[] | undefined): QuestFact[] {
  return (quests ?? [])
    .filter((x) => !x.completed)
    .sort((a, b) => (a.endsAt ?? "9999").localeCompare(b.endsAt ?? "9999"));
}

function activeChallenges(challenges: ChallengeFact[] | undefined): ChallengeFact[] {
  return (challenges ?? []).filter((c) => c.status === "active");
}

function questLink(quest: QuestFact): StrivyLink {
  return { label: `Open ${q(quest.title)}`, href: `/quests/${quest.questId}` };
}

function challengeLink(id: string, title: string): StrivyLink {
  return { label: `Open ${q(title)}`, href: `/challenges/${id}` };
}

/** One challenge's standing: "'Read Daily': Day 4 of 21, 75% consistent, 🔥 3 days". */
function challengeStanding(r: R, c: ChallengeFact): string {
  const parts: string[] = [];
  if (c.currentDay !== null) {
    parts.push(
      c.durationDays
        ? t(r, "challengeDay", { day: c.currentDay, duration: c.durationDays })
        : `Day ${c.currentDay}`
    );
  }
  if (c.consistencyPct !== null) {
    parts.push(t(r, "challengeConsistency", { pct: Math.round(c.consistencyPct) }));
  }
  if (c.currentStreak > 0) parts.push(`🔥 ${count(r.lang, c.currentStreak, "day")}`);
  return parts.length > 0
    ? t(r, "challengeLine", { challenge: q(c.title), parts: parts.join(", ") })
    : q(c.title);
}

/** One quest's progress, in a sentence. */
function questProgress(r: R, quest: QuestFact): string {
  const vars = {
    quest: q(quest.title),
    approved: quest.tasksApproved,
    total: quest.tasksTotal,
    left: Math.max(0, quest.tasksTotal - quest.tasksApproved),
  };
  if (quest.tasksTotal === 0) return t(r, "questNoTasks", vars);
  if (quest.tasksApproved >= quest.tasksTotal) return t(r, "questAllApproved", vars);
  const pending =
    quest.tasksPending > 0
      ? t(r, "questPendingReview", { pending: count(r.lang, quest.tasksPending, "task") })
      : "";
  if (quest.tasksApproved === 0 && quest.tasksPending === 0) return t(r, "questNotStarted", vars);
  return t(r, "questUnderway", vars) + pending;
}

function questDeadline(r: R, quest: QuestFact): string {
  const vars = { quest: q(quest.title) };
  if (!quest.endsAt) return t(r, "questNoEnd", vars);
  const msLeft = new Date(quest.endsAt).getTime() - Date.now();
  if (msLeft <= 0) return t(r, "questEnded", vars);
  const hours = msLeft / 3_600_000;
  if (hours < 24) {
    return t(r, "questEndsInHours", {
      ...vars,
      left: count(r.lang, Math.max(1, Math.round(hours)), "hour"),
    });
  }
  return t(r, "questEndsInDays", {
    ...vars,
    date: formatDate(quest.endsAt),
    left: count(r.lang, Math.round(hours / 24), "day"),
  });
}

function challengeDeadline(r: R, c: ChallengeFact): string {
  const vars = { challenge: q(c.title) };
  if (c.durationDays === null || c.currentDay === null) return t(r, "challengeNoEnd", vars);
  const left = Math.max(0, c.durationDays - c.currentDay);
  if (left === 0) return t(r, "challengeLastDay", vars);
  return t(r, "challengeDaysLeft", {
    ...vars,
    left: count(r.lang, left, "day"),
    dayText: t(r, "challengeDay", { day: c.currentDay, duration: c.durationDays }),
  });
}

function names(titles: string[]): string {
  const shown = titles.slice(0, 3).map(q);
  return titles.length > 3 ? `${shown.join(", ")}…` : shown.join(", ");
}

const PROOF_STATUS: Record<StrivyLang, Record<ProofFact["status"], string>> = {
  en: {
    approved: "verified ✅",
    pending: "still pending review",
    rejected: "rejected",
    resubmission_required: "needs a resubmission",
    removed: "removed by a moderator",
  },
  hinglish: {
    approved: "verified ✅",
    pending: "abhi review me hai",
    rejected: "reject hua",
    resubmission_required: "dobara submit karna hai",
    removed: "moderator ne hata diya",
  },
  hi: {
    approved: "verified ✅",
    pending: "अभी review में है",
    rejected: "reject हुआ",
    resubmission_required: "दोबारा submit करना है",
    removed: "moderator ने हटा दिया",
  },
  bho: {
    approved: "verified ✅",
    pending: "अभी review में बा",
    rejected: "reject भइल",
    resubmission_required: "दोबारा submit करे के बा",
    removed: "moderator हटा देले बाड़े",
  },
};

function proofName(r: R, p: ProofFact): string {
  const what = p.kind === "challenge" ? p.label : q(p.label);
  switch (r.lang) {
    case "en":
      return p.kind === "challenge"
        ? `${p.label} of your challenge ${q(p.parentTitle)}`
        : `${q(p.label)} for your quest ${q(p.parentTitle)}`;
    case "hinglish":
      return `${q(p.parentTitle)} ka ${what}`;
    case "hi":
      return `${q(p.parentTitle)} का ${what}`;
    case "bho":
      return `${q(p.parentTitle)} के ${what}`;
  }
}

function proofStatusText(r: R, p: ProofFact): string {
  const base = PROOF_STATUS[r.lang][p.status];
  const hasReason =
    (p.status === "rejected" || p.status === "resubmission_required") && p.rejectionReason;
  return hasReason ? `${base}: ${p.rejectionReason}` : base;
}

function proofHref(p: ProofFact): string {
  return p.kind === "challenge" ? `/challenges/${p.parentId}` : `/quests/${p.parentId}`;
}

const REWARD_STATUS: Record<StrivyLang, Record<string, string>> = {
  en: {
    pending: "pending",
    eligible: "earned, waiting to be issued",
    processing: "being processed",
    fulfilled: "received",
    failed: "couldn't be issued",
    disputed: "under dispute",
  },
  hinglish: {
    pending: "pending",
    eligible: "earned, issue hona baaki",
    processing: "process ho raha",
    fulfilled: "mil gaya",
    failed: "issue nahi ho paya",
    disputed: "dispute me",
  },
  hi: {
    pending: "pending",
    eligible: "मिल गया, जारी होना बाकी",
    processing: "process हो रहा",
    fulfilled: "मिल गया",
    failed: "जारी नहीं हो पाया",
    disputed: "विवाद में",
  },
  bho: {
    pending: "pending",
    eligible: "मिलल, जारी होखे के बाकी",
    processing: "process होता",
    fulfilled: "मिल गइल",
    failed: "जारी ना हो पावल",
    disputed: "विवाद में",
  },
};

function knowledgeReply(
  intent: StrivyIntent,
  entries: KnowledgeSnippet[],
  seed: string
): StrivyReply {
  const text = entries.map((e) => e.body).join("\n\n");
  const links = entries.flatMap((e) => (e.link ? [e.link] : []));
  const status = entries[0]?.status;
  const chips: StrivyChip[] =
    status === "planned"
      ? [{ label: "Planned", tone: "pending" }]
      : status === "not_built"
        ? [{ label: "Not in STRIVUP", tone: "neutral" }]
        : [];
  return reply(intent, text, {
    links,
    chips,
    suggestions: pick(
      [
        [SUGGEST.quest, SUGGEST.streak],
        [SUGGEST.progress, SUGGEST.today],
      ],
      seed
    ),
  });
}

/* ── Intent replies ──────────────────────────────────────────────────────── */

function greetingReply(r: R): StrivyReply {
  const name = r.facts.firstName ? `, ${r.facts.firstName}` : "";
  return reply("greeting", t(r, "greeting", { name }), {
    suggestions: STARTER_PROMPTS.slice(0, 3),
  });
}

function thanksReply(r: R): StrivyReply {
  return reply("thanks", t(r, "thanks"));
}

function todayReply(r: R): StrivyReply {
  const { facts } = r;
  if (!facts.today) return couldNotLoad(r, "today", "today's tasks");

  const { tasks, completed, total, bestStreak } = facts.today;
  const quests = openQuests(facts.quests);
  const questsUnknown = facts.unavailable.includes("your quests");
  const open = tasks.filter((x) => x.state !== "done");

  if (total === 0 && quests.length === 0) {
    return reply(
      "today",
      questsUnknown ? t(r, "todayNothingQuestsUnknown") : t(r, "todayNothing"),
      {
        links: [
          { label: "Explore challenges", href: "/explore" },
          { label: "Browse quests", href: "/quests" },
        ],
        suggestions: ["How does STRIVUP work?"],
      }
    );
  }

  const chips: StrivyChip[] = [];
  const links: StrivyLink[] = [];
  let text: string;

  if (total > 0) {
    chips.push({
      label: `${completed}/${total} done today`,
      tone: completed === total ? "success" : "neutral",
    });
    if (bestStreak > 0) {
      chips.push({ label: `🔥 ${count("en", bestStreak, "day")}`, tone: "streak" });
    }
    if (open.length === 0) {
      text = t(r, "todayAllDone", { total, completed });
    } else {
      const next = open.find((x) => x.state === "rejected") ?? open[0];
      text = t(r, "todayOpen", { completed, total, task: taskName(r, next) });
      links.push(challengeLink(next.challengeId, next.challengeTitle));
    }
  } else {
    text = t(r, "todayNoChallengeTasks");
  }

  const quest = quests[0];
  if (quest && quest.tasksTotal > 0) {
    text += t(r, "todayQuest", {
      quest: q(quest.title),
      approved: quest.tasksApproved,
      total: quest.tasksTotal,
    });
    if (links.length === 0) links.push(questLink(quest));
  } else if (questsUnknown) {
    text += t(r, "todayQuestsUnknown");
  }

  const hasTodo = open.some((x) => x.state === "todo");
  if (open.some((x) => x.state === "rejected")) {
    text += t(r, "rejectedNudge");
  } else if (!quest && hasTodo && bestStreak >= 2) {
    text += t(r, "streakNudge", { streak: spanOf(r.lang, bestStreak) });
  } else if (!quest && hasTodo) {
    text += t(r, "startNudge");
  }

  if (r.detail) {
    const lines = [
      ...open.slice(0, 5).map((x) => taskLine(r, x)),
      ...quests.slice(0, 3).map((x) => `• ${questProgress(r, x)}`),
    ];
    if (lines.length > 0) text += `\n\n${lines.join("\n")}`;
  }

  return reply("today", text, {
    chips,
    links,
    suggestions: [SUGGEST.pending, SUGGEST.proof],
  });
}

function focusReply(r: R): StrivyReply {
  const { facts } = r;
  if (!facts.today) return couldNotLoad(r, "focus", "today's tasks");

  const streakFor = new Map((facts.challenges ?? []).map((c) => [c.challengeId, c.currentStreak]));
  const rejected = facts.today.tasks.find((x) => x.state === "rejected");
  const todo = facts.today.tasks
    .filter((x) => x.state === "todo")
    .sort((a, b) => (streakFor.get(b.challengeId) ?? 0) - (streakFor.get(a.challengeId) ?? 0));
  const quests = openQuests(facts.quests).filter((x) => x.tasksNeedAction > 0);

  if (rejected) {
    return reply("focus", t(r, "focusRejected", { task: taskName(r, rejected) }), {
      links: [challengeLink(rejected.challengeId, rejected.challengeTitle)],
      suggestions: [SUGGEST.proof],
    });
  }

  if (todo.length > 0) {
    const top = todo[0];
    const streak = streakFor.get(top.challengeId) ?? 0;
    const task = taskName(r, top);
    let text =
      streak >= 2
        ? t(r, "focusTodoStreak", { task, streak: spanOf(r.lang, streak) })
        : t(r, "focusTodo", { task });
    if (todo.length > 1) {
      text += t(r, "focusMore", { more: count(r.lang, todo.length - 1, "task") });
    }
    return reply("focus", text, {
      chips: streak > 0 ? [{ label: `🔥 ${count("en", streak, "day")}`, tone: "streak" }] : [],
      links: [challengeLink(top.challengeId, top.challengeTitle)],
      suggestions: [SUGGEST.quest, SUGGEST.time],
    });
  }

  if (quests.length > 0) {
    const quest = quests[0];
    const vars = { quest: q(quest.title), count: count(r.lang, quest.tasksNeedAction, "task") };
    return reply(
      "focus",
      facts.today.total > 0 ? t(r, "focusQuestAfterChallenges", vars) : t(r, "focusQuest", vars),
      { links: [questLink(quest)], suggestions: [SUGGEST.time, SUGGEST.rewards] }
    );
  }

  if (facts.today.total > 0) {
    const pending = facts.today.tasks.filter((x) => x.state === "pending").length;
    return reply(
      "focus",
      pending > 0
        ? t(r, "focusDonePending", { count: count(r.lang, pending, "proof") })
        : t(r, "focusDone"),
      { suggestions: [SUGGEST.progress] }
    );
  }

  return reply("focus", t(r, "focusNothing"), {
    links: [{ label: "Explore challenges", href: "/explore" }],
  });
}

function streakReply(r: R): StrivyReply {
  const { facts } = r;
  if (!facts.challenges) return couldNotLoad(r, "streak", "your streaks");

  const active = activeChallenges(facts.challenges);
  if (facts.challenges.length === 0) {
    return reply("streak", t(r, "noChallenge"), {
      links: [{ label: "Explore challenges", href: "/explore" }],
      suggestions: [SUGGEST.quest],
    });
  }

  const longest = Math.max(...facts.challenges.map((c) => c.longestStreak));
  const withStreak = active
    .filter((c) => c.currentStreak > 0)
    .sort((a, b) => b.currentStreak - a.currentStreak);

  if (withStreak.length === 0) {
    const best = longest > 0 ? t(r, "streakBest", { best: count(r.lang, longest, "day") }) : "";
    return reply("streak", t(r, active.length === 0 ? "noChallenge" : "streakNone") + best, {
      chips:
        longest > 0 ? [{ label: `Best: ${count("en", longest, "day")}`, tone: "neutral" }] : [],
      suggestions: [SUGGEST.pending],
    });
  }

  const top = withStreak[0];
  let text = t(r, "streakActive", {
    streak: spanOf(r.lang, top.currentStreak),
    challenge: q(top.title),
  });
  if (longest > top.currentStreak) {
    text += t(r, "streakLongest", { best: count(r.lang, longest, "day") });
  }
  if (r.detail && withStreak.length > 1) {
    text += `\n\n${withStreak
      .slice(1, 5)
      .map((c) => `• ${q(c.title)}: 🔥 ${count(r.lang, c.currentStreak, "day")}`)
      .join("\n")}`;
  }

  return reply("streak", text, {
    chips: [
      { label: `🔥 ${count("en", top.currentStreak, "day")}`, tone: "streak" },
      { label: `Best: ${count("en", longest, "day")}`, tone: "neutral" },
    ],
    links: [challengeLink(top.challengeId, top.title)],
    suggestions: [SUGGEST.pending, SUGGEST.time],
  });
}

function proofReply(r: R): StrivyReply {
  const { facts } = r;
  if (!facts.proofs) return couldNotLoad(r, "proof_status", "your proofs");
  if (facts.proofs.length === 0) {
    return reply("proof_status", t(r, "noProof"), { suggestions: [SUGGEST.pending] });
  }

  const [latest, ...rest] = facts.proofs;
  let text = t(r, "proofLatest", {
    proof: proofName(r, latest),
    when: relativeTime(latest.submittedAt),
    status: proofStatusText(r, latest),
  });
  if (latest.status === "approved") text += t(r, "proofApproved");
  if (latest.status === "rejected" || latest.status === "resubmission_required") {
    text += t(r, "proofRejected");
  }
  if (r.detail && rest.length > 0) {
    text += `\n\n${rest
      .slice(0, 3)
      .map((p) => `• ${proofName(r, p)}: ${proofStatusText(r, p)}`)
      .join("\n")}`;
  }

  const tone: StrivyChip["tone"] =
    latest.status === "approved" ? "success" : latest.status === "pending" ? "pending" : "error";
  const chipLabel =
    latest.status === "approved"
      ? "Verified"
      : latest.status === "pending"
        ? "Pending review"
        : latest.status === "removed"
          ? "Removed"
          : "Needs attention";

  return reply("proof_status", text, {
    chips: [{ label: chipLabel, tone }],
    links: [{ label: `Open ${q(latest.parentTitle)}`, href: proofHref(latest) }],
    suggestions: [SUGGEST.streak, SUGGEST.pending],
  });
}

/** "How's my progress?" with no quest or challenge named: the week, plus one line each. */
function progressReply(r: R): StrivyReply {
  const { facts } = r;
  if (!facts.week) return couldNotLoad(r, "progress", "this week's activity");

  const { activeDays } = facts.week;
  const key: PhraseKey =
    activeDays >= 5
      ? "weekStrong"
      : activeDays >= 3
        ? "weekSolid"
        : activeDays >= 1
          ? "weekSlow"
          : "weekNone";
  let text = t(r, key, { days: activeDays });

  const active = activeChallenges(facts.challenges);
  const quests = openQuests(facts.quests);
  if (active.length > 0) text += ` ${challengeStanding(r, active[0])}.`;
  const quest = quests[0];
  if (quest && quest.tasksTotal > 0) {
    text += t(r, "todayQuest", {
      quest: q(quest.title),
      approved: quest.tasksApproved,
      total: quest.tasksTotal,
    });
  }
  if (facts.challenges?.length === 0 && facts.quests?.length === 0) {
    text += t(r, "nothingToTrack");
  } else if (active.length === 0 && !quest && facts.unavailable.includes("your challenges")) {
    text += ` ${t(r, "couldNotLoad", { what: whatLabel(r.lang, "your challenges") })}`;
  }
  const completed = (facts.challenges ?? []).filter((c) => c.status === "completed").length;
  if (completed > 0)
    text += t(r, "completedChallenges", { done: count(r.lang, completed, "challenge") });

  if (r.detail && active.length > 1) {
    text += `\n\n${active
      .slice(0, 5)
      .map((c) => `• ${challengeStanding(r, c)}`)
      .join("\n")}`;
  }

  return reply("progress", text, {
    chips: [
      { label: `${activeDays}/7 days active`, tone: activeDays >= 5 ? "success" : "neutral" },
    ],
    links: quest && active.length === 0 ? [questLink(quest)] : [],
    suggestions: [SUGGEST.streak, SUGGEST.pending],
  });
}

function noActiveChallenge(r: R, intent: StrivyIntent, challenges: ChallengeFact[]): StrivyReply {
  const done = challenges.filter((c) => c.status === "completed").length;
  return reply(
    intent,
    done > 0
      ? t(r, "noActiveChallengeDoneBefore", { done: count(r.lang, done, "challenge") })
      : t(r, "noChallenge"),
    { links: [{ label: "Explore challenges", href: "/explore" }], suggestions: [SUGGEST.quest] }
  );
}

/** "Which challenges am I in?" and "how's my challenge progress?". */
function challengesReply(r: R, progress: boolean): StrivyReply {
  const { facts } = r;
  if (!facts.challenges) return couldNotLoad(r, "challenges", "your challenges");
  const active = activeChallenges(facts.challenges);
  if (active.length === 0) return noActiveChallenge(r, "challenges", facts.challenges);

  let text: string;
  if (progress || active.length === 1) {
    const shown = r.detail ? active.slice(0, 5) : active.slice(0, progress ? 3 : 1);
    text = shown.map((c) => challengeStanding(r, c)).join("\n");
    if (active.length === 1 && !progress) text = `${text} 🔥`;
  } else {
    text = t(r, "challengesActive", {
      count: active.length,
      names: names(active.map((c) => c.title)),
    });
    if (r.detail) text += `\n\n${active.map((c) => `• ${challengeStanding(r, c)}`).join("\n")}`;
  }

  return reply("challenges", text, {
    links: [challengeLink(active[0].challengeId, active[0].title)],
    suggestions: [SUGGEST.streak, SUGGEST.time],
  });
}

/** "What's my quest?" and "how's my quest progress?" — quest facts only. */
function questsReply(r: R, progress: boolean): StrivyReply {
  const { facts } = r;
  if (!facts.quests) return couldNotLoad(r, "quests", "your quests");
  const open = openQuests(facts.quests);
  const done = facts.quests.length - open.length;

  if (facts.quests.length === 0) {
    return reply("quests", t(r, progress ? "noQuestsForProgress" : "noQuests"), {
      links: [{ label: "Browse quests", href: "/quests" }],
      suggestions: [SUGGEST.streak],
    });
  }
  if (open.length === 0) {
    return reply("quests", t(r, "questsAllDone", { done: count(r.lang, done, "quest") }), {
      links: [{ label: "Browse quests", href: "/quests" }],
    });
  }

  let text: string;
  if (progress) {
    text = open
      .slice(0, r.detail ? 5 : 3)
      .map((x) => questProgress(r, x))
      .join("\n");
  } else if (open.length === 1) {
    const quest = open[0];
    text = t(r, "questOne", { quest: q(quest.title) });
    if (quest.tasksTotal > 0) {
      text += t(r, "questTasks", { approved: quest.tasksApproved, total: quest.tasksTotal });
    }
    if (quest.tasksPending > 0) {
      text += t(r, "questPendingReview", { pending: count(r.lang, quest.tasksPending, "task") });
    }
  } else {
    text = t(r, "questMany", { count: open.length, names: names(open.map((x) => x.title)) });
    if (r.detail) text += `\n\n${open.map((x) => `• ${questProgress(r, x)}`).join("\n")}`;
  }

  const first = open[0];
  const chips: StrivyChip[] =
    first.tasksTotal > 0
      ? [
          {
            label: `${first.tasksApproved}/${first.tasksTotal} tasks approved`,
            tone: first.tasksApproved >= first.tasksTotal ? "success" : "neutral",
          },
        ]
      : [];

  return reply("quests", text, {
    chips: open.length === 1 || progress ? chips : [],
    links: [questLink(first)],
    suggestions: [SUGGEST.time, SUGGEST.rewards],
  });
}

/**
 * "How many days are left?" For a named (or inherited) topic, only that
 * topic's deadlines. With none, challenges first, then quests.
 */
function deadlineReply(r: R, topic: StrivyTopic | undefined): StrivyReply {
  const { facts } = r;
  const wantChallenges = topic !== "quest";
  const wantQuests = topic !== "challenge";

  if (topic === "quest" && !facts.quests) return couldNotLoad(r, "quests", "your quests");
  if (topic === "challenge" && !facts.challenges) {
    return couldNotLoad(r, "challenges", "your challenges");
  }
  if (!facts.quests && !facts.challenges) return couldNotLoad(r, "challenges", "your challenges");

  const challenges = wantChallenges ? activeChallenges(facts.challenges) : [];
  const quests = wantQuests ? openQuests(facts.quests) : [];
  const lines = [
    ...challenges.slice(0, r.detail ? 5 : 2).map((c) => challengeDeadline(r, c)),
    ...quests.slice(0, r.detail ? 5 : 2).map((x) => questDeadline(r, x)),
  ];

  if (lines.length === 0) {
    if (topic === "quest") return questsReply(r, false);
    if (topic === "challenge") return noActiveChallenge(r, "challenges", facts.challenges ?? []);
    const partial = facts.unavailable.includes("your quests")
      ? "your quests"
      : facts.unavailable.includes("your challenges")
        ? "your challenges"
        : null;
    if (partial) return couldNotLoad(r, "challenges", partial);
    return reply("challenges", t(r, "nothingWithDeadline"), {
      links: [
        { label: "Explore challenges", href: "/explore" },
        { label: "Browse quests", href: "/quests" },
      ],
    });
  }

  const intent: StrivyIntent = challenges.length > 0 ? "challenges" : "quests";
  const links: StrivyLink[] =
    challenges.length > 0
      ? [challengeLink(challenges[0].challengeId, challenges[0].title)]
      : [questLink(quests[0])];
  return reply(intent, lines.join("\n"), { links, suggestions: [SUGGEST.pending] });
}

function rewardsReply(r: R): StrivyReply {
  const { facts } = r;
  if (!facts.rewards) return couldNotLoad(r, "rewards", "your rewards");
  const available = facts.availableRewards ?? [];
  const firstAvailable = available[0];
  const availableUnknown =
    available.length === 0 && facts.unavailable.includes("rewards you can earn");
  const availableLink: StrivyLink[] = firstAvailable
    ? [
        {
          label: `Open ${q(firstAvailable.parentTitle)}`,
          href:
            firstAvailable.kind === "quest"
              ? `/quests/${firstAvailable.parentId}`
              : `/challenges/${firstAvailable.parentId}`,
        },
      ]
    : [];
  const availableVars = firstAvailable
    ? { parent: q(firstAvailable.parentTitle), reward: firstAvailable.description }
    : null;

  if (facts.rewards.length === 0) {
    if (availableVars) {
      return reply("rewards", t(r, "rewardNoneButAvailable", availableVars), {
        links: availableLink,
        suggestions: [SUGGEST.quest],
      });
    }
    return reply(
      "rewards",
      t(r, "rewardNone") + (availableUnknown ? t(r, "rewardAvailableUnknown") : ""),
      {
        links: [{ label: "Browse quests", href: "/quests" }],
        suggestions: [SUGGEST.quest],
      }
    );
  }

  const [first, ...others] = facts.rewards;
  let text = t(r, "rewardHave", {
    count: count(r.lang, facts.rewards.length, "reward"),
    reward: first.rewardTitle,
    quest: q(first.questTitle),
    status: REWARD_STATUS[r.lang][first.status] ?? first.status,
  });
  if (others.length > 0) {
    text += r.detail
      ? `\n${others
          .slice(0, 4)
          .map(
            (x) =>
              `• ${x.rewardTitle} (${q(x.questTitle)}): ${REWARD_STATUS[r.lang][x.status] ?? x.status}`
          )
          .join("\n")}`
      : t(r, "rewardMore", { more: others.length });
  }
  if (availableVars) text += t(r, "rewardAlsoAvailable", availableVars);
  else if (availableUnknown) text += t(r, "rewardAvailableUnknown");

  return reply("rewards", text, {
    chips: [{ label: count("en", facts.rewards.length, "reward"), tone: "success" }],
    links: availableLink,
  });
}

function helpReply(r: R, knowledge: KnowledgeSnippet[]): StrivyReply {
  if (knowledge.length === 0) return unknownReply(r);
  return knowledgeReply("help", knowledge, r.seed);
}

/** STRIVUP's About-page tagline, in each reply language. */
const TAGLINE: Record<StrivyLang, string> = {
  en: "India's platform for growth",
  hinglish: "India ka growth platform",
  hi: "भारत का growth platform",
  bho: "भारत के growth platform",
};

/**
 * "bhai strivup k co founder kon h?": founders and team, only from
 * knowledge.ts. With no published names STRIVY says it doesn't know and
 * shares what it does (the About page facts); it never guesses a name.
 */
function companyReply(r: R): StrivyReply {
  const links = [{ label: "About STRIVUP", href: STRIVUP_COMPANY.aboutHref }];
  if (STRIVUP_TEAM.length > 0) {
    const team = STRIVUP_TEAM.map((m) => `${m.name} (${m.role})`).join(", ");
    return reply("company_info", t(r, "companyTeam", { team }), { links });
  }
  return reply(
    "company_info",
    t(r, "companyNoTeam", { tagline: TAGLINE[r.lang], email: STRIVUP_COMPANY.contactEmail }),
    { links, suggestions: ["How does STRIVUP work?", SUGGEST.streak] }
  );
}

/** "Who are you?": a short intro, never how Strivy works inside. */
function strivyInfoReply(r: R): StrivyReply {
  return reply("strivy_info", t(r, "strivyInfo"), { suggestions: STARTER_PROMPTS.slice(0, 3) });
}

/** "What can you do?", "kya kya kar sakte ho?". */
function capabilitiesReply(r: R): StrivyReply {
  return reply("capabilities", t(r, "capabilities"), {
    suggestions: [SUGGEST.streak, SUGGEST.quest, SUGGEST.pending],
  });
}

/** Small talk. No personal data is read for it. */
function generalChatReply(r: R, matched: string[]): StrivyReply {
  const key: PhraseKey = matched.includes("general-fun")
    ? "generalFun"
    : matched.includes("general-mood")
      ? "generalMood"
      : matched.includes("general-bored")
        ? "generalBored"
        : matched.includes("general-how-are-you")
          ? "generalHowAreYou"
          : matched.includes("general-something")
            ? "generalSomething"
            : matched.includes("general-promise")
              ? "generalPromise"
              : "generalChat";
  // Small talk stays small talk: no chips pulling the chat back to data.
  return reply("general_chat", t(r, key));
}

/** "Complete my quest": Strivy can't act from the chat and never pretends to. */
function actionReply(r: R): StrivyReply {
  return reply("action_request", t(r, "cantDoAction"), {
    suggestions: [SUGGEST.left, SUGGEST.pending],
  });
}

function motivationReply(r: R): StrivyReply {
  const { facts } = r;
  const name = facts.firstName ? `${facts.firstName}, ` : "";
  const opener = t(r, "motivationOpen", { name });
  let text = opener.charAt(0).toUpperCase() + opener.slice(1);
  const links: StrivyLink[] = [];

  if (facts.today) {
    const next = facts.today.tasks.find((x) => x.state === "todo" || x.state === "rejected");
    if (next) {
      text += t(r, "motivationTask", { task: taskName(r, next) });
      links.push(challengeLink(next.challengeId, next.challengeTitle));
    } else if (facts.today.total > 0) {
      text += t(r, "motivationAllDone");
    } else {
      text += t(r, "motivationNothingDue");
    }
  } else if (facts.unavailable.includes("today's tasks")) {
    text += t(r, "motivationUnknown");
  }
  text += t(r, "motivationClose");

  return reply("motivation", text, { links, suggestions: [SUGGEST.today, SUGGEST.streak] });
}

/**
 * "How do I complete my quest?" / "isko complete kaise karu?" after a quest
 * answer. Quest facts only: never a challenge, even if one exists.
 */
function questCompleteReply(r: R): StrivyReply {
  const { facts } = r;
  if (!facts.quests) return couldNotLoad(r, "quests", "your quests");
  const open = openQuests(facts.quests);
  if (open.length === 0) return questsReply(r, false);
  const quest = open[0];
  if (quest.tasksTotal === 0 || quest.tasksApproved >= quest.tasksTotal) {
    return questsReply(r, true);
  }
  const left = Math.max(0, quest.tasksTotal - quest.tasksApproved - quest.tasksPending);
  // Everything left is already waiting for review: say that, not "go do it".
  if (left === 0) return questsReply(r, true);
  let text = t(r, "questHowTo", {
    quest: q(quest.title),
    left: count(r.lang, left, "task"),
    approved: quest.tasksApproved,
    total: quest.tasksTotal,
  });
  if (quest.tasksPending > 0) {
    text += t(r, "questPendingReview", { pending: count(r.lang, quest.tasksPending, "task") });
  }
  if (quest.tasksNeedAction > 0) {
    text += t(r, "questRedo", { count: count(r.lang, quest.tasksNeedAction, "task") });
  }
  return reply("quests", text, {
    chips: [
      { label: `${quest.tasksApproved}/${quest.tasksTotal} tasks approved`, tone: "neutral" },
    ],
    links: [questLink(quest)],
    suggestions: [SUGGEST.time, SUGGEST.rewards],
  });
}

/**
 * Banter: the person insulted Strivy. A short, clean comeback that may tease
 * with their REAL streak or quest (from facts), or a generic one when there
 * is nothing real to use. Never shaming words (persona.ts BANNED_WORDS).
 */
function banterReply(r: R): StrivyReply {
  const { facts } = r;
  const top = activeChallenges(facts.challenges)
    .filter((c) => c.currentStreak > 0)
    .sort((a, b) => b.currentStreak - a.currentStreak)[0];
  const quest = openQuests(facts.quests).find(
    (x) => x.tasksTotal > 0 && x.tasksApproved < x.tasksTotal
  );
  const options: (() => string)[] = [];
  if (top) {
    const n = top.currentStreak;
    options.push(() =>
      t(r, n >= 7 ? "roastStreakBig" : "roastStreakSmall", {
        streak: count(r.lang, n, "day"),
        next: count(r.lang, n + 1, "day"),
      })
    );
  }
  if (quest) {
    options.push(() =>
      t(r, "roastQuest", {
        quest: q(quest.title),
        approved: quest.tasksApproved,
        total: quest.tasksTotal,
      })
    );
  }
  const text = options.length > 0 ? pick(options, `${r.seed}|roast`)() : t(r, "roastGeneric");
  return reply("banter", text, { suggestions: [SUGGEST.streak, SUGGEST.quest] });
}

/**
 * A general question. A sum is answered exactly here; anything else is
 * answered by the text model in chat mode, and this line is only the
 * fallback when the model can't answer right now.
 */
function generalQuestionReply(r: R, message: string): StrivyReply {
  const value = solveMath(message);
  if (value !== null) {
    return reply("general_question", t(r, "mathAnswer", { answer: formatAnswer(value) }));
  }
  return reply("general_question", t(r, "offTopic"), {
    suggestions: [SUGGEST.streak, SUGGEST.quest],
  });
}

function offTopicReply(r: R): StrivyReply {
  return reply("off_topic", t(r, "offTopic"), { suggestions: [SUGGEST.pending, SUGGEST.streak] });
}

function crisisReply(): StrivyReply {
  return reply(
    "crisis",
    [
      "I'm really glad you told me. I'm only an app companion and can't help with this the way a person can, but you don't have to go through it alone.",
      "In India you can call Tele-MANAS at 14416 (free, 24/7), or 112 if you're in immediate danger. If you're elsewhere, please contact your local emergency number.",
      "Reaching out to someone you trust right now is a strong move. Your challenges can wait.",
    ].join("\n\n")
  );
}

/** A follow-up ("and that?") with no earlier answer to follow. */
function clarifyReply(r: R): StrivyReply {
  return reply("unknown", t(r, "clarify"), {
    suggestions: [SUGGEST.streak, SUGGEST.quest, SUGGEST.pending],
  });
}

function unknownReply(r: R): StrivyReply {
  return reply("unknown", t(r, "unknown"), { suggestions: STARTER_PROMPTS.slice(0, 4) });
}

/** "Kitne task bache?": today's challenge tasks still open, plus open quests. */
function remainingReply(r: R, topic?: StrivyTopic): StrivyReply {
  const { facts } = r;
  if (!facts.today) return couldNotLoad(r, "today", "today's tasks");
  const open = facts.today.tasks.filter((x) => x.state === "todo" || x.state === "rejected");
  const quests =
    topic === "challenge" ? [] : openQuests(facts.quests).filter((x) => x.tasksNeedAction > 0);
  const questsUnknown = topic !== "challenge" && facts.unavailable.includes("your quests");
  const links: StrivyLink[] = [];
  let text = "";

  if (open.length > 0) {
    const next = open.find((x) => x.state === "rejected") ?? open[0];
    text = t(r, "remainingChallenges", {
      count: count(r.lang, open.length, "task"),
      task: taskName(r, next),
    });
    links.push(challengeLink(next.challengeId, next.challengeTitle));
  } else if (facts.today.total > 0) {
    text = t(r, "remainingChallengesDone");
  }

  const quest = quests[0];
  if (quest) {
    const vars = { quest: q(quest.title), count: count(r.lang, quest.tasksNeedAction, "task") };
    text += text ? t(r, "remainingQuest", vars) : t(r, "remainingQuestOnly", vars);
    links.push(questLink(quest));
  } else if (questsUnknown) {
    text += t(r, "todayQuestsUnknown");
  }

  if (!text) text = t(r, "remainingNothing");
  return reply("today", text.trim(), {
    links: links.slice(0, 2),
    suggestions: [SUGGEST.pending, SUGGEST.time],
  });
}

/** "Kab se?" after a streak answer. */
function streakSinceReply(r: R): StrivyReply {
  const { facts } = r;
  if (!facts.challenges) return couldNotLoad(r, "streak", "your streaks");
  const active = activeChallenges(facts.challenges);
  const top = active
    .filter((c) => c.currentStreak > 0)
    .sort((a, b) => b.currentStreak - a.currentStreak)[0];
  if (!top) {
    return reply(
      "streak",
      t(r, active.length === 0 ? "streakSinceNoChallenge" : "streakSinceNone"),
      {
        links: active.length === 0 ? [{ label: "Explore challenges", href: "/explore" }] : [],
        suggestions: [SUGGEST.pending],
      }
    );
  }
  return reply(
    "streak",
    t(r, "streakSince", { days: count(r.lang, top.currentStreak, "day"), challenge: q(top.title) }),
    {
      chips: [{ label: `🔥 ${count("en", top.currentStreak, "day")}`, tone: "streak" }],
      links: [challengeLink(top.challengeId, top.title)],
      suggestions: [SUGGEST.pending],
    }
  );
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

/**
 * The grounded draft for a context. Every reply is built from `context.facts`
 * and `context.knowledge` only, in `context.lang` (English when absent).
 * `salt` only changes which wording variant is picked, never the facts.
 */
export function draftReply(context: StrivyContext, message: string, salt = ""): StrivyReply {
  const { facts, knowledge } = context;
  const { intent, topic, detail } = context.intent;
  const r: R = {
    lang: context.lang ?? "en",
    dialect: context.dialect,
    seed: `${message}|${new Date().toISOString().slice(0, 10)}${salt ? `|${salt}` : ""}`,
    detail: WANTS_DETAIL.test(message),
    facts,
  };

  if (detail === "deadline" && (intent === "quests" || intent === "challenges")) {
    return deadlineReply(r, topic);
  }
  if (detail === "remaining" && intent === "today") return remainingReply(r, topic);
  if (detail === "since" && intent === "streak") return streakSinceReply(r);

  switch (intent) {
    case "greeting":
      return greetingReply(r);
    case "thanks":
      return thanksReply(r);
    case "today":
      return todayReply(r);
    case "focus":
      return focusReply(r);
    case "streak":
      return streakReply(r);
    case "proof_status":
      return proofReply(r);
    case "progress":
      return progressReply(r);
    case "challenges":
      return challengesReply(r, detail === "progress");
    case "quests":
      if (detail === "complete") return questCompleteReply(r);
      return questsReply(r, detail === "progress");
    case "rewards":
      return rewardsReply(r);
    case "motivation":
      return motivationReply(r);
    case "strivy_info":
      return strivyInfoReply(r);
    case "company_info":
      return companyReply(r);
    case "capabilities":
      return capabilitiesReply(r);
    case "general_chat":
      return generalChatReply(r, context.intent.matched);
    case "action_request":
      return actionReply(r);
    case "help":
      return helpReply(r, knowledge);
    case "create":
    case "how_it_works":
      return knowledge.length > 0 ? knowledgeReply(intent, knowledge, r.seed) : unknownReply(r);
    case "not_built":
      return knowledge.length > 0
        ? knowledgeReply("not_built", knowledge, r.seed)
        : unknownReply(r);
    case "off_topic":
      return offTopicReply(r);
    case "general_question":
      return generalQuestionReply(r, message);
    case "banter":
      return banterReply(r);
    case "crisis":
      return crisisReply();
    case "unknown":
      return context.intent.matched.includes("follow-up-no-context")
        ? clarifyReply(r)
        : unknownReply(r);
  }
}
