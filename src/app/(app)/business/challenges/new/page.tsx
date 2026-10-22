/**
 * /business/challenges/new — business challenge creation.
 *
 * The challenge wizard is one 1000-line client form, and a business challenge
 * differs from a personal one by a single column. Forking the form to change
 * one field would leave two wizards to keep in step, so this route redirects
 * into the existing one and carries the intent in the query string. The
 * wizard then confirms the account really owns a finished business profile
 * before it stamps creator_type, so the parameter cannot grant anything.
 */

import { redirect } from "next/navigation";

export default function NewBusinessChallengePage() {
  redirect("/challenges/new?as=business");
}
