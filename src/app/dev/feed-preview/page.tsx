/**
 * /dev/feed-preview — dev-only visual harness for the home-feed sections.
 *
 * The home feed sits behind auth, so its components could never be eyeballed
 * without a live session. This renders them against fabricated data in every
 * state that matters, so layout and spacing can be reviewed and iterated on
 * directly.
 *
 * 404s in production, like /dev/components. Nothing here reaches real data.
 */

import { notFound } from "next/navigation";
import { TodaysTasks } from "@/components/features/TodaysTasks";
import { CoinPill } from "@/components/features/CoinPill";
import { Flame } from "lucide-react";
import type { TodaySummary, TodayTask } from "@/lib/data/today";
import { pickHomeTasks } from "@/lib/data/today";
import { SuggestedAccountsRail } from "@/components/features/people/SuggestedAccountsRail";
import type { SuggestedProfile, PersonCard } from "@/lib/data/social";
import { Facepile } from "@/components/features/people/Facepile";
import { FeedCard, type FeedPost } from "@/components/features/FeedCard";
import { HomeRotator } from "@/components/features/home/HomeRotator";
import { AutoScrollRail } from "@/components/features/home/AutoScrollRail";
import { BottomNav } from "@/components/ui";
import { PermissionControls } from "@/components/features/permissions/PermissionControls";
import { AlertRow, type Notification } from "@/components/features/alerts/AlertRow";
import { ActiveCard } from "@/components/features/home/ActiveCard";

function task(over: Partial<TodayTask> & { key: string }): TodayTask {
  return {
    challengeId: "c1",
    challengeTitle: "100 Days of LeetCode",
    taskId: null,
    title: "100 Days of LeetCode",
    dayLabel: "Day 42 of 100",
    dayNumber: 42,
    durationDays: 100,
    proofType: null,
    thumbnailUrl: null,
    consistencyPct: 72,
    kind: "challenge",
    state: "todo",
    ...over,
  };
}

function summary(over: Partial<TodaySummary>): TodaySummary {
  return {
    tasks: [],
    completed: 0,
    total: 0,
    percent: 0,
    resetsInMs: 6 * 3600_000 + 12 * 60_000,
    bestStreak: 0,
    justCompleted: 0,
    ...over,
  };
}

const MIXED = [
  task({ key: "a", title: "Solve 1 hard problem", taskId: "t1", state: "done" }),
  task({
    key: "b",
    title: "Morning run 5KM",
    taskId: "t2",
    challengeTitle: "Winter Arc",
    state: "todo",
    proofType: "photo",
  }),
  task({ key: "c", title: "Read 20 pages", taskId: "t3", state: "rejected" }),
];

const CASES: Array<{ label: string; note: string; data: TodaySummary }> = [
  {
    label: "Empty — nothing joined",
    note: "The activation moment. This is what a brand-new user sees.",
    data: summary({}),
  },
  {
    label: "Mixed states",
    note: "done / todo / retry, with the segmented Discipline Index.",
    data: summary({ tasks: MIXED, completed: 1, total: 3, percent: 33, bestStreak: 14 }),
  },
  {
    label: "One task, pending review",
    note: "Single-task challenge awaiting the AI verdict.",
    data: summary({
      tasks: [task({ key: "d", state: "pending" })],
      completed: 0,
      total: 1,
      percent: 0,
      bestStreak: 3,
    }),
  },
  {
    label: "All done",
    note: "The reward state — everything logged.",
    data: summary({
      tasks: [
        task({ key: "e", title: "Solve 1 hard problem", taskId: "t1", state: "done" }),
        task({ key: "f", title: "Morning run 5KM", taskId: "t2", state: "done" }),
      ],
      completed: 2,
      total: 2,
      percent: 100,
      bestStreak: 21,
    }),
  },
];

const FACES: PersonCard[] = [
  {
    id: "f1", username: "anna_rose1405", fullName: "Anna Rose",
    /* A local file, so it genuinely loads in the harness. This matters:
       the first version of these fixtures used remote URLs that all failed
       in this sandbox, so every face took the fallback branch and the
       loaded-image branch was never once rendered. That is the branch that
       was broken in production. */
    avatarUrl: "/icons/icon-192.png",
    bio: null,
  },
  // A URL that will 404: proves the onError fallback, not just the null path.
  { id: "f2", username: "broken", fullName: "Broken Link",
    avatarUrl: "https://api.dicebear.com/this-404s.png", bio: null },
  { id: "f3", username: "nopic", fullName: "No Picture", avatarUrl: null, bio: null },
];

