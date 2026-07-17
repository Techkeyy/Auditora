import { chat } from "./gateway";
import { challengerSystemPrompt, challengerUserPrompt } from "./prompts";
import { extractJson, normalizeSeverity } from "./json";
import type {
  AuditorResult,
  CallCost,
  ChallengeVerdict,
  FindingStatus,
  MergedFinding,
} from "./types";

interface ChallengerOut {
  headline?: string;
  findings?: Array<Record<string, unknown>>;
}

function normalizeVerdict(v: unknown): ChallengeVerdict {
  const s = String(v ?? "").toLowerCase();
  if (s === "upheld" || s === "uphold" || s === "confirmed") return "upheld";
  if (s === "rejected" || s === "reject" || s === "false-positive") return "rejected";
  return "disputed";
}

/** The Judge: a finding's status follows DETERMINISTICALLY from the Challenger's
 *  verdict. Prose never sets status — this is the anti-inflation rail. */
function statusOf(verdict: ChallengeVerdict): FindingStatus {
  if (verdict === "upheld") return "confirmed";
  if (verdict === "rejected") return "dismissed";
  return "contested";
}

/**
 * Convene the adversarial half of the board: the Challenger merges the auditor
 * findings, attacks each, and may add misses; the Judge then assigns a
 * deterministic status. `code` and `context` (recon) let the Challenger verify
 * reachability instead of just reshuffling words.
 */
export async function adjudicate(
  challengerModel: string,
  auditors: AuditorResult[],
  code: string,
  context?: string
): Promise<{ findings: MergedFinding[]; headline: string; cost: CallCost }> {
  const contributing = auditors.filter((a) => !a.error);
  const validModelIds = new Set(contributing.map((a) => a.model));

  const reports = contributing.map((a) => ({
    model: a.model,
    findings: a.findings,
  }));

  const { content, cost } = await chat(
    challengerModel,
    [
      { role: "system", content: challengerSystemPrompt() },
      { role: "user", content: challengerUserPrompt(reports, code, context) },
    ],
    { temperature: 0, maxTokens: 12000 }
  );

  const parsed = extractJson<ChallengerOut>(content) ?? {};
  const list = Array.isArray(parsed.findings) ? parsed.findings : [];

  const findings: MergedFinding[] = list.map((f, i) => {
    const claimedRaw = Array.isArray(f.auditorsClaimed) ? f.auditorsClaimed : [];
    const auditorsClaimed = Array.from(
      new Set(claimedRaw.map(String).filter((m) => validModelIds.has(m)))
    );
    const origin =
      String(f.origin ?? "").toLowerCase() === "challenger" ||
      auditorsClaimed.length === 0
        ? "challenger"
        : "auditor";
    const verdict = normalizeVerdict(f.verdict);
    return {
      id: `F-${String(i + 1).padStart(2, "0")}`,
      title: String(f.title ?? "Untitled finding").trim(),
      severity: normalizeSeverity(f.severity),
      location: String(f.location ?? "—").trim(),
      description: String(f.description ?? "").trim(),
      recommendation: String(f.recommendation ?? "").trim(),
      origin,
      auditorsClaimed,
      challenge: {
        verdict,
        rationale: String(f.rationale ?? "").trim(),
      },
      status: statusOf(verdict),
    };
  });

  // Sort: severity first, then status (confirmed → contested → dismissed).
  const sev = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  const st = { confirmed: 0, contested: 1, dismissed: 2 } as const;
  findings.sort(
    (a, b) => sev[a.severity] - sev[b.severity] || st[a.status] - st[b.status]
  );

  return {
    findings,
    headline: String(parsed.headline ?? "Review complete.").trim(),
    cost,
  };
}
