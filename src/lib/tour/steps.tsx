import type { TourStep } from "@/components/ui/Tour";

/**
 * src/lib/tour/steps.tsx — what the tour actually says.
 *
 * Kept apart from the Tour shell so the copy can be edited without touching
 * positioning logic, and so one list describes the whole product in one place.
 *
 * TWO RULES THE COPY FOLLOWS
 *
 * 1. Every step says what the thing is AND how to use it. "This is Explore" is
 *    a label, not a tour. "Browse, open one, tap Join — you start on day 1" is
 *    a tour.
 *
 * 2. Nothing is promised that the app does not do. The pedometer only counts
 *    while the screen is on, proofs are checked automatically, private
 *    profiles hide some things and not others. A tour that oversells is how a
 *    user concludes the app is broken on day two.
 *
 * Targets are `data-tour` attributes rather than classes or hrefs, so a
 * restyle cannot silently unhook a step. Where the nav exists twice — the
 * desktop rail and the mobile bottom bar — both carry the same value and the
 * resolver picks whichever is visible.
 */

export const TOUR_STORAGE_KEY = "strivup:tour:v1";

const ALL_TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    chapter: "Day 0",
    title: "Welcome to StrivUp",
    body: (
      <>
        StrivUp is built on one idea: <strong>you post proof of what you did today</strong>, and
        the streak you build is the reward. This is a quick lap of everything — about a minute.
        Leave any time with Esc.
      </>
    ),
    placement: "center",
    route: "/feed",
  },

  /* ── Discovering and joining ───────────────────────────────────────────── */
  {
    id: "feed",
    chapter: "The loop",
    title: "Home is the proof feed",
    body: (
      <>
        Every post here is someone&apos;s evidence for the day. <strong>Like</strong> and{" "}
        <strong>comment</strong> under any of them, reply to a comment to start a thread, and use
        the flag icon to report anything that shouldn&apos;t be here. Tap a name or photo to open
        that person&apos;s profile. Yours is empty until you join something — that&apos;s next.
      </>
    ),
    target: '[data-tour="nav-feed"]',
    route: "/feed",
  },
  {
    id: "explore",
    chapter: "The loop",
    title: "Explore is where you find a challenge",
    body: (
      <>
        Browse by category or see what&apos;s trending. Open one to read what it asks for each
        day, then hit <strong>Join</strong> — you start on day 1 immediately, not whenever the
        challenge began. You can be in several at once.
      </>
    ),
    /* Not in the phone's bottom bar — that slot went to Challenges — so this
       anchors only on the desktop rail and shows centred on a phone, which
       is why the copy stands on its own. */
    target: '[data-tour="nav-explore"]',
    route: "/explore",
  },
  {
    id: "search",
    chapter: "The loop",
    title: "Search finds people and challenges",
    body: (
      <>
        One box for both. Look up a friend by name or username and follow them so their proofs
        reach your feed, or search for a challenge by what it is about.
      </>
    ),
    target: '[data-tour="nav-search"]',
    route: "/search",
  },

  /* ── The daily act ─────────────────────────────────────────────────────── */
  {
    id: "proof",
    chapter: "Every day",
    title: "Posting today's proof",
    body: (
      <>
        Open a challenge you&apos;ve joined and it leads with{" "}
        <strong>&ldquo;Post today&apos;s proof&rdquo;</strong>. Pick a photo or video, and while
        you write a caption it uploads and gets checked in the background. Once it&apos;s
        verified, <strong>Post</strong> lights up. You can only post after it passes — until then
        nobody else can see it anyway.
      </>
    ),
    placement: "center",
  },
  {
    id: "verification",
    chapter: "Every day",
    title: "Why proofs get checked",
    body: (
      <>
        Each submission is reviewed automatically against what the challenge asked for. If it
        doesn&apos;t match you&apos;ll be told why and can try a different photo — nothing is
        lost. This is the whole reason a StrivUp streak means something.
      </>
    ),
    placement: "center",
  },
  {
    id: "leaderboard",
    chapter: "Every day",
    title: "Leaderboards and the people beside you",
    body: (
      <>
        Every challenge has a leaderboard ranking everyone in it by consistency, so you can see
        who is keeping pace. Open any name there to follow them.
      </>
    ),
    placement: "center",
  },

  /* ── Creating ──────────────────────────────────────────────────────────── */
  {
    id: "create",
    chapter: "Build your own",
    title: "Create a challenge",
    body: (
      <>
        Give it a title and pick a cover — use a preset or upload your own. Choose a category,
        then a <strong>duration</strong>: 7, 14, 21, 30, 60 or 90 days, ongoing, or any length
        you like from the calendar.
      </>
    ),
    target: '[data-tour="nav-create"]',
    route: "/challenges/new",
  },
  {
    id: "create-proof",
    chapter: "Build your own",
    title: "The daily proof sets itself",
    body: (
      <>
        You don&apos;t pick what proof to ask for — StrivUp reads your title and category and
        works it out, so a running challenge asks for a run and a reading one asks for a page.
        That&apos;s deliberate: a mismatched proof rule makes a challenge impossible to complete
        honestly.
      </>
    ),
    placement: "center",
    route: "/challenges/new",
  },
  {
    id: "visibility",
    chapter: "Build your own",
    title: "Public or invite-only",
    body: (
      <>
        <strong>Public</strong> shows up in Explore for anyone to join. <strong>Private</strong>{" "}
        is hidden entirely and reachable only through an invite link, which you get the moment
        the challenge is created — share it and only those people can join.
      </>
    ),
    placement: "center",
    route: "/challenges/new",
  },
  {
    id: "my-challenges",
    chapter: "Build your own",
    title: "Running what you made",
    body: (
      <>
        Everything you create lives here. Open one to edit it, manage its daily tasks, or review
        what participants have submitted.
      </>
    ),
    target: '[data-tour="nav-my-challenges"]',
    route: "/creator/challenges",
  },

  /* ── Local ─────────────────────────────────────────────────────────────── */
  {
    id: "quests",
    chapter: "Out in the world",
    title: "Quests are real-world rewards",
    body: (
      <>
        Local businesses post quests you complete in person for something real. Use{" "}
        <strong>Near Me</strong> to sort them by distance from you — allow location when asked,
        and each card shows how far away it is. Your location is used on your device for the
        sort and never stored.
      </>
    ),
    target: '[data-tour="nav-quests"]',
    route: "/quests",
  },
  {
    id: "steps",
    chapter: "Out in the world",
    title: "Step and distance tracking",
    body: (
      <>
        Some challenges count steps instead of photos. Tap <strong>Start tracking</strong> and
        StrivUp counts from your phone&apos;s motion sensor, and measures distance by GPS if you
        allow location. One honest limit: a browser can only count while StrivUp is open on
        screen — lock the phone and it pauses.
      </>
    ),
    route: "/settings/activity",
    placement: "center",
  },

  {
    id: "rewards",
    chapter: "Out in the world",
    title: "My Rewards",
    body: (
      <>
        What you&apos;ve earned from quests collects here — what&apos;s been paid, and what is
        approved and still on its way. Some rewards need you to <strong>claim</strong> them,
        which is the only point you&apos;re ever asked for a UPI ID. StrivUp will never ask for
        a PIN, an OTP or a banking password.
      </>
    ),
    target: '[data-tour="nav-rewards"]',
    route: "/rewards",
  },

  /* ── You ───────────────────────────────────────────────────────────────── */
  {
    id: "alerts",
    chapter: "Your corner",
    title: "Alerts, and who wants to follow you",
    body: (
      <>
        Likes, comments, follows and proof results land here — tap the bell, which carries your
        unread count. If your account is private, incoming <strong>follow requests</strong>{" "}
        appear at the top for you to accept or decline.
      </>
    ),
    /* The bell in the home header carries this same anchor, which is what
       the step spotlights on a phone now that Alerts has no bottom-bar tab. */
    target: '[data-tour="nav-alerts"]',
    route: "/alerts",
  },
  {
    id: "profile",
    chapter: "Your corner",
    title: "Your profile is the record",
    body: (
      <>
        Your <strong>activity heatmap</strong> fills in a square for every day you post proof —
        the darker the square, the more you did. Alongside it are your current streaks, your
        achievements, and the challenges you&apos;re active in.
      </>
    ),
    target: '[data-tour="nav-profile"]',
    route: "/profile",
  },
  {
    id: "privacy",
    chapter: "Your corner",
    title: "Public or private, your call",
    body: (
      <>
        A <strong>public</strong> profile accepts followers automatically. A{" "}
        <strong>private</strong> one means you approve each one, and only approved followers see
        your challenges, heatmap, achievements and streaks. Set it in Settings → Privacy.
      </>
    ),
    route: "/settings/privacy",
    placement: "center",
  },
  {
    id: "coins",
    chapter: "Your corner",
    title: "StrivCoins",
    body: (
      <>
        You earn coins for showing up — verified proofs and streaks. Your balance is yours alone
        and never appears on your public profile, whatever your privacy setting.
      </>
    ),
    route: "/coins",
    placement: "center",
  },
  {
    id: "settings",
    chapter: "Your corner",
    title: "Settings",
    body: (
      <>
        Edit your profile and social links, pick the interests that shape Explore, manage your
        account, and control privacy. You can deactivate or delete your account from here too —
        no email required.
      </>
    ),
    route: "/settings",
    placement: "center",
  },
  {
    id: "install",
    chapter: "One last thing",
    title: "Put StrivUp on your home screen",
    body: (
      <>
        Install it from your browser menu and it opens full-screen like a normal app, which also
        makes step tracking far less fiddly. You&apos;ll be offered this automatically after a
        while.
      </>
    ),
    placement: "center",
  },
  {
    id: "done",
    chapter: "Day 1",
    title: "That's the whole app",
    body: (
      <>
        The only thing that actually matters now: <strong>join one challenge and post one
        proof.</strong> Everything else here is built around that. You can replay this tour any
        time from Settings → Help.
      </>
    ),
    placement: "center",
    route: "/explore",
  },
];

/**
 * The six stops the tour actually runs.
 *
 * CHANGED: the tour was 21 stops. A guided lap that long stops being a lap:
 * it arrives before anyone has a reason to care, and "Stop 1 of 21" reads as
 * a chore rather than a minute. Six covers the loop the product is built on,
 * which is the only thing a first run needs to land:
 *
 *   welcome        what StrivUp is for
 *   explore        find something and join it
 *   proof          post evidence, which is the whole mechanic
 *   my-challenges  where your streak lives
 *   rewards        what the streak gets you
 *   done           finish
 *
 * The other fifteen are kept above rather than deleted. They are written, they
 * are accurate, and the moment anyone wants a longer or a themed tour the
 * selection below is the only thing that has to change. Nothing else in the
 * app indexes into this array.
 */
const TOUR_STEP_IDS = [
  "welcome",
  "explore",
  "proof",
  "my-challenges",
  "rewards",
  "done",
] as const;

export const TOUR_STEPS: TourStep[] = TOUR_STEP_IDS.map((id) => {
  const step = ALL_TOUR_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`[tour] no step with id "${id}"`);
  return step;
});

