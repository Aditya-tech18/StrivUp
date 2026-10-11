/**
 * src/lib/challenges/presets.ts
 *
 * The three lists the create-challenge form is built from: categories, cover
 * art, and the rules that work out what a participant should photograph.
 *
 * Kept out of the page component because all three are data, not UI, and
 * because the proof rules need to be readable on their own — they are the part
 * that decides what every participant is asked for every day.
 */

/* ── Categories ──────────────────────────────────────────────────────────────
   challenges.category is free text with no CHECK constraint, so this list is a
   convenience, not a schema. A creator who types their own is as valid as one
   who picks — which matters, because the five we shipped with could not
   describe most of what students actually do.                               */

export interface CategoryGroup {
  group: string;
  items: string[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    group: "Body",
    items: ["Fitness", "Running", "Gym", "Yoga", "Sports", "Cycling", "Swimming", "Steps"],
  },
  {
    group: "Mind",
    items: ["Reading", "Study", "Coding", "Writing", "Language", "Music", "Art", "Skill"],
  },
  {
    group: "Life",
    items: ["Habits", "Wellness", "Sleep", "Nutrition", "Finance", "Productivity", "Mindfulness"],
  },
  { group: "Work", items: ["Business", "Career", "Side Project", "Content"] },
];

export const ALL_CATEGORIES: string[] = CATEGORY_GROUPS.flatMap((g) => g.items);

/* ── Cover presets ───────────────────────────────────────────────────────────
   Generated on a canvas rather than shipped as image files. Three reasons:
   nothing to host or cache-bust, they scale to any size, and the result is a
   real PNG uploaded to Storage exactly like a photo — so thumbnail_url stays a
   plain URL and every screen that already renders one needs no change.

   The palettes are the brand's own: secondary blue, its container, the pale
   fixed tints, and near-black ink.                                          */

export interface CoverPreset {
  id: string;
  label: string;
  /** Gradient stops, top-left to bottom-right. */
  from: string;
  to: string;
  /** Tint for the decorative arcs. */
  accent: string;
  /** Which corner the arcs radiate from, so the six do not look identical. */
  anchor: "tl" | "tr" | "bl" | "br" | "center";
}

export const COVER_PRESETS: CoverPreset[] = [
  { id: "midnight", label: "Midnight", from: "#0b1020", to: "#1d4ed8", accent: "#4069f2", anchor: "br" },
  { id: "electric", label: "Electric", from: "#1d4ed8", to: "#4069f2", accent: "#b7c4ff", anchor: "tl" },
  { id: "dawn", label: "Dawn", from: "#dce1ff", to: "#ffffff", accent: "#1d4ed8", anchor: "tr" },
  { id: "ink", label: "Ink", from: "#1b1b1b", to: "#303031", accent: "#60a5fa", anchor: "bl" },
  { id: "mint", label: "Mint", from: "#047857", to: "#84f9c3", accent: "#ecfdf5", anchor: "center" },
  { id: "slate", label: "Slate", from: "#4c4546", to: "#b7c4ff", accent: "#ffffff", anchor: "br" },
];

const COVER_W = 1200;
const COVER_H = 675;

/** Where the decorative arcs centre, per anchor. */
function anchorPoint(anchor: CoverPreset["anchor"]): [number, number] {
  switch (anchor) {
    case "tl":
      return [COVER_W * 0.12, COVER_H * 0.1];
    case "tr":
      return [COVER_W * 0.88, COVER_H * 0.12];
    case "bl":
      return [COVER_W * 0.1, COVER_H * 0.9];
    case "br":
      return [COVER_W * 0.9, COVER_H * 0.88];
    default:
      return [COVER_W * 0.5, COVER_H * 0.5];
  }
}

