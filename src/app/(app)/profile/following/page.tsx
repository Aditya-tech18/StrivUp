/**
 * /profile/following — the viewer's own following, with management.
 *
 * Server-rendered and handed to the shared PeopleList, so a row here behaves
 * exactly like a row in a likes list or a participant list: tap to open the
 * profile, follow or unfollow inline, and the "..." menu for the rest.
 * Following is the one place "Remove follower" is offered, because it is the
 * only list where the viewer owns the other side of the edge.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getFollowList } from "@/lib/data/social";
import { PeopleList } from "@/components/features/people/PeopleList";

export const dynamic = "force-dynamic";

export default async function FollowingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/profile/following");

  const people = await getFollowList(supabase, user.id, "following", user.id);

  return (
    <div className="min-h-screen bg-surface pb-24">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-outline-variant bg-surface/95 px-2 pt-safe backdrop-blur-sm">
        <Link
          href="/profile"
          aria-label="Back to profile"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-on-surface hover:bg-surface-container"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="text-body-lg font-bold text-on-surface">
          Following
          <span className="ml-2 text-body-md font-medium text-on-surface-variant">
            {people.length}
          </span>
        </h1>
      </header>

      <div className="mx-auto measure-form">
        <PeopleList
          people={people}
          viewerId={user.id}
          canRemoveFollower={false}
          emptyMessage="You are not following anyone yet."
        />
      </div>
    </div>
  );
}
