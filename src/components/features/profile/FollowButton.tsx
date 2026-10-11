"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, UserPlus } from "lucide-react";
import { Button } from "@/components/ui";
import { followUser, unfollowUser } from "@/lib/supabase/profile";
import type { FollowState } from "@/lib/data/profiles";

/**
 * FollowButton — the only interactive island on the public profile page.
 *
 * The page itself is a server component, so follow state arrives as a prop and
 * this component owns only the optimistic transition. `router.refresh()` after a
 * successful write re-fetches the server data (counts, and whether the private
 * gate should now open) without a full navigation.
 */
export function FollowButton({
  targetUserId,
  initialState,
}: {
  targetUserId: string;
  initialState: Exclude<FollowState, "self">;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    const previous = state;

    // Optimistic: "none" → assume the common public case; a private target
    // resolves to "requested" when the server answers.
    setState(previous === "none" ? "following" : "none");

    try {
      if (previous === "none") {
        const result = await followUser(targetUserId);
        setState(result === "requested" ? "requested" : "following");
      } else {
        await unfollowUser(targetUserId);
        setState("none");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setState(previous);
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    }
  }

  const label =
    state === "following" ? "Following" : state === "requested" ? "Requested" : "Follow";

  const icon =
    state === "following" ? (
      <Check size={16} aria-hidden="true" />
    ) : state === "requested" ? (
      <Clock size={16} aria-hidden="true" />
    ) : (
      <UserPlus size={16} aria-hidden="true" />
    );

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        variant={state === "none" ? "primary" : "outline"}
        onClick={handleClick}
        disabled={pending}
        aria-label={
          state === "following"
            ? "Unfollow this person"
            : state === "requested"
              ? "Withdraw follow request"
              : "Follow this person"
        }
      >
        {icon}
        {label}
      </Button>

      {error ? (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
