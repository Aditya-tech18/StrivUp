/**
 * ActiveCard — one card in the home page's Active Challenges and Quests rail.
 *
 * Lifted out of app/(app)/feed/page.tsx so the dev harness can render it: the
 * feed sits behind auth, and the borders and the bulge could not otherwise be
 * looked at without a live session. Behaviour is unchanged by the move.
 */

import Image from "next/image";
import Link from "next/link";
import { Trophy } from "lucide-react";
import type { TodayTask } from "@/lib/data/today";
import { Facepile } from "@/components/features/people/Facepile";
import type { Facepile as FacepileData } from "@/lib/data/social";

/* ── Active challenge card (carousel item) ───────────────────────────────── */
/**
 * A card in the Active rail. Carries the creator's cover, because a wall of
 * identical text cards is unreadable once someone is in more than two things,
 * and the cover is how people recognise their own challenge at a glance.
 */
export function ActiveCard({ task, pile }: { task: TodayTask; pile?: FacepileData }) {
  const isQuest = task.kind === "quest";
  const progress =
    task.durationDays && task.durationDays > 0
      ? Math.min(100, Math.round((task.dayNumber / task.durationDays) * 100))
      : 0;

  return (
    <Link
      href={`/${isQuest ? "quests" : "challenges"}/${task.challengeId}`}
      /* Quests bulge, challenges do not. The rail mixes a business's paid
         quest with the user's own challenges, and without something to
         separate them the quest is just another card in the row. */
      /* CHANGED: quests carry a blue edge, challenges a black one, so the two
         kinds are told apart at a glance in a rail that mixes them. Both use
         existing brand tokens (secondary is the StrivUp blue, primary is
         black); no new colours were introduced. The bulge stays on quests
         only, as before.

         Drawn as an inset outline rather than a border, because
         .surface-raised already sets its own border-top and border-bottom to
         fake the lit top edge, and a border here would be overridden on
         exactly those two sides. An outline with a negative offset sits
         inside the card, follows the rounded corners, costs no layout, and
         does not collide with the elev-1 box-shadow the way a ring would. */
      className={[
        "relative flex w-[280px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest outline-2 -outline-offset-2 elev-1 surface-raised",
        isQuest ? "outline-secondary bulge" : "outline-primary",
      ].join(" ")}
    >
      <div className="relative h-28 w-full shrink-0 overflow-hidden bg-surface-container">
        {task.thumbnailUrl ? (
          <Image
            src={task.thumbnailUrl}
            alt=""
            fill
            sizes="280px"
            className="object-cover"
          />
        ) : (
          /* CHANGED: a designed cover rather than an empty grey box.
             A challenge with no thumbnail is not an error, it is a creator
             who did not upload one, and there is no image to conjure. What
             was wrong was the fallback: a flat grey panel with a faint
             trophy read as a picture that had failed to load. A branded
             gradient carrying the challenge's own name reads as a cover,
             which is what it is. */
          <div
            className={[
              "flex h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center",
              isQuest
                ? "bg-gradient-to-br from-[#0C4349] to-[#062A2E]"
                : "bg-gradient-to-br from-secondary to-primary",
            ].join(" ")}
          >
            <Trophy size={20} className="text-white/70" aria-hidden="true" />
            <span className="line-clamp-2 text-label-md font-bold leading-tight text-white/90">
              {task.challengeTitle}
            </span>
          </div>
        )}
        <span className="absolute left-2 top-2 flex w-fit items-center gap-1 rounded-full bg-surface-container-lowest/90 px-2 py-0.5 text-label-sm font-medium text-on-surface backdrop-blur-sm">
          <span
            className={`h-1.5 w-1.5 rounded-full ${isQuest ? "bg-tertiary-fixed" : "bg-secondary"}`}
            aria-hidden="true"
          />
          {isQuest ? "Quest" : "Challenge"}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-space-md p-space-md">
      <div className="flex flex-col gap-space-sm">
        <h4 className="line-clamp-2 text-headline-sm text-on-surface">{task.challengeTitle}</h4>
      </div>

      <div className="flex flex-col gap-2 pt-space-xs">
        <div className="flex items-baseline justify-between text-label-sm">
          <span className="font-semibold text-on-surface">
            {isQuest ? (
              task.dayLabel
            ) : (
              <>
                Day {task.dayNumber}
                {task.durationDays ? (
                  <span className="font-normal text-on-surface-variant">/{task.durationDays}</span>
                ) : null}
              </>
            )}
          </span>
          <span
            className={
              task.state === "done"
                ? "font-semibold text-on-tertiary-container"
                : "font-medium text-on-surface-variant"
            }
          >
            {task.state === "done"
              ? "Logged today"
              : task.state === "pending"
                ? "Verifying"
                : "Not logged yet"}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>

        {/* Who else is in it. The faces are the point: a card showing "12
            joined" and a card showing three faces plus a name are the same
            number and a different thing. */}
        {pile && pile.total > 0 && (
          <Facepile
            people={pile.people}
            total={pile.total}
            verb="Joined by"
            noun="person"
            size={20}
          />
        )}
      </div>
      </div>
    </Link>
  );
}