/** Paint a preset onto a canvas context. Shared by the picker and the upload. */
export function paintCover(ctx: CanvasRenderingContext2D, preset: CoverPreset, w: number, h: number) {
  const sx = w / COVER_W;
  const sy = h / COVER_H;

  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, preset.from);
  gradient.addColorStop(1, preset.to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Concentric arcs. Low alpha so they read as texture, not decoration.
  const [ax, ay] = anchorPoint(preset.anchor);
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = preset.accent;
  for (let i = 1; i <= 5; i++) {
    ctx.beginPath();
    ctx.lineWidth = Math.max(1, 14 * sx);
    ctx.arc(ax * sx, ay * sy, i * 120 * sx, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // A soft wash in the opposite corner, so the frame is not evenly lit.
  const glow = ctx.createRadialGradient(
    (COVER_W - ax) * sx,
    (COVER_H - ay) * sy,
    0,
    (COVER_W - ax) * sx,
    (COVER_H - ay) * sy,
    Math.max(w, h) * 0.6
  );
  glow.addColorStop(0, `${preset.accent}33`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Render a preset to a PNG File, ready to upload like any other image.
 * Returns null if the canvas is unavailable, so the caller can fall back to
 * creating the challenge without a cover rather than failing the submit.
 */
export async function coverToFile(preset: CoverPreset): Promise<File | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = COVER_W;
  canvas.height = COVER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  paintCover(ctx, preset, COVER_W, COVER_H);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png", 0.92)
  );
  if (!blob) return null;
  return new File([blob], `cover-${preset.id}.png`, { type: "image/png" });
}

/* ── Proof inference ─────────────────────────────────────────────────────────
   The form used to offer four proof options — Running GPS, Gym Selfie, Coding
   Screenshot, Page Reading — to every challenge regardless of subject, so a
   running challenge could be set to ask for a coding screenshot. Nothing
   stopped it, and a participant who then cannot produce the proof the
   challenge asks for simply stops posting.

   These rules read the title, description and category and decide. Order
   matters: the first match wins, so the specific patterns sit above the
   general ones.                                                             */

export interface ProofRule {
  id: string;
  /** Matched against title + description + category, case-insensitive. */
  pattern: RegExp;
  /** Short label stored in challenges.proof_methods. */
  label: string;
  /** Sentence stored in challenges.proof_instructions. */
  instruction: string;
  /** Medium, constrained by challenges_proof_type_check. */
  proofType: "photo" | "video" | "text" | "manual_review" | "none";
}

/**
 * ORDER IS THE SPECIFICATION. First match wins, so the more specific pattern
 * has to sit above the more general one that would also catch it. Two that
 * caught me out, both found by running real titles through the harness at
 * /dev/challenge-form-preview:
 *
 *   "10k steps a day" matched run, because `10k` is one of run's alternatives.
 *   steps therefore sits above run; "10k run" still reaches run, having no
 *   steps word of its own.
 *
 *   "Morning Pages journal" matched read, because `pages` is one of read's.
 *   write sits above read; "Read 20 pages a day" still reaches read, having
 *   none of write's words.
 */
export const PROOF_RULES: ProofRule[] = [
  {
    id: "code",
    pattern: /\b(leetcode|dsa|code|coding|program|algorithm|git|commit|develop|build|hack)\w*/i,
    label: "Coding screenshot",
    instruction:
      "A screenshot of today's work — the problem you solved, your commit, or the code you shipped.",
    proofType: "photo",
  },
  {
    id: "steps",
    pattern: /\b(steps|walk|walking|hike|hiking)\w*/i,
    label: "Step count",
    instruction: "A screenshot of today's step count, or a photo from the walk.",
    proofType: "photo",
  },
  {
    id: "run",
    pattern: /\b(run|running|jog|marathon|5k|10k|sprint)\w*/i,
    label: "Run proof",
    instruction:
      "A screenshot of today's route from your tracking app, or a photo from the run itself.",
    proofType: "photo",
  },
  {
    id: "gym",
    pattern: /\b(gym|workout|lift|lifting|strength|push.?up|pull.?up|abs|muscle|weights?)\w*/i,
    label: "Gym photo",
    instruction: "A photo from the gym — today's set, the machine, or a mirror shot.",
    proofType: "photo",
  },
  {
    id: "swim",
    pattern: /\b(swim|swimming|pool|laps)\w*/i,
    label: "Swim proof",
    instruction: "A photo at the pool, or a screenshot of today's laps.",
    proofType: "photo",
  },
  {
    id: "yoga",
    pattern: /\b(yoga|stretch|flexibility|pilates)\w*/i,
    label: "Yoga photo",
    instruction: "A photo of today's session — the mat, the pose, or your tracking app.",
    proofType: "photo",
  },
  {
    id: "meditate",
    pattern: /\b(meditat|mindful|breath|calm)\w*/i,
    label: "Session screenshot",
    instruction: "A screenshot of today's completed session from your meditation app.",
    proofType: "photo",
  },
  {
    id: "write",
    pattern: /\b(writ|journal|blog|essay|diary|poem|script)\w*/i,
    label: "Writing proof",
    instruction: "A screenshot or photo of what you wrote today, with the word count visible.",
    proofType: "photo",
  },
  {
    id: "read",
    pattern: /\b(read|reading|book|pages?|novel|chapter)\w*/i,
    label: "Reading proof",
    instruction: "A photo of the page you finished today, or a shot of the book with your progress.",
    proofType: "photo",
  },
  {
    id: "study",
    pattern: /\b(stud|exam|revis|syllabus|lecture|class|notes?|gate|jee|neet|upsc)\w*/i,
    label: "Study proof",
    instruction: "A photo of today's notes or a screenshot of the hours you logged.",
    proofType: "photo",
  },
  {
    id: "language",
    pattern: /\b(language|duolingo|spanish|french|german|japanese|vocab)\w*/i,
    label: "Lesson screenshot",
    instruction: "A screenshot of today's completed lesson or streak.",
    proofType: "photo",
  },
  {
    id: "music",
    pattern: /\b(music|guitar|piano|sing|instrument|practice|practise)\w*/i,
    label: "Practice proof",
    instruction: "A photo or short clip of today's practice.",
    proofType: "photo",
  },
  {
    id: "art",
    pattern: /\b(art|draw|sketch|paint|design|illustrat)\w*/i,
    label: "Today's work",
    instruction: "A photo of what you made today, finished or not.",
    proofType: "photo",
  },
  {
    id: "water",
    pattern: /\b(water|hydrat|diet|nutrition|meal|eat|food|calorie)\w*/i,
    label: "Meal or intake photo",
    instruction: "A photo of today's meal, or a screenshot of what you logged.",
    proofType: "photo",
  },
  {
    id: "sleep",
    pattern: /\b(sleep|wake|early|bedtime|rest)\w*/i,
    label: "Sleep screenshot",
    instruction: "A screenshot of last night from your sleep or alarm app.",
    proofType: "photo",
  },
  {
    id: "money",
    pattern: /\b(save|saving|budget|money|finance|invest|expense)\w*/i,
    label: "Progress screenshot",
    instruction: "A screenshot of today's entry — what you saved, spent, or logged.",
    proofType: "photo",
  },
];

/** What the form shows when nothing matches. Deliberately broad, not wrong. */
export const FALLBACK_PROOF: Omit<ProofRule, "pattern"> = {
  id: "generic",
  label: "Daily photo",
  instruction: "A photo showing you did it today.",
  proofType: "photo",
};

export interface InferredProof {
  /** Matches the rule's id, so an inferred proof and a chosen one are the
   *  same shape and the UI never has to branch on which it is holding. */
  id: string;
  label: string;
  instruction: string;
  proofType: ProofRule["proofType"];
  /** False when nothing matched and the fallback is being used. */
  matched: boolean;
}

/**
 * Work out the daily proof from what the creator has typed so far.
 *
 * Title is weighted above description and category by being searched first:
 * "Running" in a title is what the challenge is, whereas the same word in a
 * long description might be incidental.
 */
export function inferProof(
  title: string,
  description: string,
  category: string
): InferredProof {
  for (const source of [title, category, description]) {
    if (!source) continue;
    for (const rule of PROOF_RULES) {
      if (rule.pattern.test(source)) {
        return {
          label: rule.label,
          instruction: rule.instruction,
          proofType: rule.proofType,
          id: rule.id,
          matched: true,
        };
      }
    }
  }
  return { ...FALLBACK_PROOF, matched: false };
}

/** Every distinct proof option, for the rare case a creator overrides. */
export const PROOF_OPTIONS: Omit<ProofRule, "pattern">[] = [
  ...PROOF_RULES.map(({ id, label, instruction, proofType }) => ({
    id,
    label,
    instruction,
    proofType,
  })),
  FALLBACK_PROOF,
];
