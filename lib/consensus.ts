import { chat } from "./gateway";
import { refereeSystemPrompt, refereeUserPrompt } from "./prompts";
import { extractJson, normalizeSeverity } from "./json";
import type {
  AuditorResult,
  CallCost,
  Consensus,
  MergedFinding,
} from "./types";

interface RefereeOut {
  headline?: string;
  findings?: Array<Record<string, unknown>>;
}

function consensusOf(agreed: number, total: number): Consensus {
  // Corroboration REQUIRES at least two independent auditors — a lone flag is
  // never "confirmed", even in a degraded run where only one auditor completed
  // (total === 1). Otherwise a single model could self-certify as consensus.
  if (agreed < 2) return "lone";
  if (agreed >= total) return "confirmed"; // everyone who ran agreed
  return "contested";
}

/**
 * Ask the referee to merge duplicate findings across auditors, then compute the
 * agreement level for each. Returns the merged findings + a one-line headline.
 */
export async function reconcile(
  refereeModel: string,
  auditors: AuditorResult[]
): Promise<{ findings: MergedFinding[]; headline: string; cost: CallCost }> {
  const contributing = auditors.filter((a) => !a.error);
  const totalModels = contributing.length || auditors.length;
  const validModelIds = new Set(contributing.map((a) => a.model));

  const reports = contributing.map((a) => ({
    model: a.model,
    findings: a.findings,
  }));

  const { content, cost } = await chat(
    refereeModel,
    [
      { role: "system", content: refereeSystemPrompt() },
      { role: "user", content: refereeUserPrompt(reports) },
    ],
    { temperature: 0, maxTokens: 12000 }
  );

  const parsed = extractJson<RefereeOut>(content) ?? {};
  const list = Array.isArray(parsed.findings) ? parsed.findings : [];

  const findings: MergedFinding[] = list.map((f, i) => {
    const agreedRaw = Array.isArray(f.modelsAgreed) ? f.modelsAgreed : [];
    // Keep only auditor ids that actually ran, dedupe.
    const modelsAgreed = Array.from(
      new Set(agreedRaw.map(String).filter((m) => validModelIds.has(m)))
    );
    const agreed = modelsAgreed.length || 1;
    return {
      id: `F-${String(i + 1).padStart(2, "0")}`,
      title: String(f.title ?? "Untitled finding").trim(),
      severity: normalizeSeverity(f.severity),
      location: String(f.location ?? "—").trim(),
      description: String(f.description ?? "").trim(),
      recommendation: String(f.recommendation ?? "").trim(),
      modelsAgreed,
      modelsTotal: totalModels,
      consensus: consensusOf(agreed, totalModels),
    };
  });

  // Sort: severity first, then by agreement (confirmed on top within severity).
  const sev = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  const con = { confirmed: 0, contested: 1, lone: 2 } as const;
  findings.sort(
    (a, b) =>
      sev[a.severity] - sev[b.severity] ||
      con[a.consensus] - con[b.consensus]
  );

  return {
    findings,
    headline: String(parsed.headline ?? "Audit complete.").trim(),
    cost,
  };
}
