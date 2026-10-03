/**
 * src/lib/proof/categories.ts — what counts as proof, per kind of activity.
 *
 * The problem this solves: review-proof currently judges a photo against the
 * task title alone, with an instruction to "be reasonably lenient". So a photo
 * of a book passes a "read 20 pages" task, and a gym selfie passes "run 5 km".
 *
 * Here each activity kind carries an explicit specification — what the image
 * must show, what is merely nice to have, and what should be rejected outright.
 * The participant sees it BEFORE uploading, so there is no guessing, and the
 * model judges against it instead of against its own taste.
 *
 * `required` is the load-bearing list. Phrase each entry as something visible
 * in an image, not as an intention: "distance in km or miles" can be checked,
 * "evidence of effort" cannot.
 *
 * Anything not covered here goes to OTHER, where the free-text description is
 * turned into the same shape by the model (see /api/proof/requirements).
 */

export type ProofCategoryId =
  | "running"
  | "walking"
  | "gym"
  | "study"
  | "reading"
  | "food"
  | "purchase"
  | "coding"
  | "learning"
  | "creative"
  | "music"
  | "wellness"
  | "event"
  | "other";

export interface ProofSpec {
  /** Must all be visible, or the proof is rejected. */
  required: string[];
  /** Strengthens the proof but is not demanded. */
  optional: string[];
  /** Common near-misses that look related but prove nothing. */
  rejectIf: string[];
  /** One line shown to the participant before they upload. */
  hint: string;
}

export interface ProofCategory extends ProofSpec {
  id: ProofCategoryId;
  label: string;
  icon: string;
  /** Helps a creator recognise their own task in the list. */
  examples: string[];
}

