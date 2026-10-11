"use client";

/**
 * MyPosts — the viewer's own proof posts, with delete and a per-post
 * audience exception.
 *
 * A proof is a photo of your own life posted to an audience you did not
 * individually pick, so two controls are the minimum: take it down, or keep
 * it up but not for that one person. Both are the author's alone. The
 * database enforces it rather than this component: proof_submissions gained
 * a delete policy scoped to user_id, and proof_hidden_from is readable and
 * writable only by the post's author.
 *
 * Hiding is subtractive, never additive. The list names people who cannot
 * see a post that everyone else still can, which is why it offers the
 * author's followers: those are the people with a reason to be looking.
 */

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  EyeOff, ImageOff, Loader2, Trash2, X,
} from "lucide-react";
import { UserAvatar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { displayName, getFollowList, type PersonRow } from "@/lib/data/social";

export interface MyPost {
  id: string;
  challengeId: string;
  challengeTitle: string;
  mediaUrl: string | null;
  caption: string | null;
  submittedAt: string;
  dayNumber: number;
  status: string;
  hiddenCount: number;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export function MyPosts({ posts, viewerId }: { posts: MyPost[]; viewerId: string }) {
  const [items, setItems] = useState(posts);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [hidingFor, setHidingFor] = useState<MyPost | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(
    async (id: string) => {
      setBusy(id);
      setError(null);
      const { error: err } = await createClient()
        .from("proof_submissions")
        .delete()
        .eq("id", id);
      setBusy(null);
      if (err) { setError(err.message); return; }
      // Only drop the row once the delete actually succeeded: a post that
      // vanished from the screen but not the database is the worst outcome
      // here, because the author stops trying to remove it.
      setItems((prev) => prev.filter((p) => p.id !== id));
      setConfirmId(null);
    },
    []
  );

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 text-center text-body-md text-on-surface-variant">
        You have not posted any proof yet.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-error/30 bg-error/10 px-4 py-2 text-body-sm text-error">
          {error}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="list">
        {items.map((post) => (
          <li
            key={post.id}
            className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest elev-1"
          >
            <Link
              href={`/challenges/${post.challengeId}`}
              className="relative block aspect-square w-full overflow-hidden bg-surface-container"
            >
              {post.mediaUrl ? (
                <Image src={post.mediaUrl} alt="" fill sizes="(min-width: 640px) 220px, 45vw" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-on-surface-variant">
                  <ImageOff size={22} aria-hidden="true" />
                </span>
              )}
              {post.hiddenCount > 0 && (
                <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-primary/80 px-2 py-0.5 text-label-sm font-semibold text-on-primary backdrop-blur-sm">
                  <EyeOff size={11} aria-hidden="true" />
                  {post.hiddenCount}
                </span>
              )}
            </Link>

            <div className="p-2.5">
              <p className="line-clamp-1 text-body-sm font-semibold text-on-surface">
                {post.challengeTitle}
              </p>
              <p className="text-xs text-on-surface-variant">
                Day {post.dayNumber} · {shortDate(post.submittedAt)}
              </p>

              {confirmId === post.id ? (
                <div className="mt-2">
                  <p className="text-xs text-on-surface-variant">Delete for good?</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="h-8 flex-1 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(post.id)}
                      disabled={busy === post.id}
                      className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-error text-xs font-bold text-white disabled:opacity-60"
                    >
                      {busy === post.id && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHidingFor(post)}
                    aria-label={`Choose who cannot see this post from ${post.challengeTitle}`}
                    className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
                  >
                    <EyeOff size={13} aria-hidden="true" />
                    Hide
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(post.id)}
                    aria-label={`Delete post from ${post.challengeTitle}`}
                    className="flex h-8 w-9 items-center justify-center rounded-lg border border-outline-variant text-error hover:bg-error/10"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {hidingFor && (
        <HideFromSheet
          post={hidingFor}
          viewerId={viewerId}
          onClose={() => setHidingFor(null)}
          onCountChange={(id, n) =>
            setItems((prev) => prev.map((p) => (p.id === id ? { ...p, hiddenCount: n } : p)))
          }
        />
      )}
    </>
  );
}

/** Pick which of your followers cannot see one post. */
function HideFromSheet({
  post, viewerId, onClose, onCountChange,
}: {
  post: MyPost;
  viewerId: string;
  onClose: () => void;
  onCountChange: (postId: string, count: number) => void;
}) {
  const [supabase] = useState(() => createClient());
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [followers, { data: rows }] = await Promise.all([
        getFollowList(supabase, viewerId, "followers", viewerId),
        supabase.from("proof_hidden_from").select("user_id").eq("proof_id", post.id),
      ]);
      if (cancelled) return;
      setPeople(followers);
      setHidden(
        new Set(((rows ?? []) as { user_id: string }[]).map((r) => r.user_id))
      );
    })();
    return () => { cancelled = true; };
  }, [post.id, supabase, viewerId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const toggle = useCallback(
    async (id: string) => {
      const isHidden = hidden.has(id);
      setBusy(id);

      const { error } = isHidden
        ? await supabase
            .from("proof_hidden_from")
            .delete()
            .eq("proof_id", post.id)
            .eq("user_id", id)
        : await supabase
            .from("proof_hidden_from")
            .insert({ proof_id: post.id, user_id: id });

      setBusy(null);
      if (error && !/duplicate|unique/i.test(error.message)) return;

      const next = new Set(hidden);
      if (isHidden) next.delete(id);
      else next.add(id);
      setHidden(next);
      onCountChange(post.id, next.size);
    },
    [hidden, onCountChange, post.id, supabase]
  );

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Hide this post from">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full bg-primary/50 backdrop-blur-sm" />

      <div className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-outline-variant bg-surface-container-lowest pb-safe elev-5 sm:max-h-[80dvh] sm:max-w-md sm:rounded-2xl sm:pb-0">
        <div className="shrink-0 border-b border-outline-variant px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-body-lg font-bold text-on-surface">Hide this post from</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            They stay followers and are not told. The post simply does not
            appear for them.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {people === null ? (
            <p className="flex items-center justify-center gap-2 py-12 text-body-md text-on-surface-variant">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Loading…
            </p>
          ) : people.length === 0 ? (
            <p className="px-4 py-10 text-center text-body-md text-on-surface-variant">
              Nobody follows you yet, so there is nobody to hide this from.
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant" role="list">
              {people.map((p) => {
                const isHidden = hidden.has(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <UserAvatar src={p.avatarUrl} name={displayName(p)} size={40} />
                    <span className="min-w-0 flex-1 truncate text-body-md font-medium text-on-surface">
                      {displayName(p)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      disabled={busy === p.id}
                      aria-pressed={isHidden}
                      className={[
                        "flex h-9 shrink-0 items-center justify-center rounded-xl px-3 text-xs font-bold transition-colors disabled:opacity-60",
                        isHidden
                          ? "bg-error text-white"
                          : "border border-outline-variant text-on-surface-variant hover:bg-surface-container",
                      ].join(" ")}
                    >
                      {busy === p.id ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                      ) : isHidden ? (
                        "Hidden"
                      ) : (
                        "Hide"
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
