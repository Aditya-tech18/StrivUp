import { redirect } from "next/navigation";

/**
 * /profile/[id] — kept only to redirect.
 *
 * There were two public profile routes: this one and /u/[handle]. /u is the
 * one that stayed — it is server-rendered, it accepts a username as well as a
 * UUID, and it skips the private fetches on the server so gated data never
 * reaches the client bundle. This one duplicated that logic in a client
 * component, which is exactly how two implementations of the same screen drift
 * apart until one of them has a bug the other does not.
 *
 * Redirecting rather than deleting, because links to /profile/<uuid> are
 * already out there in notifications and shared messages.
 */
export default async function LegacyProfileRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/u/${id}`);
}
