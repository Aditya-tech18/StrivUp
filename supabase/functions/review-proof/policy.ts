/** Network failures and these statuses can recover without changing the proof. */
export function isRetryableStatus(status: number): boolean {
  return [408, 425, 429].includes(status) || status >= 500;
}

export interface Verdict { matches: boolean; confidence: number; reasoning: string }

export function parseVerdict(text: string): Verdict | null {
  try {
    const value = JSON.parse(text);
    if (typeof value.matches !== "boolean" || typeof value.confidence !== "number" || !Number.isFinite(value.confidence)) return null;
    return {
      matches: value.matches,
      confidence: Math.max(0, Math.min(1, value.confidence)),
      reasoning: typeof value.reasoning === "string" ? value.reasoning.slice(0, 2000) : "",
    };
  } catch { return null; }
}

export function extractOutputText(payload: unknown): string {
  const data = payload as { outputs?: { type?: string; text?: string }[]; steps?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  if (Array.isArray(data?.outputs)) return data.outputs.filter(p => p.type === "text").map(p => p.text ?? "").join("");
  return (data?.steps ?? []).filter(s => s.type === "model_output").flatMap(s => s.content ?? []).filter(p => p.type === "text").map(p => p.text ?? "").join("");
}
