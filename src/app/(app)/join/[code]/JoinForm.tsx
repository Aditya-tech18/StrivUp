"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui";

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
    <form action={submit} className="mt-space-lg" aria-busy={pending}>
      {state.error && (
        <p role="alert" className="mb-space-sm text-body-md text-error">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
        {pending ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          <Users size={18} aria-hidden="true" />
        )}
        {pending ? "Joining…" : state.error ? "Try again" : "Accept invite"}
      </Button>
    </form>
  );
}
