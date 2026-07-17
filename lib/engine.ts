import { hasKey } from "./gateway";
import { runAuditors } from "./auditors";
import { adjudicate } from "./consensus";
import { resolveContractInput, isAddress } from "./resolve";
import { runRecon, reconPromptBlock } from "./recon";
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
    process.env.AUDITORA_AUDITORS ||
    "openai/gpt-4.1,google/gemini-2.5-pro,deepseek/deepseek-chat"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The Challenger — the adversary that stress-tests the auditors' findings. */
function challengerModel(): string {
  return (
    process.env.AUDITORA_CHALLENGER ||
    process.env.AUDITORA_REFEREE ||
    "qwen/qwen3-max"
  );
}

function receiptFrom(costs: CallCost[]) {
  return {
    calls: costs.length,
    totalUsd: costs.reduce((a, c) => a + (c.usd || 0), 0),
    promptTokens: costs.reduce((a, c) => a + (c.promptTokens || 0), 0),
    completionTokens: costs.reduce((a, c) => a + (c.completionTokens || 0), 0),
    estimated: costs.some((c) => c.estimated),
  };
}

/** Mock receipt models a typical real run so the demo numbers are plausible. */
function mockReceipt() {
  return {
    calls: 4,
    totalUsd: 0.0412,
    promptTokens: 9834,
    completionTokens: 3187,
    estimated: true,
  };
}

function forceMock(): boolean {
  return process.env.AUDITORA_FORCE_MOCK === "1";
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
  const confirmed = findings.filter((f) => f.status === "confirmed").length;
  const contested = findings.filter((f) => f.status === "contested").length;

  if (confirmed === 0) {
    if (contested === 0) {
      return {
        level: "clean",
        line: "Nothing survived challenge — every proposed finding was rejected by the Challenger. Not a proof of safety.",
      };
    }
    return {
      level: "no-consensus",
      line: `No confirmed issues. ${contested} finding${contested === 1 ? "" : "s"} the Challenger could not fully rule out — treat as leads to check, not confirmed bugs.`,
    };
  }
  return {
    level: "corroborated",
    line: `${confirmed} finding${confirmed === 1 ? "" : "s"} survived adversarial challenge${
      contested ? `, plus ${contested} disputed to review` : ""
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
  const referee = challengerModel();

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
  // For contract mode with a bare address, the agent first runs on-chain recon:
  // it learns who controls the code, what it holds, and — for a proxy — where the
  // real logic lives. The audit then targets the implementation, and the recon
  // evidence is handed to the board so severity reflects live exploitability.
  let auditInput = input;
  let source: SourceMeta = { kind: "inline" };
  let recon: Awaited<ReturnType<typeof runRecon>> | undefined;
  let reconContext: string | undefined;

  if (mode === "contract") {
    if (isAddress(input)) {
      try {
        recon = await runRecon(input);
        reconContext = reconPromptBlock(recon);
      } catch {
        // recon is best-effort — a failure never blocks the audit
      }
    }
    // Audit the implementation behind a proxy, not the empty proxy shell.
    const codeTarget =
      recon?.isProxy && recon.implementation ? recon.implementation : input;
    const resolved = await resolveContractInput(codeTarget);
    auditInput = resolved.input;
    source = resolved.source;
    if (recon?.isProxy && recon.implementation) {
      source = { ...source, note: `${source.note ?? ""} (proxy at ${recon.address} → implementation ${recon.implementation})`.trim() };
    }

    // Short-circuit: if the address has no code, there is nothing to audit.
    // Don't spend model calls or print a "verdict" on an empty EOA / wrong-network
    // address — stop at recon and say so plainly.
    if (isAddress(input) && recon && !recon.isContract) {
      return {
        mode,
        headline: "No contract code at this address — nothing to audit.",
        posture: {
          level: "clean",
          line: `No code found at ${recon.address} on ${recon.chainName}. It may be a wallet (EOA), self-destructed, or deployed on the other Monad network — the review board was not run.`,
        },
        findings: [],
        auditors: [],
        receipt: receiptFrom([]),
        meta: {
          durationMs: Date.now() - started,
          usedMock: false,
          refereeModel: referee,
          bytecodeMode: false,
          source,
          recon,
        },
      };
    }
  }

  const models = auditorModels();
  const auditors = await runAuditors(models, mode, auditInput, reconContext);

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
        recon,
      },
    };
  }

  const { findings, headline, cost: refCost } = await adjudicate(
    referee,
    auditors,
    auditInput,
    reconContext
  );

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
      recon,
    },
  };
}
