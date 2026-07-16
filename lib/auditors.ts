import { chat, providerOf } from "./gateway";
import { auditorSystemPrompt, auditorUserPrompt } from "./prompts";
import { extractJson, normalizeSeverity, salvageFindings } from "./json";
import type { AuditorResult, Mode, RawFinding } from "./types";

function coerceFindings(raw: string): RawFinding[] {
  const parsed = extractJson<{ findings?: unknown[] }>(raw);
  let list = Array.isArray(parsed?.findings) ? parsed!.findings : [];
  // If clean parsing yielded nothing but the raw text clearly held findings,
  // the response was likely truncated — salvage the complete ones.
  if (list.length === 0) {
    const salvaged = salvageFindings(raw);
    if (salvaged.length) list = salvaged;
  }
  return list.map((f) => {
    const o = (f ?? {}) as Record<string, unknown>;
    return {
      title: String(o.title ?? "Untitled finding").trim(),
      severity: normalizeSeverity(o.severity),
      location: String(o.location ?? "—").trim(),
      description: String(o.description ?? "").trim(),
      recommendation: String(o.recommendation ?? "").trim(),
    };
  });
}

/** Fan the same input out to every auditor in parallel; one failure never kills the run. */
export async function runAuditors(
  models: string[],
  mode: Mode,
  input: string
): Promise<AuditorResult[]> {
  const system = auditorSystemPrompt(mode);
  const user = auditorUserPrompt(mode, input);

  const settled = await Promise.allSettled(
    models.map((model) =>
      chat(
        model,
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // Generous budget: reasoning models spend tokens thinking before they
        // emit, so a small cap truncates the findings JSON on large contracts.
        { temperature: 0.1, maxTokens: 12000 }
      )
    )
  );

  return settled.map((res, i) => {
    const model = models[i];
    const provider = providerOf(model);
    if (res.status === "fulfilled") {
      return {
        model,
        provider,
        findings: coerceFindings(res.value.content),
        raw: res.value.content,
        cost: res.value.cost,
      };
    }
    return {
      model,
      provider,
      findings: [],
      raw: "",
      error: res.reason?.message ?? String(res.reason),
    };
  });
}
