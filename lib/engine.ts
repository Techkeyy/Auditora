import { hasKey } from "./gateway";
import { runAuditors } from "./auditors";
import { reconcile } from "./consensus";
import { resolveContractInput } from "./resolve";
import { mockAuditors, mockMerged } from "./mock";
import type {
  AuditResult,
  CallCost,
  Mode,
  MergedFinding,
  Posture,
  SourceMeta,
} from "./types";

function auditorModels(): string[] {
  return (
    process.env.ARGUS_AUDITORS ||
    "openai/gpt-4.1,google/gemini-2.5-pro,deepseek/deepseek-chat"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function refereeModel(): string {
  return process.env.ARGUS_REFEREE || "qwen/qwen3-max";
}

function receiptFrom(costs: CallCost[]) {
  return {
    calls: costs.length,
    totalUsd: costs.reduce((a, c) => a + (c.usd || 0), 0),
    promptTokens: costs.reduce((a, c) => a + (c.promptTokens || 0), 0),
    completionTokens: costs.reduce((a, c) => a + (c.completionTokens || 0), 0),
  };
}

/** Mock receipt models a typical real run so the demo numbers are plausible. */
function mockReceipt() {
  return {
    calls: 4,
    totalUsd: 0.0412,
    promptTokens: 9834,
    completionTokens: 3187,
  };
}

function forceMock(): boolean {
  return process.env.ARGUS_FORCE_MOCK === "1";
}

/**
 * Honest, data-driven posture — computed from consensus, never from model prose.
 * This is the guard against the failure mode where a lone-model hallucination
 * gets dressed up as an authoritative "critical vulnerability" in the headline.
 */
function computePosture(findings: MergedFinding[]): Posture {
  if (findings.length === 0) {
    return {
      level: "clean",
      line: "No issues surfaced — nothing obvious, but that is not a proof of safety.",
    };
  }
  const corroborated = findings.filter((f) => f.consensus !== "lone");
  const lone = findings.length - corroborated.length;

  if (corroborated.length === 0) {
    return {
      level: "no-consensus",
      line: `No model consensus. All ${lone} flag${lone === 1 ? "" : "s"} come from a single model and are unverified — treat them as leads to check, not confirmed findings.`,
    };
  }
  const c = corroborated.length;
  return {
    level: "corroborated",
    line: `${c} issue${c === 1 ? "" : "s"} corroborated by 2+ auditors${
      lone ? `, plus ${lone} single-model flag${lone === 1 ? "" : "s"} to review` : ""
    }.`,
  };
}

/** Heuristic: a long, unbroken hex string is compiled bytecode, not source. */
function detectBytecode(mode: Mode, input: string): boolean {
  if (mode !== "contract") return false;
  const t = input.trim().replace(/^0x/i, "");
  return t.length > 200 && /^[0-9a-fA-F]+$/.test(t);
}

export async function runAudit(mode: Mode, input: string): Promise<AuditResult> {
  const started = Date.now();
  const referee = refereeModel();

  if (!hasKey() || forceMock()) {
    // MOCK MODE — no API key, or FLEX_FORCE_MOCK=1 (offline / demo-safety switch).
    // Fully wired UI against canned data so a demo never depends on credits/wifi.
    const models = auditorModels();
    const auditors = mockAuditors(models);
    const merged = mockMerged(models);
    return {
      mode,
      headline: merged.headline,
      posture: computePosture(merged.findings),
      findings: merged.findings,
      auditors: auditors.map((a) => ({
        model: a.model,
        provider: a.provider,
        findings: a.findings,
        raw: a.raw,
        costLabel: undefined,
      })),
      receipt: mockReceipt(),
      meta: {
        durationMs: Date.now() - started,
        usedMock: true,
        refereeModel: referee,
        bytecodeMode: detectBytecode(mode, input),
        source: { kind: "inline" },
      },
    };
  }

  // LIVE MODE — real gateway calls.
  // For contract mode, resolve a bare on-chain address to its real code first,
  // so the swarm audits actual source/bytecode instead of model memory.
  let auditInput = input;
  let source: SourceMeta = { kind: "inline" };
  if (mode === "contract") {
    const resolved = await resolveContractInput(input);
    auditInput = resolved.input;
    source = resolved.source;
  }

  const models = auditorModels();
  const auditors = await runAuditors(models, mode, auditInput);

  // If every auditor failed (commonly an out-of-credits gateway), don't call the
  // referee — it would throw the same error and 500 the whole request. Return an
  // honest degraded result so the UI can explain what happened.
  if (!auditors.some((a) => !a.error)) {
    return {
      mode,
      headline: "No auditors completed — the swarm could not run.",
      posture: {
        level: "no-consensus",
        line: "Every auditor call failed, so there is nothing to reconcile — see the errors below (often an out-of-credits gateway).",
      },
      findings: [],
      auditors: auditors.map((a) => ({
        model: a.model,
        provider: a.provider,
        findings: a.findings,
        raw: a.raw,
        error: a.error,
        costLabel: undefined,
      })),
      receipt: receiptFrom([]),
      meta: {
        durationMs: Date.now() - started,
        usedMock: false,
        refereeModel: referee,
        bytecodeMode: detectBytecode(mode, auditInput),
        source,
      },
    };
  }

  const { findings, headline, cost: refCost } = await reconcile(referee, auditors);

  const costs: CallCost[] = [
    ...auditors.map((a) => a.cost).filter((c): c is CallCost => Boolean(c)),
    refCost,
  ];

  return {
    mode,
    headline,
    posture: computePosture(findings),
    findings,
    auditors: auditors.map((a) => ({
      model: a.model,
      provider: a.provider,
      findings: a.findings,
      raw: a.raw,
      error: a.error,
      costLabel: a.cost ? `$${a.cost.usd.toFixed(4)}` : undefined,
    })),
    receipt: receiptFrom(costs),
    meta: {
      durationMs: Date.now() - started,
      usedMock: false,
      refereeModel: referee,
      bytecodeMode: detectBytecode(mode, auditInput),
      source,
    },
  };
}