/* A whole FeedCard, not just the Facepile on its own. The facepile looked
   correct in isolation while being invisible inside a real card, so the
   integration is what gets rendered here now. */
const POST: FeedPost = {
  id: "post-1",
  challengeId: "00000000-0000-4000-8000-000000000001",
  challengeTitle: "100 Days of LeetCode",
  authorName: "Adi Chaubey",
  authorAvatarUrl: "/icons/icon-192.png",
  verified: false,
  category: "Study",
  dayLabel: "2H AGO",
  streakDay: 12,
  proofImageUrl: "/og.png",
  mediaWidth: 1200,
  mediaHeight: 630,
  caption: "Day 12. Two hours in the library, no phone.",
  likeCount: 86,
  likePreview: FACES,
  commentCount: 4,
  viewerHasLiked: false,
  authorId: "f9",
  adminRemoved: false,
};

const SUGGESTED: SuggestedProfile[] = [
  {
    id: "p1", username: "ananya", fullName: "Ananya Rao",
    avatarUrl: null, bio: "Marathon in training. Up at 5.",
    challengesCompleted: 56, questsCompleted: 23,
    challengesJoined: 61, questsJoined: 25,
    followerCount: 412, sharedInterests: 3,
  },
  {
    id: "p2", username: "devk", fullName: "Dev Kapoor",
    avatarUrl: null, bio: "Shipping something every week.",
    challengesCompleted: 0, questsCompleted: 0,
    challengesJoined: 4, questsJoined: 2,
    followerCount: 18, sharedInterests: 1,
  },
  {
    id: "p3", username: null, fullName: "Meera",
    avatarUrl: null, bio: null,
    challengesCompleted: 0, questsCompleted: 0,
    challengesJoined: 0, questsJoined: 0,
    followerCount: 0, sharedInterests: 0,
  },
];

/* Five challenges at different consistencies, to show that pickHomeTasks
   returns the two strongest plus the weakest with work outstanding. */
const MANY: TodayTask[] = [
  task({ key: "a", challengeId: "a", challengeTitle: "Reading", title: "Read 20 pages", consistencyPct: 95 }),
  task({ key: "b", challengeId: "b", challengeTitle: "Running", title: "Run 5k", consistencyPct: 88 }),
  task({ key: "c", challengeId: "c", challengeTitle: "Spanish", title: "One lesson", consistencyPct: 60 }),
  task({ key: "d", challengeId: "d", challengeTitle: "Cold showers", title: "Log it", consistencyPct: 20 }),
  task({ key: "e", challengeId: "e", challengeTitle: "Journalling", title: "Write", consistencyPct: 45, state: "done" }),
];

const QUEST_TASKS: TodayTask[] = [
  task({
    key: "q1", challengeId: "q1", challengeTitle: "Veer Ji Chaap",
    title: "Order the malai chaap", dayLabel: "1 of 3 done",
    kind: "quest", consistencyPct: null, dayNumber: 1, durationDays: 3,
  }),
  task({
    key: "q2", challengeId: "q1", challengeTitle: "Veer Ji Chaap",
    title: "Upload the bill", dayLabel: "1 of 3 done",
    kind: "quest", consistencyPct: null, dayNumber: 1, durationDays: 3, state: "done",
  }),
];

/* Eight items for the Active rail harness, alternating kind so both border
   colours are on screen at once. Wider than any viewport, which is the
   condition the loop needs. */
const RAIL_ITEMS: TodayTask[] = Array.from({ length: 8 }, (_, i) =>
  task({
    key: `rail-${i}`,
    challengeId: `rail-${i}`,
    challengeTitle: i % 2 === 0 ? `Challenge ${i + 1}` : `Quest ${i + 1}`,
    kind: i % 2 === 0 ? "challenge" : "quest",
    dayLabel: i % 2 === 0 ? `Day ${i + 1} of 30` : `${i} of 3 done`,
    dayNumber: i + 1,
    durationDays: 30,
    thumbnailUrl: null,
    state: "todo",
  })
);

/* One notification of every kind the live database actually holds, plus a
   read one, so every tone, pill and the read/unread split are all on screen
   at once. Fabricated: nothing here touches the notifications table. */
function notif(over: Partial<Notification> & { id: string; type: string }): Notification {
  return {
    title: "Notification",
    message: null,
    is_read: false,
    related_challenge_id: null,
    related_quest_id: null,
    related_user_id: null,
    created_at: new Date().toISOString(),
    ...over,
  } as Notification;
}

