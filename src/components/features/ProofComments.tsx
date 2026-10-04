"use client";

import { useEffect, useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * ProofComments — the comment thread under a feed card.
 *
 * Loaded lazily when the thread is opened rather than with the feed, so a page
 * of 20 cards does not fetch 20 threads nobody expanded.
 *
 * Deletion is offered to the comment's author and to the owner of the proof;
 * the database enforces both, this just decides which button to draw.
 */

export interface ProofComment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function ProofComments({
  proofId,
  viewerId,
  proofOwnerId,
  onCountChange,
}: {
  proofId: string;
  viewerId: string | null;
  proofOwnerId: string | null;
  onCountChange: (delta: number) => void;
}) {
  const [comments, setComments] = useState<ProofComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("proof_comments")
        .select("id, body, created_at, user_id, profiles!user_id(full_name, avatar_url)")
        .eq("proof_id", proofId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (loadError) {
        setError("Couldn't load comments.");
        setLoading(false);
        return;
      }

      setComments(
        (data ?? []).map((row) => {
          const author = row.profiles as unknown as {
            full_name: string | null;
            avatar_url: string | null;
          } | null;
          return {
            id: row.id as string,
            body: row.body as string,
            createdAt: row.created_at as string,
            authorId: row.user_id as string,
            authorName: author?.full_name ?? "Anonymous",
            authorAvatarUrl: author?.avatar_url ?? null,
          };
        })
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [proofId]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !viewerId || posting) return;

    setPosting(true);
    setError(null);

    const supabase = createClient();
    const { data, error: postError } = await supabase
      .from("proof_comments")
      .insert({ proof_id: proofId, user_id: viewerId, body })
      .select("id, body, created_at, user_id, profiles!user_id(full_name, avatar_url)")
      .single();

    if (postError || !data) {
      setError("Couldn't post that. Try again.");
      setPosting(false);
      return;
    }

    const author = data.profiles as unknown as {
      full_name: string | null;
      avatar_url: string | null;
    } | null;

    setComments((prev) => [
      ...prev,
      {
        id: data.id as string,
        body: data.body as string,
        createdAt: data.created_at as string,
        authorId: data.user_id as string,
        authorName: author?.full_name ?? "You",
        authorAvatarUrl: author?.avatar_url ?? null,
      },
    ]);
    setDraft("");
    setPosting(false);
    onCountChange(1);
  }

  async function handleDelete(id: string) {
    const previous = comments;
    setComments((prev) => prev.filter((c) => c.id !== id));
    onCountChange(-1);

    const supabase = createClient();
    const { error: delError } = await supabase.from("proof_comments").delete().eq("id", id);

    if (delError) {
      setComments(previous);
      onCountChange(1);
      setError("Couldn't delete that comment.");
    }
  }

  return (
    <div className="border-t border-outline-variant px-4 py-3">
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={18} className="animate-spin text-secondary" aria-hidden="true" />
        </div>
      ) : (
        <>
          {comments.length === 0 ? (
            <p className="py-2 text-body-sm text-on-surface-variant">
              No comments yet. Say something useful.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.map((c) => {
                const canDelete = viewerId === c.authorId || viewerId === proofOwnerId;
                return (
                  <li key={c.id} className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary/10">
                      {c.authorAvatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-label-sm font-bold text-secondary">
                          {c.authorName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-label-sm font-semibold text-on-surface">
                          {c.authorName}
                        </span>
                        {c.authorId === proofOwnerId ? (
                          <span className="text-label-sm font-medium text-secondary">Author</span>
                        ) : null}
                        <span className="text-label-sm text-on-surface-variant">
                          {relativeTime(c.createdAt)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-body-sm text-on-surface-variant">
                        {c.body}
                      </p>
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        aria-label="Delete comment"
                        className="shrink-0 p-1 text-on-surface-variant transition-colors hover:text-error"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {viewerId ? (
            <form onSubmit={handlePost} className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={1000}
                placeholder="Add a comment…"
                aria-label="Add a comment"
                className="min-w-0 flex-1 rounded-lg bg-surface-container-low px-3 py-2 text-body-sm text-on-surface placeholder:text-outline focus:bg-surface-container-lowest focus:outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || posting}
                aria-label="Post comment"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary disabled:opacity-40"
              >
                {posting ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send size={15} aria-hidden="true" />
                )}
              </button>
            </form>
          ) : null}

          {error ? (
            <p role="alert" className="mt-2 text-label-sm text-error">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
