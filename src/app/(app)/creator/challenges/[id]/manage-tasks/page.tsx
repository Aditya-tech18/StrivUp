"use client";

/**
 * app/(app)/creator/challenges/[id]/manage-tasks/page.tsx
 *
 * Creator-only page to add/edit/remove tasks for an existing challenge.
 * Auth guard: notFound() if the current user is not the challenge creator.
 *
 * Uses replaceChallengeTasks (delete-all + re-insert) as the simplest
 * correct approach — no partial update complexity.
 */

import { notFound, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, GripVertical, Plus, Rocket, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { replaceChallengeTasks, getChallengeTasks } from "@/lib/data/tasks";
import type { ChallengeTask } from "@/lib/data/tasks";
import { Button } from "@/components/ui";

/* ── Types ────────────────────────────────────────────────────────────────── */
const PROOF_TYPES = ["photo", "video", "text", "link", "none"] as const;

interface TaskRow {
  key: string;
  id: string | null; // null = new (not yet saved)
  title: string;
  description: string;
  proofType: string;
  isRequired: boolean;
}

function taskToRow(t: ChallengeTask): TaskRow {
  return {
    key: t.id,
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    proofType: t.proofType ?? "none",
    isRequired: t.isRequired,
  };
}

/* ── ToggleSwitch ────────────────────────────────────────────────────────── */
function ToggleSwitch({ id, checked, onChange }: {
  id: string; checked: boolean; onChange: () => void;
}) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={[
        "relative w-11 h-6 rounded-full transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
        checked ? "bg-secondary" : "bg-outline-variant",
      ].join(" ")}>
      <span className={["absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200", checked ? "translate-x-5" : "translate-x-0"].join(" ")} />
      <span className="sr-only">{checked ? "On" : "Off"}</span>
    </button>
  );
}

/* ── TaskRowEditor ───────────────────────────────────────────────────────── */
function TaskRowEditor({ task, index, onChange, onRemove }: {
  task: TaskRow; index: number; onChange: (u: TaskRow) => void; onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GripVertical size={16} className="text-on-surface-variant/40 flex-shrink-0 cursor-grab" aria-hidden="true" />
        <span className="text-xs font-semibold text-on-surface-variant flex-shrink-0">Task {index + 1}</span>
        <div className="flex-1" />
        <button type="button" onClick={onRemove} aria-label={`Remove task ${index + 1}`}
          className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-red-50 hover:text-red-500 transition-colors">
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      <input
        type="text"
        value={task.title}
        onChange={(e) => onChange({ ...task, title: e.target.value })}
        placeholder="Task title (required)"
        className="w-full h-9 px-3 rounded border border-outline-variant bg-surface text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary transition-colors"
      />
      <textarea
        value={task.description}
        onChange={(e) => onChange({ ...task, description: e.target.value })}
        placeholder="Description (optional)"
        rows={2}
        className="w-full px-3 py-2 rounded border border-outline-variant bg-surface text-on-surface text-sm resize-none placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary transition-colors"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-32">
          <label className="text-xs text-on-surface-variant whitespace-nowrap">Proof type</label>
          <select
            value={task.proofType}
            onChange={(e) => onChange({ ...task, proofType: e.target.value })}
            className="flex-1 h-8 px-2 rounded border border-outline-variant bg-surface text-on-surface text-xs appearance-none focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary"
          >
            {PROOF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-on-surface-variant">Required</label>
          <ToggleSwitch id={`manage-task-required-${task.key}`} checked={task.isRequired}
            onChange={() => onChange({ ...task, isRequired: !task.isRequired })} />
        </div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function ManageTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [challengeTitle, setChallengeTitle] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const supabase = useRef(createClient()).current;

  // Resolve params and auth-check on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { id } = await params;
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) { notFound(); return; }

      // Verify ownership
      const { data: challenge, error } = await supabase
        .from("challenges")
        .select("id, title, creator_id")
        .eq("id", id)
        .single();

      if (error || !challenge || challenge.creator_id !== user.id) {
        notFound();
        return;
      }

      // Fetch existing tasks
      const existing = await getChallengeTasks(supabase, id);
      if (cancelled) return;

      setChallengeId(id);
      setChallengeTitle(challenge.title as string);
      setTasks(existing.map(taskToRow));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, params]);

  const addTask = () =>
    setTasks((prev) => [...prev, {
      key: crypto.randomUUID(), id: null,
      title: "", description: "", proofType: "photo", isRequired: true,
    }]);

  const updateTask = (key: string, updated: TaskRow) =>
    setTasks((prev) => prev.map((t) => (t.key === key ? updated : t)));

  const removeTask = (key: string) =>
    setTasks((prev) => prev.filter((t) => t.key !== key));

  const handleSave = () => {
    if (!challengeId) return;
    const invalid = tasks.find((t) => !t.title.trim());
    if (invalid) { setSaveError("All tasks must have a title."); return; }

    setSaveError(null);
    setSaved(false);
    startTransition(async () => {
      const { error } = await replaceChallengeTasks(supabase, challengeId, tasks.map((t) => ({
        title: t.title,
        description: t.description || null,
        proofType: t.proofType,
        isRequired: t.isRequired,
      })));

      if (error) {
        setSaveError(error);
      } else {
        setSaved(true);
        // Redirect back to challenge after brief success flash
        setTimeout(() => router.push(`/challenges/${challengeId}`), 1200);
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-on-surface-variant text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-outline-variant">
        <div className="flex items-center gap-3 px-4 h-14 max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="type-headline-sm text-on-surface font-semibold truncate">Manage Tasks</p>
            {challengeTitle && (
              <p className="text-xs text-on-surface-variant truncate">{challengeTitle}</p>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-32">

        {/* Info */}
        <p className="text-sm text-on-surface-variant">
          Add, edit, or reorder tasks. Saving replaces all existing tasks — participants&apos; proof submissions are preserved even if their linked task is removed.
        </p>

        {/* Error / success */}
        {saveError && (
          <div role="alert" className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-error text-sm">
            {saveError}
          </div>
        )}
        {saved && (
          <div role="status" className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-700 text-sm font-medium">
            ✓ Tasks saved successfully — redirecting…
          </div>
        )}

        {/* Task list */}
        <div className="space-y-3">
          {tasks.map((task, idx) => (
            <TaskRowEditor
              key={task.key}
              task={task}
              index={idx}
              onChange={(u) => updateTask(task.key, u)}
              onRemove={() => removeTask(task.key)}
            />
          ))}
        </div>

        {/* Add task */}
        <button
          type="button"
          onClick={addTask}
          className={[
            "w-full h-10 rounded-xl border-2 border-dashed border-outline-variant",
            "flex items-center justify-center gap-2",
            "text-sm text-on-surface-variant font-medium",
            "hover:border-secondary hover:text-secondary hover:bg-secondary/5 transition-colors",
          ].join(" ")}
        >
          <Plus size={16} aria-hidden="true" />
          {tasks.length === 0 ? "Add first task" : "Add another task"}
        </button>

        <div className="h-8" aria-hidden="true" />
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-16 md:bottom-0 left-0 md:left-64 right-0 z-30 bg-surface/95 backdrop-blur-sm border-t border-outline-variant px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} className="flex-shrink-0">
            Cancel
          </Button>
          <Button
            id="save-tasks-btn"
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending || saved}
            onClick={handleSave}
          >
            <Rocket size={16} aria-hidden="true" className="mr-1.5" />
            {isPending ? "Saving…" : saved ? "Saved!" : `Save Tasks${tasks.length > 0 ? ` (${tasks.length})` : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