const ALERTS: Notification[] = [
  notif({
    id: "n1", type: "challenge_joined",
    title: "New quest participant",
    message: 'Adi_Chaubey joined "Moonliscious Foodie Fiesta".',
    related_quest_id: "00000000-0000-4000-8000-000000000001",
  }),
  notif({
    id: "n2", type: "business_verification_approved",
    title: "Business Verified!",
    message: "Your business is now verified. You can publish quests and start engaging with the StrivUp community.",
  }),
  notif({
    id: "n3", type: "proof_rejected",
    title: "Proof rejected",
    message: 'Your proof for "Winter Arc" (Day 1) was rejected: This exact image has already been submitted by someone else. Please upload your own photo.',
    related_challenge_id: "00000000-0000-4000-8000-000000000002",
  }),
  notif({
    id: "n4", type: "proof_approved",
    title: "Proof approved",
    message: 'Day 17 of "CDS preparation" is logged.',
    related_challenge_id: "00000000-0000-4000-8000-000000000003",
  }),
  notif({
    id: "n5", type: "new_follower",
    title: "New follower",
    message: "Aru Bansal started following you.",
    related_user_id: "00000000-0000-4000-8000-000000000004",
  }),
  notif({
    id: "n6", type: "proof_liked",
    title: "New like",
    message: "Aditya Chaubey liked your proof.",
    related_user_id: "00000000-0000-4000-8000-000000000005",
    is_read: true,
  }),
  notif({
    id: "n7", type: "proof_commented",
    title: "New comment",
    message: "Aryan Bansal commented on your proof.",
    related_user_id: "00000000-0000-4000-8000-000000000006",
  }),
  notif({
    id: "n8", type: "something_new_we_do_not_know",
    title: "Unknown kind",
    message: "Falls back to a neutral tone and no destination.",
  }),
];

