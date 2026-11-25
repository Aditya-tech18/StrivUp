"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Loader2, LockKeyhole } from "lucide-react";

export interface InviteJoinState {
  error: string | null;
}

export function JoinForm({
  action,
  autoAccept,
}: {
  action: (previous: InviteJoinState, data: FormData) => Promise<InviteJoinState>;
  autoAccept: boolean;
}) {
  const [state, submit, pending] = useActionState(action, { error: null });
  const started = useRef(false);

  useEffect(() => {
    if (!autoAccept || started.current) return;
    started.current = true;
    startTransition(() => submit(new FormData()));
  }, [autoAccept, submit]);

  return (
    <form action={submit} aria-busy={pending}>
      {state.error && (
        <p role="alert" className="mb-2 rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container">
          {state.error}
        </p>
      )}
      <button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary-container px-4 font-bold text-on-secondary-container transition-opacity hover:opacity-90 disabled:opacity-60" disabled={pending}>
        {pending ? (
          <Loader2 size={18} className="motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <LockKeyhole size={18} aria-hidden="true" />
        )}
        {pending ? "Joining…" : state.error ? "Try again" : "Accept invite"}
      </button>
    </form>
  );
}
