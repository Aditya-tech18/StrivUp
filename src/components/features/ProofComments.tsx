"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * ProofComments — the comment thread under a feed card, with one level of
 * replies.
 *
 * Follows the supplied reference's structure: avatar, name, time ago, a
 * delete affordance on your own, and replies that collapse behind a count.
 * Two deliberate departures:
 *
 *   NO framer-motion / shadcn. The reference pulls in framer-motion plus
 *   @radix-ui/react-avatar, @radix-ui/react-slot and class-variance-authority
 *   for an avatar, a textarea and a fade. All three exist here already as
 *   plain markup and tokens, and the fade is a CSS transition.
 *
 *   ONE QUERY, NOT ONE PER COMMENT. The reference fetches each comment's
 *   replies when you expand it, which is an N+1 as soon as a proof gets busy
 *   and shows a spinner for data that is a few hundred bytes. Every comment on
 *   a proof is fetched together and split into roots and replies here;
 *   collapsing is then purely a display choice with nothing to wait for.
 *
 * Deletion is offered to a comment's author and to the owner of the proof.
 * The database enforces both — this only decides which button to draw.
 */

export interface ProofComment {
  id: string;
  body: string;
  createdAt: string;
  parentId: string | null;
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
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

function Avatar({ name, url, size = 28 }: { name: string; url: string | null; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary/10"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-label-sm font-bold text-secondary">{initials(name)}</span>
      )}
    </span>
  );
}

function SkeletonRow({ inset = false }: { inset?: boolean }) {
  return (
    <div className={`flex gap-2.5 ${inset ? "pl-4" : ""}`} aria-hidden="true">
      <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-surface-container-high" />
      <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
        <span className="block h-3 w-24 animate-pulse rounded bg-surface-container-high" />
        <span className="block h-3 w-2/3 animate-pulse rounded bg-surface-container-high" />
      </div>
    </div>
  );
}