export default function FeedPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto flex max-w-md flex-col gap-space-xl px-gutter py-space-lg">
        <header>
          <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
            Dev harness
          </p>
          <h1 className="text-headline-lg-mobile text-on-surface">Home feed sections</h1>
          <p className="mt-space-xs text-body-sm text-on-surface-variant">
            Fabricated data. Not reachable in production.
          </p>
        </header>

        {/* The permission rows, which otherwise only exist behind auth. */}
        <section className="flex flex-col gap-space-sm" data-testid="permissions-section">
          <div className="border-l-2 border-secondary pl-space-sm">
            <h2 className="text-label-lg text-on-surface">Permission controls</h2>
            <p className="text-body-sm text-on-surface-variant">
              Same rows the launch sheet and Settings use.
            </p>
          </div>
          <PermissionControls variant="settings" />
        </section>

        {/* Every alert kind at once: tones, pills, read vs unread. */}
        <section className="flex flex-col gap-space-sm" data-testid="alerts-section">
          <div className="border-l-2 border-secondary pl-space-sm">
            <h2 className="text-label-lg text-on-surface">Alert rows: every kind</h2>
            <p className="text-body-sm text-on-surface-variant">
              Accent, tint and destination pill per type.
            </p>
          </div>
          <ul className="flex flex-col gap-2" role="list">
            {ALERTS.map((n) => (
              <li key={n.id}>
                <AlertRow notif={n} />
              </li>
            ))}
          </ul>
        </section>

        {/* The bottom bar. Fixed, md:hidden, so it pins to the viewport on a
            phone-width window exactly as it does in the app. */}
        <section className="flex flex-col gap-space-sm" data-testid="bottomnav-section">
          <div className="border-l-2 border-secondary pl-space-sm">
            <h2 className="text-label-lg text-on-surface">Bottom nav</h2>
            <p className="text-body-sm text-on-surface-variant">
              Home, Quest (glowing), plus, Challenges, Search.
            </p>
          </div>
          <BottomNav />
        </section>

        {/* The self-scrolling Active rail. Eight items, which is more than
            fits, so the loop and its duplicate copy are both exercised. */}
        <section className="flex flex-col gap-space-sm" data-testid="active-rail-section">
          <div className="border-l-2 border-secondary pl-space-sm">
            <h2 className="text-label-lg text-on-surface">
              Active rail: auto-scroll, loop, borders
            </h2>
            <p className="text-body-sm text-on-surface-variant">
              Quests blue, challenges black. Hover pauses it.
            </p>
          </div>
          <AutoScrollRail label="Active challenges and quests">
            {RAIL_ITEMS.map((t) => (
              <ActiveCard key={t.key} task={t} />
            ))}
          </AutoScrollRail>
        </section>

        <section className="flex flex-col gap-space-sm">
          <div className="border-l-2 border-secondary pl-space-sm">
            <h2 className="text-label-lg text-on-surface">
              Rotator: banner, quests, challenges
            </h2>
            <p className="text-body-sm text-on-surface-variant">
              Three seconds each, looping. Touching it stops the rotation for
              the rest of the visit.
            </p>
          </div>
          <HomeRotator
            summary={summary({ tasks: pickHomeTasks(MANY), total: 3, completed: 0, percent: 0 })}
            questTasks={QUEST_TASKS}
          />
        </section>

        <section className="flex flex-col gap-space-sm">
          <div className="border-l-2 border-secondary pl-space-sm">
            <h2 className="text-label-lg text-on-surface">Feed card with likes</h2>
            <p className="text-body-sm text-on-surface-variant">
              The real card. The facepile has to be visible here, not only in
              the isolated row below.
            </p>
          </div>
          <FeedCard post={POST} viewerId="me" />
        </section>

        <section className="flex flex-col gap-space-sm">
          <div className="border-l-2 border-secondary pl-space-sm">
            <h2 className="text-label-lg text-on-surface">Facepile</h2>
            <p className="text-body-sm text-on-surface-variant">
              A real picture, a broken URL and a missing one, so the fallback
              is visible next to the thing it replaces.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-space-md elev-1 surface-raised">
            <Facepile people={FACES} total={86} verb="Liked by" noun="like" />
            <Facepile people={FACES} total={3} verb="Joined by" noun="member" size={24} />
            <Facepile people={[]} total={12} verb="Joined by" noun="member" />
            <Facepile people={FACES.slice(0, 1)} total={1} verb="Liked by" noun="like" />
          </div>
        </section>

        <section className="flex flex-col gap-space-sm">
          <div className="border-l-2 border-secondary pl-space-sm">
            <h2 className="text-label-lg text-on-surface">People to follow</h2>
            <p className="text-body-sm text-on-surface-variant">
              Finished work, then current work, then &ldquo;just getting started&rdquo;.
            </p>
          </div>
          <SuggestedAccountsRail people={SUGGESTED} viewerId="me" />
        </section>

        <section className="flex flex-col gap-space-sm">
          <div className="border-l-2 border-secondary pl-space-sm">
            <h2 className="text-label-lg text-on-surface">
              Today&apos;s Tasks: three of five, with the quest toggle
            </h2>
            <p className="text-body-sm text-on-surface-variant">
              Reading 95% and Running 88% are the two kept up; Cold showers
              20% is the one slipping. Spanish and Journalling are held back.
            </p>
          </div>
          <TodaysTasks
            summary={summary({ tasks: pickHomeTasks(MANY), total: 3, completed: 0, percent: 0 })}
            questTasks={QUEST_TASKS}
          />
        </section>

        {/* Header pills, as they sit in the feed */}
        <section className="flex flex-col gap-space-sm">
          <div className="border-l-2 border-secondary pl-space-sm">
            <h2 className="text-label-lg text-on-surface">Header pills</h2>
            <p className="text-body-sm text-on-surface-variant">
              Streak + StrivCoin. Second row shows the first-visit-of-day flourish.
            </p>
          </div>
          <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-lowest p-space-md elev-1 surface-raised">
            <div className="flex items-center justify-end gap-space-xs">
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container-high px-space-md py-1.5 elev-1">
                <Flame size={15} className="text-secondary" aria-hidden="true" />
                <span className="text-label-md font-bold text-on-surface">14</span>
              </div>
              <CoinPill balance={248} earnedToday={0} />
            </div>
            <div className="flex items-center justify-end gap-space-xs">
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container-high px-space-md py-1.5 elev-1">
                <Flame size={15} className="text-secondary" aria-hidden="true" />
                <span className="text-label-md font-bold text-on-surface">14</span>
              </div>
              <CoinPill balance={249} earnedToday={1} />
            </div>
            <div className="flex items-center justify-end gap-space-xs">
              <CoinPill balance={0} earnedToday={0} />
            </div>
          </div>
        </section>

        {CASES.map((c) => (
          <section key={c.label} className="flex flex-col gap-space-sm">
            <div className="border-l-2 border-secondary pl-space-sm">
              <h2 className="text-label-lg text-on-surface">{c.label}</h2>
              <p className="text-body-sm text-on-surface-variant">{c.note}</p>
            </div>
            <TodaysTasks summary={c.data} />
          </section>
        ))}
      </div>
    </div>
  );
}
