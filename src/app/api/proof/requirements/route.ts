import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProofCategory, type ProofSpec } from "@/lib/proof/categories";

/**
 * POST /api/proof/requirements
 *   { category, customText?, taskTitle?, taskDescription? }
 *
 * Turns a chosen activity into an explicit list of what the proof image must
 * show, so the participant is told up front instead of guessing and the
 * reviewer has something concrete to judge against.
 *
 * A known category resolves from the catalog — no model call, no latency, no
 * cost, and the same answer every time. Only "other" needs the model, because
 * only there is the activity unknown.
 *
 * The key is read server-side and never reaches the browser.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** Mirrors extractOutputText in supabase/functions/review-proof. */
function extractOutputText(payload: unknown): string {
  const steps = (payload as { steps?: unknown[] })?.steps;
  if (!Array.isArray(steps)) return "";
  const chunks: string[] = [];
  for (const step of steps) {
    const s = step as { type?: string; content?: unknown[] };
    if (s?.type !== "model_output" || !Array.isArray(s.content)) continue;
    for (const part of s.content) {
      const p = part as { type?: string; text?: string };
      if (p?.type === "text" && typeof p.text === "string") chunks.push(p.text);
    }
  }
  return chunks.join("");
}

/**
 * Last-resort spec for a free-text activity when the model is unavailable.
 *
 * Deliberately demanding rather than permissive: if we cannot work out what
 * this activity looks like, the safe failure is to ask for a clear, dated
 * artefact — not to wave everything through.
 */
function fallbackSpec(activity: string): ProofSpec {
  return {
    required: [
      `something that directly shows "${activity}" having been done`,
      "a detail tying it to this attempt — a timestamp, a tracker screen, a result, or a finished output",
    ],
    optional: ["date and time", "an app or tool screen", "the location"],
    rejectIf: [
      "an image that is merely about the topic without showing it was done",
      "a stock or reused photo",
    ],
    hint: `Upload something that clearly shows you did "${activity}" — and if you can, include a timestamp or an app screen.`,
  };
}

function clean(list: unknown, max: number): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 200)
    .slice(0, max);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  let body: {
    category?: string;
    customText?: string;
    taskTitle?: string;
    taskDescription?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const categoryId = String(body.category ?? "").trim();
  const category = getProofCategory(categoryId);
  if (!category) {
    return NextResponse.json({ error: `unknown category: ${categoryId}` }, { status: 400 });
  }

  /* Known category — answer from the catalog. */
  if (category.id !== "other") {
    return NextResponse.json({
      ok: true,
      activity_category: category.id,
      activity_label: category.label,
      custom_activity: null,
      required_elements: category.required,
      optional_elements: category.optional,
      reject_if: category.rejectIf,
      participant_hint: category.hint,
      generated_by: "template",
    });
  }

  const customText = String(body.customText ?? "").trim();
  if (customText.length < 3) {
    return NextResponse.json(
      { error: "describe the activity in a few words" },
      { status: 400 }
    );
  }
  if (customText.length > 200) {
    return NextResponse.json({ error: "description is too long" }, { status: 400 });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    /* Not an error the user can act on — give them a usable spec and say it
       was not model-generated, rather than blocking task creation. */
    const spec = fallbackSpec(customText);
    return NextResponse.json({
      ok: true,
      activity_category: "other",
      activity_label: customText,
      custom_activity: customText,
      required_elements: spec.required,
      optional_elements: spec.optional,
      reject_if: spec.rejectIf,
      participant_hint: spec.hint,
      generated_by: "template",
      note: "AI suggestions are unavailable on this deployment, so these are generic. You can edit them.",
    });
  }

  const prompt = [
    "You define what photographic evidence proves someone completed an activity.",
    "",
    `Activity: "${customText}"`,
    body.taskTitle ? `It belongs to the task: "${body.taskTitle}"` : "",
    body.taskDescription ? `Task description: "${body.taskDescription}"` : "",
    "",
    "Return the elements a single photo or screenshot must show for this to count.",
    "",
    "Rules:",
    "- Every required element must be VISIBLE in an image. 'distance in km' works; 'genuine effort' does not.",
    "- Prefer evidence that is hard to fake: app screens, counters, timestamps, results, receipts.",
    "- Required: 1 to 3 entries. Keep it to what genuinely proves completion.",
    "- reject_if: name the near-misses that look related but prove nothing — the photo someone would submit hoping it passes.",
    "- hint: one friendly sentence telling the participant what to upload.",
    "- Write for an Indian audience in plain English. No jargon.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: [{ type: "text", text: prompt }],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: {
              activity_label: { type: "string" },
              required_elements: { type: "array", items: { type: "string" } },
              optional_elements: { type: "array", items: { type: "string" } },
              reject_if: { type: "array", items: { type: "string" } },
              hint: { type: "string" },
            },
            required: ["activity_label", "required_elements", "hint"],
          },
        },
      }),
    });

    if (!res.ok) throw new Error(`gemini HTTP ${res.status}`);

    const parsed = JSON.parse(extractOutputText(await res.json())) as {
      activity_label?: string;
      required_elements?: unknown;
      optional_elements?: unknown;
      reject_if?: unknown;
      hint?: string;
    };

    const required = clean(parsed.required_elements, 3);
    /* A spec with nothing required would accept anything — worse than the
       generic fallback, so treat it as a failed generation. */
    if (required.length === 0) throw new Error("model returned no required elements");

    return NextResponse.json({
      ok: true,
      activity_category: "other",
      activity_label: (parsed.activity_label ?? customText).slice(0, 80),
      custom_activity: customText,
      required_elements: required,
      optional_elements: clean(parsed.optional_elements, 4),
      reject_if: clean(parsed.reject_if, 3),
      participant_hint: (parsed.hint ?? fallbackSpec(customText).hint).slice(0, 300),
      generated_by: "ai",
    });
  } catch (err) {
    console.error("[proof/requirements]", err);
    const spec = fallbackSpec(customText);
    return NextResponse.json({
      ok: true,
      activity_category: "other",
      activity_label: customText,
      custom_activity: customText,
      required_elements: spec.required,
      optional_elements: spec.optional,
      reject_if: spec.rejectIf,
      participant_hint: spec.hint,
      generated_by: "template",
      note: "Couldn't reach the AI just now, so these are generic. You can edit them.",
    });
  }
}