/** One comment or reply. */
function CommentRow({
  comment,
  viewerId,
  proofOwnerId,
  onDelete,
  children,
}: {
  comment: ProofComment;
  viewerId: string | null;
  proofOwnerId: string | null;
  onDelete: (id: string) => void;
  children?: React.ReactNode;
}) {
  const canDelete = viewerId === comment.authorId || viewerId === proofOwnerId;

  return (
    <li className="flex items-start gap-2.5">
      <Avatar name={comment.authorName} url={comment.authorAvatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-label-sm font-semibold text-on-surface">
              {comment.authorName}
            </span>
            {comment.authorId === proofOwnerId ? (
              <span className="rounded-full bg-secondary/10 px-1.5 text-label-sm font-medium text-secondary">
                Author
              </span>
            ) : null}
            <span className="text-label-sm text-on-surface-variant">
              {relativeTime(comment.createdAt)}
            </span>
          </div>
          {canDelete ? (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              aria-label="Delete comment"
              className="shrink-0 rounded p-1 text-on-surface-variant transition-colors hover:text-error"
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap break-words text-body-sm text-on-surface-variant">
          {comment.body}
        </p>
        {children}
      </div>
    </li>
  );
}

/** The write box, used for both a new comment and a reply. */
function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  placeholder,
  compact = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  placeholder: string;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={`flex items-center gap-2 ${compact ? "mt-2" : "mt-3"}`}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={1000}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        className={[
          "min-w-0 flex-1 rounded-lg bg-surface-container-low px-3 text-body-sm text-on-surface",
          "placeholder:text-outline focus:bg-surface-container-lowest focus:outline-none",
          "focus:ring-2 focus:ring-secondary/20",
          compact ? "h-8" : "h-9",
        ].join(" ")}
      />
      <button
        type="submit"
        disabled={!value.trim() || busy}
        aria-label={placeholder}
        className={[
          "flex shrink-0 items-center justify-center rounded-lg bg-secondary text-on-secondary",
          "transition-opacity disabled:opacity-40",
          compact ? "h-8 w-8" : "h-9 w-9",
        ].join(" ")}
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        ) : (
          <Send size={14} aria-hidden="true" />
        )}
      </button>
    </form>
  );
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
  const [replyDraft, setReplyDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("proof_comments")
        .select("id, body, created_at, parent_id, user_id, profiles!user_id(full_name, avatar_url)")
        .eq("proof_id", proofId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (loadError) {
        setError("Couldn't load comments.");
        setLoading(false);
        return;
      }

      setComments((data ?? []).map(toComment));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [proofId]);

  const roots = comments.filter((c) => c.parentId === null);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  async function post(body: string, parentId: string | null) {
    if (!body.trim() || !viewerId || posting) return;
    setPosting(true);
    setError(null);

    const supabase = createClient();
    const { data, error: postError } = await supabase
      .from("proof_comments")
      .insert({ proof_id: proofId, user_id: viewerId, body: body.trim(), parent_id: parentId })
      .select("id, body, created_at, parent_id, user_id, profiles!user_id(full_name, avatar_url)")
      .single();

    if (postError || !data) {
      setError("Couldn't post that. Try again.");
      setPosting(false);
      return;
    }

    setComments((prev) => [...prev, toComment(data)]);
    if (parentId) {
      // Keep the thread you just replied to open, or your reply vanishes
      // behind a collapsed count the moment you post it.
      setExpanded((prev) => new Set(prev).add(parentId));
      setReplyDraft("");
      setReplyingTo(null);
    } else {
      setDraft("");
    }
    setPosting(false);
    onCountChange(1);
  }

  async function handleDelete(id: string) {
    const previous = comments;
    // A deleted root takes its replies with it — the database cascades, so the
    // optimistic update has to as well or the UI keeps orphans on screen.
    const removed = comments.filter((c) => c.id === id || c.parentId === id);
    setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
    onCountChange(-removed.length);

    const supabase = createClient();
    const { error: delError } = await supabase.from("proof_comments").delete().eq("id", id);

    if (delError) {
      setComments(previous);
      onCountChange(removed.length);
      setError("Couldn't delete that comment.");
    }
  }

  return (
    <div className="border-t border-outline-variant px-4 py-3">
      {loading ? (
        <div className="space-y-3 py-1">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <>
          {roots.length === 0 ? (
            <p className="py-2 text-body-sm text-on-surface-variant">
              No comments yet. Say something useful.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {roots.map((root) => {
                const replies = repliesOf(root.id);
                const open = expanded.has(root.id);
                return (
                  <CommentRow
                    key={root.id}
                    comment={root}
                    viewerId={viewerId}
                    proofOwnerId={proofOwnerId}
                    onDelete={handleDelete}
                  >
                    <div className="mt-1 flex items-center gap-3">
                      {replies.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(root.id)) next.delete(root.id);
                              else next.add(root.id);
                              return next;
                            })
                          }
                          aria-expanded={open}
                          className="flex items-center gap-1 text-label-sm font-medium text-secondary transition-colors hover:underline"
                        >
                          {open ? (
                            <ChevronUp size={12} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={12} aria-hidden="true" />
                          )}
                          {replies.length} {replies.length === 1 ? "reply" : "replies"}
                        </button>
                      ) : null}

                      {viewerId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingTo(replyingTo === root.id ? null : root.id);
                            setReplyDraft("");
                          }}
                          className="text-label-sm font-medium text-on-surface-variant transition-colors hover:text-secondary"
                        >
                          Reply
                        </button>
                      ) : null}
                    </div>

                    {(open && replies.length > 0) || replyingTo === root.id ? (
                      <div className="mt-2 border-l border-outline-variant pl-3">
                        {open && replies.length > 0 ? (
                          <ul className="flex flex-col gap-3">
                            {replies.map((reply) => (
                              <CommentRow
                                key={reply.id}
                                comment={reply}
                                viewerId={viewerId}
                                proofOwnerId={proofOwnerId}
                                onDelete={handleDelete}
                              />
                            ))}
                          </ul>
                        ) : null}

                        {replyingTo === root.id ? (
                          <Composer
                            compact
                            autoFocus
                            value={replyDraft}
                            onChange={setReplyDraft}
                            onSubmit={() => post(replyDraft, root.id)}
                            busy={posting}
                            placeholder={`Reply to ${root.authorName.split(" ")[0]}`}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </CommentRow>
                );
              })}
            </ul>
          )}

          {viewerId ? (
            <Composer
              value={draft}
              onChange={setDraft}
              onSubmit={() => post(draft, null)}
              busy={posting}
              placeholder="Add a comment…"
            />
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

/** Shape a PostgREST row into the component's own type. */
function toComment(row: Record<string, unknown>): ProofComment {
  const author = row.profiles as { full_name: string | null; avatar_url: string | null } | null;
  return {
    id: row.id as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    parentId: (row.parent_id as string | null) ?? null,
    authorId: row.user_id as string,
    authorName: author?.full_name ?? "Anonymous",
    authorAvatarUrl: author?.avatar_url ?? null,
  };
}