export const PROOF_CATEGORIES: ProofCategory[] = [
  {
    id: "running",
    label: "Running",
    icon: "🏃",
    examples: ["Run 5 KM", "Morning jog", "Complete a 10K"],
    required: [
      "a running/fitness tracker screen (app, watch or phone health app)",
      "the distance covered, with its unit",
      "the activity recognised as a run or jog",
    ],
    optional: ["duration or pace", "route map", "date and time", "heart rate"],
    rejectIf: [
      "a photo of a person running, with no distance shown",
      "running shoes or a treadmill with no recorded activity",
      "a selfie in sportswear",
    ],
    hint: "Upload your running app or watch screen showing the distance — a photo of you running doesn't show how far you went.",
  },
  {
    id: "walking",
    label: "Walking / Steps",
    icon: "🚶",
    examples: ["Walk 10,000 steps", "Evening walk"],
    required: [
      "a step counter or health app screen",
      "the step count or distance as a number",
    ],
    optional: ["date", "hourly breakdown", "distance"],
    rejectIf: ["a photo of a park or a path", "shoes with no step count"],
    hint: "Screenshot your step counter showing today's number.",
  },
  {
    id: "gym",
    label: "Gym / Workout",
    icon: "💪",
    examples: ["Today's gym session", "Leg day", "Complete the workout"],
    required: [
      "gym equipment or a workout in progress, OR a workout-app summary",
      "something tying it to an actual session — sets, reps, duration, or a check-in",
    ],
    optional: ["date and time", "gym name or signage", "exercise names"],
    rejectIf: [
      "a mirror selfie with no equipment or session detail",
      "a protein shake or gym bag alone",
    ],
    hint: "Show the workout itself or your workout-app summary — a mirror selfie alone won't do.",
  },
  {
    id: "study",
    label: "Study",
    icon: "📚",
    examples: ["Study 2 hours", "Revise chapter 4"],
    required: [
      "a study timer, session tracker, or the work actually produced (notes, solved problems)",
      "something indicating how long or how much — elapsed time, page count, or problem count",
    ],
    optional: ["subject or topic visible", "date", "a tidy desk setup"],
    rejectIf: [
      "a closed book or a desk photo with no work and no timer",
      "a stock image of studying",
    ],
    hint: "Show your timer or the work you produced — an open book by itself doesn't show you studied.",
  },
  {
    id: "reading",
    label: "Reading",
    icon: "📖",
    examples: ["Read 20 pages", "Finish a chapter"],
    required: [
      "a reading-app progress screen, OR the book open at an identifiable page",
      "the page number, percentage, or chapter reached",
    ],
    optional: ["book title or cover", "reading streak", "time spent"],
    rejectIf: ["a book cover alone", "a shelf of books"],
    hint: "Show your reading progress — the page you reached, or your e-reader's progress screen.",
  },
  {
    id: "food",
    label: "Restaurant / Food",
    icon: "🍽",
    examples: ["Visit XYZ Restaurant", "Try the new burger"],
    required: [
      "the ordered item or the venue, clearly identifiable",
      "something tying it to this place and this visit — a bill, a QR check-in, signage, or branded packaging",
    ],
    optional: ["date and time on a receipt", "table or interior", "menu"],
    rejectIf: [
      "a food photo from the internet",
      "a dish with nothing identifying the restaurant",
    ],
    hint: "Include something that identifies the place — the bill, the signage, or the branded packaging, not just the food.",
  },
  {
    id: "purchase",
    label: "Purchase / Receipt",
    icon: "🧾",
    examples: ["Buy a product", "Place an order"],
    required: [
      "a receipt, bill, or order confirmation",
      "the merchant or store name",
      "the date of purchase",
    ],
    optional: ["amount", "items purchased", "order or bill number"],
    rejectIf: ["a product photo with no receipt", "an empty shopping bag"],
    hint: "Upload the bill or order confirmation showing the store name and date.",
  },
  {
    id: "coding",
    label: "Coding / Problem solving",
    icon: "💻",
    examples: ["Solve 2 LeetCode problems", "Push a commit"],
    required: [
      "the coding platform's own interface, recognisable as such",
      "the problem or project identifiable by name",
      "a success state — accepted, passing tests, or a completed commit",
    ],
    optional: ["date and time", "runtime stats", "username visible", "streak"],
    rejectIf: [
      "a laptop with code on screen but no result or platform visible",
      "an editor window with no submission or test outcome",
    ],
    hint: "Screenshot the platform showing the problem name and the accepted/passing result.",
  },
  {
    id: "learning",
    label: "Online course / Lesson",
    icon: "🎓",
    examples: ["Complete a Duolingo lesson", "Finish a Coursera module"],
    required: [
      "the learning platform's interface",
      "a completion indicator — lesson complete, progress bar, XP, or certificate",
    ],
    optional: ["course or lesson name", "date", "streak count"],
    rejectIf: ["a course home page with no progress", "a logged-out landing page"],
    hint: "Screenshot the lesson-complete or progress screen from the app.",
  },
  {
    id: "creative",
    label: "Creative work",
    icon: "🎨",
    examples: ["Photography challenge", "Draw something", "Upload your project"],
    required: ["the finished work itself"],
    optional: ["work in progress", "tools or materials", "date", "editing software visible"],
    rejectIf: ["a blank canvas or an empty document", "someone else's work reposted"],
    hint: "Upload the work you made.",
  },
  {
    id: "music",
    label: "Music practice",
    icon: "🎸",
    examples: ["Practice guitar 30 minutes", "Daily riyaz"],
    required: [
      "the instrument in use, OR a practice-app session summary",
      "something showing duration or what was practised",
    ],
    optional: ["sheet music or tabs", "a recording", "metronome or timer"],
    rejectIf: ["an instrument in its case", "a photo of a guitar on a stand"],
    hint: "Show the practice session — your timer, app summary, or playing in progress.",
  },
  {
    id: "wellness",
    label: "Health / Wellness",
    icon: "💧",
    examples: ["Drink 3L water", "10 minutes of meditation", "Sleep 8 hours"],
    required: [
      "a tracker, app screen, or log for the habit",
      "the measured amount — volume, minutes, or hours",
    ],
    optional: ["date", "streak", "daily goal"],
    rejectIf: ["a water bottle photo with no log", "a bed or yoga mat alone"],
    hint: "Show your tracker with the amount — a photo of the bottle doesn't show how much you drank.",
  },
  {
    id: "event",
    label: "Event / Visit",
    icon: "📍",
    examples: ["Attend a college event", "Visit a store"],
    required: [
      "the venue or event, identifiable by signage, banner, stage or storefront",
      "something tying it to this visit — a ticket, entry pass, QR check-in, or you in the frame",
    ],
    optional: ["date and time", "crowd or setup", "badge or wristband"],
    rejectIf: ["a promotional poster photographed anywhere", "a generic crowd shot"],
    hint: "Include the venue signage plus your ticket or entry pass.",
  },
  {
    id: "other",
    label: "Something else",
    icon: "✨",
    examples: ["Describe it and we'll work out what proof fits"],
    required: [],
    optional: [],
    rejectIf: [],
    hint: "Describe what you'll be doing and we'll tell you exactly what to upload.",
  },
];

export function getProofCategory(id: string): ProofCategory | undefined {
  return PROOF_CATEGORIES.find((c) => c.id === id);
}

/** Categories offered in a picker — OTHER always sits last. */
export function pickableCategories(): ProofCategory[] {
  return [
    ...PROOF_CATEGORIES.filter((c) => c.id !== "other"),
    PROOF_CATEGORIES[PROOF_CATEGORIES.length - 1],
  ];
}

/**
 * Turns a spec into the instruction block the vision model judges against.
 * Shared by the requirement generator and review-proof so the wording the
 * participant was shown is the wording the model is held to.
 */
export function specToPrompt(spec: ProofSpec, activityLabel: string): string {
  const lines = [`The participant said they would do: ${activityLabel}.`, "", "The image MUST show ALL of:"];
  for (const r of spec.required) lines.push(`  - ${r}`);

  if (spec.optional.length > 0) {
    lines.push("", "These strengthen the proof but are not required:");
    for (const o of spec.optional) lines.push(`  - ${o}`);
  }

  if (spec.rejectIf.length > 0) {
    lines.push("", "Reject the proof if it is only one of these:");
    for (const r of spec.rejectIf) lines.push(`  - ${r}`);
  }

  lines.push(
    "",
    "Judge against the required list, not against whether the image looks nice or related.",
    "An image that is about the right topic but misses a required element is NOT proof."
  );
  return lines.join("\n");
}
