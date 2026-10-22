/**
 * src/lib/strivy/health.ts
 *
 * GET /api/strivy/llm — is the text model usable right now?
 *
 * Signed-in users only. In development it explains what's wrong (no
 * OPENROUTER_API_KEY, key rejected, rate-limited) and checks the key with
 * OpenRouter; in production it only says whether the model is on, without
 * calling OpenRouter. It never returns keys, prompts or user data.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StrivyModelProvider } from "./model";
import type { OpenRouterHealth } from "./openrouter";
import { authorizeStrivyRequest } from "./pipeline";

export interface LlmHealthDeps {
  isEnabled: () => boolean;
  getSupabase: () => Promise<SupabaseClient>;
  getProvider: () => StrivyModelProvider;
  /** Detailed output (development). */
  detailed: () => boolean;
}

function hasHealth(p: StrivyModelProvider): p is StrivyModelProvider & {
  health(force?: boolean): Promise<OpenRouterHealth | { ok: boolean; message: string }>;
} {
  return typeof (p as { health?: unknown }).health === "function";
}

export async function handleLlmHealthRequest(deps: LlmHealthDeps): Promise<Response> {
  try {
    const auth = await authorizeStrivyRequest(deps);
    if (!auth.ok) return auth.response;
    const provider = deps.getProvider();
    if (!provider.enabled || !hasHealth(provider)) {
      return Response.json({
        enabled: false,
        ok: false,
        provider: "none",
        message:
          "The text model is off (no OPENROUTER_API_KEY, or STRIVY_LLM_ENABLED=false). STRIVY uses its built-in replies.",
      });
    }
    const detailed = deps.detailed();
    const health = await provider.health(detailed);
    if (!detailed) return Response.json({ enabled: true, ok: health.ok, provider: provider.name });
    return Response.json({ enabled: true, provider: provider.name, ...health });
  } catch (err) {
    console.error("[strivy] llm health failed", err instanceof Error ? err.name : "error");
    return Response.json(
      { error: "Something went sideways. Try again in a moment." },
      { status: 500 }
    );
  }
}
